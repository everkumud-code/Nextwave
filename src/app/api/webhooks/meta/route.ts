import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { applyPendingProviderReceipts } from "@/lib/queue/provider-receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function constantTimeEqual(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";
  if (!expected) return new Response("Meta webhook verification is not configured.", { status: 503 });
  if (mode !== "subscribe" || !challenge || !constantTimeEqual(token, expected)) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

type MetaStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
};

type MetaChange = {
  value?: {
    metadata?: { phone_number_id?: string };
    statuses?: MetaStatus[];
  };
};

type MetaPayload = {
  entry?: Array<{ changes?: MetaChange[] }>;
};

const transitions: Record<string, { allowedFrom: string[]; timestampField?: "submittedAt" | "deliveredAt" | "readAt" }> = {
  sent: { allowedFrom: ["QUEUED", "SUBMITTED"], timestampField: "submittedAt" },
  delivered: { allowedFrom: ["QUEUED", "SUBMITTED", "SENT"], timestampField: "deliveredAt" },
  read: { allowedFrom: ["QUEUED", "SUBMITTED", "SENT", "DELIVERED"], timestampField: "readAt" },
  failed: { allowedFrom: ["QUEUED", "SUBMITTED", "SENT"] },
};

export async function POST(request: Request) {
  const secret = process.env.META_APP_SECRET ?? "";
  if (!secret) return NextResponse.json({ error: "Meta webhook signing secret is not configured." }, { status: 503 });

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 1024 * 1024) {
    return NextResponse.json({ error: "Webhook payload is too large." }, { status: 413 });
  }
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
  if (!signature || !constantTimeEqual(signature, expected)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let payload: MetaPayload;
  try {
    payload = JSON.parse(rawBody) as MetaPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  let processed = 0;
  let ignored = 0;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) { ignored++; continue; }
      const sender = await prisma.sender.findFirst({
        where: { connector: "META_CLOUD_API", providerAccountRef: phoneNumberId, archivedAt: null },
        select: { id: true, organizationId: true },
      });
      if (!sender) { ignored += change.value?.statuses?.length ?? 1; continue; }

      for (const event of change.value?.statuses ?? []) {
        const providerMessageId = event.id;
        const transition = event.status ? transitions[event.status.toLowerCase()] : undefined;
        if (!providerMessageId || !transition) { ignored++; continue; }
        const timestamp = event.timestamp && /^\d{1,12}$/.test(event.timestamp)
          ? new Date(Number(event.timestamp) * 1000)
          : new Date();
        const status = event.status!.toUpperCase() as "SENT" | "DELIVERED" | "READ" | "FAILED";
        const errorCode = event.errors?.[0]?.code ? String(event.errors[0].code) : null;
        const errorMessage = (event.errors?.[0]?.title || event.errors?.[0]?.message || null)?.slice(0, 500) ?? null;
        await prisma.$transaction(async tx => {
          await tx.providerDeliveryReceipt.upsert({
            where: {
              organizationId_senderId_providerMessageId_status_eventTimestamp: {
                organizationId: sender.organizationId,
                senderId: sender.id,
                providerMessageId,
                status,
                eventTimestamp: timestamp,
              },
            },
            create: {
              organizationId: sender.organizationId,
              senderId: sender.id,
              providerMessageId,
              status,
              eventTimestamp: timestamp,
              errorCode,
              errorMessage,
            },
            update: {},
          });
          await applyPendingProviderReceipts(tx, {
            organizationId: sender.organizationId,
            senderId: sender.id,
            providerMessageId,
          });
        });
        processed++;
      }
    }
  }

  return NextResponse.json({ received: true, processed, ignored });
}
