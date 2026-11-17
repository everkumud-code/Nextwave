import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getQrSessionManager } from "@/lib/sessions/factory";

export const runtime = "nodejs";
export const maxDuration = 30;
type RouteContext = { params: Promise<{ senderId: string }> };

async function getSender(senderId: string, organizationId: string) {
  return prisma.sender.findFirst({
    where: { id: senderId, organizationId, archivedAt: null },
    select: { id: true, connector: true, ownership: true, displayName: true },
  });
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "QR session operation failed.";
  if (message.includes("already has an active")) return NextResponse.json({ error: message }, { status: 409 });
  if (message.includes("not found")) return NextResponse.json({ error: message }, { status: 404 });
  if (message.includes("must be configured")) return NextResponse.json({ error: "QR session service is not configured yet." }, { status: 503 });
  console.error("QR session operation failed", error);
  return NextResponse.json({ error: "QR session service is temporarily unavailable." }, { status: 502 });
}

export async function GET(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to view sender pairing details." }, { status: 403 });
  const { senderId } = await route.params;
  const sender = await getSender(senderId, context.organization.id);
  if (!sender) return NextResponse.json({ error: "Sender not found." }, { status: 404 });
  if (sender.connector !== "QR_SESSION") return NextResponse.json({ error: "This sender does not use the QR session connector." }, { status: 400 });

  const current = await prisma.qrSession.findFirst({
    where: { organizationId: context.organization.id, senderId, activeKey: `${context.organization.id}:${senderId}` },
    orderBy: { updatedAt: "desc" },
  });
  if (!current) {
    const latest = await prisma.qrSession.findFirst({
      where: { organizationId: context.organization.id, senderId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true, connectedAt: true, lastSeenAt: true, lastErrorMessage: true },
    });
    return NextResponse.json({ session: latest });
  }

  try {
    const session = await getQrSessionManager().refresh(context.organization.id, current.id);
    const senderStatus = session.status === "CONNECTED" ? "CONNECTED" : session.status === "RECONNECTING" ? "ATTENTION" : ["ERROR", "REVOKED", "DISCONNECTED"].includes(session.status) ? "DISCONNECTED" : "PENDING";
    await prisma.sender.updateMany({
      where: { id: senderId, organizationId: context.organization.id },
      data: { status: senderStatus, lastConnectedAt: session.connectedAt ? new Date(session.connectedAt) : undefined, lastSeenAt: session.lastSeenAt ? new Date(session.lastSeenAt) : undefined },
    });
    return NextResponse.json({ session });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to connect senders." }, { status: 403 });
  const { senderId } = await route.params;
  const sender = await getSender(senderId, context.organization.id);
  if (!sender) return NextResponse.json({ error: "Sender not found." }, { status: 404 });
  if (sender.connector !== "QR_SESSION") return NextResponse.json({ error: "This sender does not use the QR session connector." }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const riskAccepted = body?.acceptRisk === true;
  try {
    const existing = await prisma.qrSession.findFirst({
      where: { organizationId: context.organization.id, senderId, activeKey: `${context.organization.id}:${senderId}` },
      orderBy: { updatedAt: "desc" },
    });
    // A new link is made only after the customer has confirmed, in these words, what it means (recorded in the audit log).
    if (!existing && !riskAccepted) {
      return NextResponse.json({ error: "Confirm the connection terms first: this links the number through linked-device (unofficial) access, which WhatsApp can limit or ban." }, { status: 400 });
    }
    const manager = getQrSessionManager();
    const session = existing
      ? await manager.refresh(context.organization.id, existing.id)
      : await manager.create({
          organizationId: context.organization.id,
          senderId: sender.id,
          ownership: sender.ownership,
        });
    const senderStatus = session.status === "CONNECTED" ? "CONNECTED" : ["ERROR", "REVOKED", "DISCONNECTED"].includes(session.status) ? "DISCONNECTED" : "PENDING";
    await prisma.$transaction([
      prisma.sender.updateMany({
        where: { id: senderId, organizationId: context.organization.id },
        data: {
          status: senderStatus,
          lastConnectedAt: session.connectedAt ? new Date(session.connectedAt) : undefined,
          lastSeenAt: session.lastSeenAt ? new Date(session.lastSeenAt) : undefined,
        },
      }),
      prisma.auditLog.create({
        data: {
          organizationId: context.organization.id,
          actorUserId: context.user.id,
          action: existing ? "sender.qr_session_refreshed" : "sender.qr_session_started",
          resourceType: "QrSession",
          resourceId: session.id,
          metadata: { senderId, ...(riskAccepted ? { unofficialAccessRiskAcceptedAt: new Date().toISOString() } : {}) },
        },
      }),
    ]);
    return NextResponse.json({ session }, { status: existing ? 200 : 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to disconnect senders." }, { status: 403 });
  const { senderId } = await route.params;
  const sender = await getSender(senderId, context.organization.id);
  if (!sender) return NextResponse.json({ error: "Sender not found." }, { status: 404 });

  const current = await prisma.qrSession.findFirst({
    where: { organizationId: context.organization.id, senderId, activeKey: `${context.organization.id}:${senderId}` },
    orderBy: { updatedAt: "desc" },
  });
  if (!current) return NextResponse.json({ error: "No active QR session exists for this sender." }, { status: 404 });

  try {
    const session = await getQrSessionManager().revoke(context.organization.id, current.id);
    await prisma.$transaction([
      prisma.sender.updateMany({ where: { id: senderId, organizationId: context.organization.id }, data: { status: "DISCONNECTED" } }),
      prisma.auditLog.create({
        data: {
          organizationId: context.organization.id,
          actorUserId: context.user.id,
          action: "sender.qr_session_revoked",
          resourceType: "QrSession",
          resourceId: session.id,
          metadata: { senderId },
        },
      }),
    ]);
    return NextResponse.json({ session });
  } catch (error) {
    return errorResponse(error);
  }
}
