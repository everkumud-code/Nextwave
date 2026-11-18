import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthContext, isPlatformAdminUser } from "@/lib/auth";
import { issueInvoice } from "@/lib/invoices";

export const runtime = "nodejs";


export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!isPlatformAdminUser(context.user)) return NextResponse.json({ error: "Platform admin access required." }, { status: 403 });

  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, clientCode: true, name: true, slug: true, status: true, createdAt: true,
      memberships: { where: { role: "OWNER" }, take: 1, orderBy: { createdAt: "asc" }, select: { user: { select: { name: true, email: true } } } },
      creditAccount: { select: { balancePaise: true, pricePerMessagePaise: true, defaultIntervalSeconds: true, updatedAt: true } },
      senders: { where: { archivedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, displayName: true, phoneNumberE164: true, status: true, dailyLimitOverride: true } },
    },
  });
  return NextResponse.json({ organizations });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!isPlatformAdminUser(context.user)) return NextResponse.json({ error: "Platform admin access required." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const amountPaise = body.amountPaise === undefined ? 0 : Number(body.amountPaise);
  const pricePerMessagePaise = body.pricePerMessagePaise === undefined ? undefined : Number(body.pricePerMessagePaise);
  if (!organizationId || !Number.isSafeInteger(amountPaise) || amountPaise < 0 || amountPaise > 2_000_000_000 ||
      (pricePerMessagePaise !== undefined && (!Number.isSafeInteger(pricePerMessagePaise) || pricePerMessagePaise < 1 || pricePerMessagePaise > 100_000))) {
    return NextResponse.json({ error: "Provide a valid client, non-negative top-up amount in paise, and optional per-message rate in paise." }, { status: 400 });
  }

  // A manual deduction: takes credit off the wallet, always with a reason, never below zero, and it is written in the ledger and the audit log.
  if (body.deductPaise !== undefined) {
    const deductPaise = Number(body.deductPaise);
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 240) : "";
    if (!Number.isSafeInteger(deductPaise) || deductPaise < 1 || deductPaise > 2_000_000_000 || amountPaise > 0 || reason.length < 3) {
      return NextResponse.json({ error: "Enter the amount to deduct and a reason (at least 3 characters). Top up and deduct are separate actions." }, { status: 400 });
    }
    try {
      const outcome = await prisma.$transaction(async tx => {
        const account = await tx.creditAccount.findUnique({ where: { organizationId } });
        if (!account) return { error: "This workspace has no wallet yet.", status: 404 as const };
        const taken = await tx.creditAccount.updateMany({ where: { id: account.id, balancePaise: { gte: deductPaise } }, data: { balancePaise: { decrement: deductPaise } } });
        if (!taken.count) return { error: `The wallet holds only ${(account.balancePaise / 100).toFixed(2)} rupees; you cannot deduct more than that.`, status: 409 as const };
        const balanceAfterPaise = account.balancePaise - deductPaise;
        await tx.creditTransaction.create({
          data: {
            organizationId, accountId: account.id, type: "DEBIT", amountPaise: deductPaise, balanceAfterPaise,
            reference: "manual-deduction", description: `Manual deduction by admin: ${reason}`, actorUserId: context.user.id,
          },
        });
        await tx.auditLog.create({
          data: { organizationId, actorUserId: context.user.id, action: "credits.admin_deduction", resourceType: "CreditAccount", resourceId: account.id, metadata: { deductPaise, reason, balanceAfterPaise } },
        });
        return { balancePaise: balanceAfterPaise, pricePerMessagePaise: account.pricePerMessagePaise };
      }, { isolationLevel: "Serializable" });
      if ("error" in outcome) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
      return NextResponse.json({
        account: {
          balancePaise: outcome.balancePaise, balanceRupees: outcome.balancePaise / 100,
          pricePerMessagePaise: outcome.pricePerMessagePaise, pricePerMessageRupees: outcome.pricePerMessagePaise / 100,
        },
      });
    } catch (error) {
      console.error("Admin credit deduction failed", error);
      return NextResponse.json({ error: "Unable to deduct credit." }, { status: 500 });
    }
  }

  try {
    const result = await prisma.$transaction(async tx => {
      const organization = await tx.organization.findUnique({ where: { id: organizationId }, select: { id: true } });
      if (!organization) return null;
      const account = await tx.creditAccount.upsert({
        where: { organizationId },
        create: { organizationId },
        update: {},
      });
      if (account.balancePaise + amountPaise > 2_000_000_000) {
        throw new Error("CREDIT_BALANCE_LIMIT");
      }
      const updated = amountPaise > 0
        ? await tx.creditAccount.update({ where: { id: account.id }, data: { balancePaise: { increment: amountPaise }, ...(pricePerMessagePaise === undefined ? {} : { pricePerMessagePaise }) } })
        : await tx.creditAccount.update({ where: { id: account.id }, data: pricePerMessagePaise === undefined ? {} : { pricePerMessagePaise } });
      if (amountPaise > 0) {
        await tx.creditTransaction.create({
          data: {
            organizationId, accountId: account.id, type: "CREDIT", amountPaise,
            balanceAfterPaise: updated.balancePaise, actorUserId: context.user.id,
            description: typeof body.description === "string" ? body.description.slice(0, 240) : "Admin prepaid credit allocation",
          },
        });
        // every top-up gets an invoice number of its own (BPML/<year>/NR<n>/INV<n>)
        await issueInvoice(tx, { organizationId, amountPaise, description: typeof body.description === "string" && body.description.trim() ? body.description.trim() : "Prepaid WhatsApp credit" });
      }
      await tx.auditLog.create({
        data: {
          organizationId, actorUserId: context.user.id,
          action: amountPaise > 0 ? "credits.admin_topup" : "credits.admin_rate_updated",
          resourceType: "CreditAccount", resourceId: account.id,
          metadata: { amountPaise, pricePerMessagePaise: pricePerMessagePaise ?? updated.pricePerMessagePaise },
        },
      });
      return updated;
    }, { isolationLevel: "Serializable" });

    if (!result) return NextResponse.json({ error: "Client workspace not found." }, { status: 404 });
    return NextResponse.json({
      account: {
        balancePaise: result.balancePaise,
        balanceRupees: result.balancePaise / 100,
        pricePerMessagePaise: result.pricePerMessagePaise,
        pricePerMessageRupees: result.pricePerMessagePaise / 100,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CREDIT_BALANCE_LIMIT") return NextResponse.json({ error: "This top-up would exceed the wallet balance limit." }, { status: 400 });
    console.error("Admin credit update failed", error);
    return NextResponse.json({ error: "Unable to update client credits or pricing." }, { status: 500 });
  }
}
