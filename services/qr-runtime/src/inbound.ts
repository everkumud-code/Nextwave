import type { PrismaClient } from "@prisma/client";

type WaMessage = {
  conversation?: string | null;
  extendedTextMessage?: { text?: string | null } | null;
  imageMessage?: { caption?: string | null } | null;
  videoMessage?: { caption?: string | null } | null;
  documentMessage?: { caption?: string | null; fileName?: string | null } | null;
  audioMessage?: unknown;
  stickerMessage?: unknown;
  locationMessage?: unknown;
  contactMessage?: unknown;
  buttonsResponseMessage?: { selectedDisplayText?: string | null } | null;
  listResponseMessage?: { title?: string | null } | null;
  templateButtonReplyMessage?: { selectedDisplayText?: string | null } | null;
} | null | undefined;

/** The words of a reply, or a short marker such as "[photo]" when the customer sent a file. */
export function describeInbound(message: WaMessage): string | null {
  if (!message) return null;
  const text = message.conversation ?? message.extendedTextMessage?.text
    ?? message.buttonsResponseMessage?.selectedDisplayText ?? message.listResponseMessage?.title ?? message.templateButtonReplyMessage?.selectedDisplayText;
  if (text && text.trim()) return text.trim().slice(0, 2000);
  if (message.imageMessage) return message.imageMessage.caption?.trim() ? `[photo] ${message.imageMessage.caption.trim()}`.slice(0, 2000) : "[photo]";
  if (message.videoMessage) return message.videoMessage.caption?.trim() ? `[video] ${message.videoMessage.caption.trim()}`.slice(0, 2000) : "[video]";
  if (message.documentMessage) return `[document] ${message.documentMessage.fileName ?? message.documentMessage.caption ?? ""}`.trim().slice(0, 2000);
  if (message.audioMessage) return "[voice message]";
  if (message.stickerMessage) return "[sticker]";
  if (message.locationMessage) return "[location]";
  if (message.contactMessage) return "[contact card]";
  return null;
}

/** Keeps a reply in the workspace's inbox (once per WhatsApp message id). */
export async function recordInbound(
  prisma: PrismaClient,
  input: { organizationId: string; senderId: string; fromE164: string; body: string; providerMessageId: string; isOptOut: boolean },
): Promise<boolean> {
  const contact = await prisma.contact.findFirst({ where: { organizationId: input.organizationId, phoneNumberE164: input.fromE164 }, select: { id: true } });
  const created = await prisma.inboundMessage.createMany({
    data: [{ ...input, contactId: contact?.id ?? null }],
    skipDuplicates: true,
  });
  return created.count > 0;
}
