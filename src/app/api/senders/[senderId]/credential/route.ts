import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { GraphRequestError, getPhoneInfo, mapGraphError } from "@/lib/connectors/meta-cloud/graph";
import { encryptSecret, secretBoxAvailable } from "@/lib/secret-box";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ senderId: string }> };

/** Replace the access token of an official sender (Meta tokens can expire). The new token is checked with Meta first. */
export async function PUT(request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to manage senders." }, { status: 403 });
  if (!secretBoxAvailable()) return NextResponse.json({ error: "The server has no encryption key, so the token cannot be stored safely." }, { status: 503 });
  const { senderId } = await route.params;
  const body = await request.json().catch(() => ({}));
  const token = typeof body?.accessToken === "string" ? body.accessToken.trim() : "";
  if (token.length < 20 || token.length > 1000) return NextResponse.json({ error: "Enter the new access token from Meta." }, { status: 400 });
  const sender = await prisma.sender.findFirst({ where: { id: senderId, organizationId: context.organization.id, connector: "META_CLOUD_API", archivedAt: null }, select: { id: true, providerAccountRef: true } });
  if (!sender?.providerAccountRef) return NextResponse.json({ error: "Official sender not found." }, { status: 404 });
  try {
    await getPhoneInfo(token, sender.providerAccountRef);
  } catch (error) {
    const message = error instanceof GraphRequestError ? mapGraphError(error.detail).errorMessage : "Meta could not be reached.";
    return NextResponse.json({ error: `Meta did not accept this token: ${message}` }, { status: 400 });
  }
  await prisma.$transaction([
    prisma.providerCredential.update({ where: { senderId: sender.id }, data: { accessTokenEnc: encryptSecret(token) } }),
    prisma.sender.update({ where: { id: sender.id }, data: { status: "CONNECTED", lastConnectedAt: new Date() } }),
    prisma.auditLog.create({ data: { organizationId: context.organization.id, actorUserId: context.user.id, action: "sender.token_replaced", resourceType: "Sender", resourceId: sender.id } }),
  ]);
  return NextResponse.json({ ok: true });
}
