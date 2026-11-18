import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { getAuthContext, isPlatformAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { nextClientCode } from "@/lib/ids";
import { issueInvoice } from "@/lib/invoices";

export const runtime = "nodejs";

function slugify(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36);
}

/**
 * The platform admin adds a new client: a workspace with its own client number (BPML/<year>/NR<n>), its owner's login,
 * a wallet, the per-message rate and, if wished, the first credit (with an invoice).
 */
export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!isPlatformAdminUser(context.user)) return NextResponse.json({ error: "Platform admin access required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const organizationName = typeof body?.organizationName === "string" ? body.organizationName.trim().slice(0, 100) : "";
  const ownerName = typeof body?.ownerName === "string" ? body.ownerName.trim().slice(0, 80) : "";
  const email = typeof body?.ownerEmail === "string" ? body.ownerEmail.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const initialCreditPaise = body?.initialCreditRupees === undefined || body?.initialCreditRupees === "" ? 0 : Math.round(Number(body.initialCreditRupees) * 100);
  const pricePerMessagePaise = body?.pricePerMessagePaise === undefined || body?.pricePerMessagePaise === "" ? 10 : Number(body.pricePerMessagePaise);
  if (!organizationName || !ownerName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10 || password.length > 128) {
    return NextResponse.json({ error: "Enter the client's business name, the owner's name and e-mail, and a first password of at least 10 characters." }, { status: 400 });
  }
  if (!Number.isSafeInteger(initialCreditPaise) || initialCreditPaise < 0 || initialCreditPaise > 2_000_000_000 || !Number.isSafeInteger(pricePerMessagePaise) || pricePerMessagePaise < 1 || pricePerMessagePaise > 100_000) {
    return NextResponse.json({ error: "Check the first credit and the per-message rate." }, { status: 400 });
  }
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return NextResponse.json({ error: "This e-mail already has an account. Use a different e-mail for the new client's owner." }, { status: 409 });
  }
  const passwordHash = await hash(password, 12);
  const slug = `${slugify(organizationName) || "workspace"}-${crypto.randomUUID().slice(0, 8)}`;
  const client = await prisma.$transaction(async tx => {
    const user = await tx.user.create({ data: { name: ownerName, email, passwordHash, emailVerified: new Date() }, select: { id: true } });
    const organization = await tx.organization.create({ data: { name: organizationName, slug, clientCode: await nextClientCode(tx) }, select: { id: true, clientCode: true } });
    const account = await tx.creditAccount.create({ data: { organizationId: organization.id, pricePerMessagePaise, balancePaise: initialCreditPaise } });
    await tx.membership.create({ data: { userId: user.id, organizationId: organization.id, role: "OWNER", joinedAt: new Date() } });
    if (initialCreditPaise > 0) {
      await tx.creditTransaction.create({
        data: { organizationId: organization.id, accountId: account.id, type: "CREDIT", amountPaise: initialCreditPaise, balanceAfterPaise: initialCreditPaise, actorUserId: context.user.id, description: "Opening credit when the client was added" },
      });
      await issueInvoice(tx, { organizationId: organization.id, amountPaise: initialCreditPaise, description: "Opening prepaid WhatsApp credit" });
    }
    await tx.auditLog.create({ data: { organizationId: organization.id, actorUserId: context.user.id, action: "admin.client_added", resourceType: "Organization", resourceId: organization.id, metadata: { clientCode: organization.clientCode, ownerEmail: email, initialCreditPaise, pricePerMessagePaise } } });
    return organization;
  });
  return NextResponse.json({ client: { id: client.id, clientCode: client.clientCode, organizationName, ownerEmail: email } }, { status: 201 });
}
