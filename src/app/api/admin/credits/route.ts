import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

async function isPlatformAdmin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isPlatformAdmin: true } });
  return user?.isPlatformAdmin === true;
}

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!(await isPlatformAdmin(context.user.id))) return NextResponse.json({ error: "Platform admin access required." }, { status: 403 });

  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, slug: true, status: true, createdAt: true,
      creditAccount: { select: { balancePaise: true, pricePerMessagePaise: true, defaultIntervalSeconds: true, updatedAt: true } },
    },
  });
  return NextResponse.json({ organizations });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!(await isPlatformAdmin(context.user.id))) return NextResponse.json({ error: "Platform admin access required." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const amountPaise = body.amountPaise === undefined ? 0 : Number(body.amountPaise);
  const pricePerMessagePaise = body.pricePerMessagePaise === undefined ? undefined : Number(body.pricePerMessagePaise);
  if (!organizationId || !Number.isSafeInteger(amountPaise) || amountPaise < 0 || amountPaise > 2_000_000_000 ||
      (pricePerMessagePaise !== undefined && (!Number.isSafeInteger(pricePerMessagePaise) || pricePerMessagePaise < 1 || pricePerMessagePaise > 100_000))) {
    return NextResponse.json({ error: "Provide a valid client, non-negative top-up amount in paise, and optional per-message rate in paise." }, { status: 400 });
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
    console.error("Admin credit update failed", error);
    return NextResponse.json({ error: "Unable to update client credits or pricing." }, { status: 500 });
  }
}
