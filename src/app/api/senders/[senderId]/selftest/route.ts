import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { selfTestPdf, selfTestPng } from "@/lib/selftest-files";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ senderId: string }> };

async function asset(organizationId: string, userId: string, kind: "IMAGE" | "DOCUMENT", mimeType: string, filename: string, bytes: Buffer) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const existing = await prisma.mediaAsset.findFirst({ where: { organizationId, sha256 }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.mediaAsset.create({ data: { organizationId, kind, mimeType, sizeBytes: bytes.length, sha256, filename, data: new Uint8Array(bytes), createdByUserId: userId }, select: { id: true } });
  return created.id;
}

/**
 * A delivery self-test for one connected number: a text, a picture, a PDF and a map pin are sent to the number's OWN chat
 * ("Message yourself"), free of charge, never to anyone else. The sending worker delivers them; the screen follows their status.
 */
export async function POST(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to test senders." }, { status: 403 });
  const { senderId } = await route.params;
  const organizationId = context.organization.id;
  const sender = await prisma.sender.findFirst({ where: { id: senderId, organizationId, connector: "QR_SESSION", archivedAt: null }, select: { id: true, status: true, phoneNumberE164: true } });
  if (!sender) return NextResponse.json({ error: "Sender not found." }, { status: 404 });
  if (sender.status !== "CONNECTED") return NextResponse.json({ error: "Connect this number first (scan the QR code), then run the test." }, { status: 409 });
  const recent = await prisma.message.count({ where: { organizationId, senderId, kind: "TEST", createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (recent >= 12) return NextResponse.json({ error: "Several tests were sent in the last hour. Try again a little later." }, { status: 429 });

  const [imageId, pdfId] = await Promise.all([
    asset(organizationId, context.user.id, "IMAGE", "image/png", "nextwave-test-picture.png", selfTestPng()),
    selfTestPdf().then(bytes => asset(organizationId, context.user.id, "DOCUMENT", "application/pdf", "nextwave-test-file.pdf", bytes)),
  ]);
  const run = randomUUID();
  const now = Date.now();
  const plan = [
    { label: "Text", body: "NextWave delivery test 1 of 4: this text arrived.", mediaAssetId: null as string | null, locationJson: null as null | { lat: number; lng: number; name: string; address: string } },
    { label: "Picture", body: "NextWave delivery test 2 of 4: this picture arrived.", mediaAssetId: imageId, locationJson: null },
    { label: "PDF file", body: "NextWave delivery test 3 of 4: this PDF arrived.", mediaAssetId: pdfId, locationJson: null },
    { label: "Location", body: "", mediaAssetId: null, locationJson: { lat: 23.3441, lng: 85.3096, name: "NextWave test pin", address: "Ranchi, Jharkhand" } },
  ];
  const messages = [];
  for (const [index, item] of plan.entries()) {
    const message = await prisma.message.create({
      data: {
        organizationId, campaignId: null, senderId, recipientE164: sender.phoneNumberE164, body: item.body || null,
        mediaAssetId: item.mediaAssetId, ...(item.locationJson ? { locationJson: item.locationJson } : {}),
        kind: "TEST", status: "QUEUED", idempotencyKey: `test:selftest:${run}:${index}`, chargePaise: 0,
        nextAttemptAt: new Date(now + index * 8000),
      },
      select: { id: true },
    });
    messages.push({ id: message.id, label: item.label });
  }
  await prisma.auditLog.create({ data: { organizationId, actorUserId: context.user.id, action: "sender.selftest_started", resourceType: "Sender", resourceId: senderId, metadata: { run } } });
  return NextResponse.json({ messages, startedAt: new Date(now).toISOString(), to: sender.phoneNumberE164 }, { status: 202 });
}

/** Status of the self-test messages, and whether a reply to this number has reached the inbox since the test started. */
export async function GET(request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { senderId } = await route.params;
  const organizationId = context.organization.id;
  const url = new URL(request.url);
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 8);
  const since = new Date(url.searchParams.get("since") ?? Date.now());
  const [messages, replies] = await Promise.all([
    prisma.message.findMany({ where: { organizationId, senderId, id: { in: ids }, kind: "TEST" }, select: { id: true, status: true, errorCode: true, errorMessage: true, submittedAt: true, deliveredAt: true, readAt: true } }),
    prisma.inboundMessage.findMany({ where: { organizationId, senderId, receivedAt: { gte: Number.isNaN(since.getTime()) ? new Date() : since } }, orderBy: { receivedAt: "desc" }, take: 3, select: { id: true, fromE164: true, body: true, receivedAt: true } }),
  ]);
  return NextResponse.json({ messages, replies });
}
