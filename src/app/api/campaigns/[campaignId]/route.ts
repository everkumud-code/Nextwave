import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getEligibleWhatsAppMarketingContactIds } from "@/lib/campaign-audience";
import { findUnsupportedTemplateVariables } from "@/lib/message-template";
import { getCustomFieldKeys } from "@/lib/custom-fields";
import { mediaProblem } from "@/lib/media";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ campaignId: string }> };

export async function GET(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { campaignId } = await route.params;
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organization.id },
    select: {
      id: true, campaignCode: true, extraSenderIds: true, name: true, description: true, messageBody: true, status: true, channel: true,
      scheduledAt: true, createdAt: true, updatedAt: true,
      sender: { select: { id: true, displayName: true, phoneNumberE164: true, status: true } },
      mediaAsset: { select: { id: true, kind: true, filename: true, sizeBytes: true } },
      recipients: {
        orderBy: { createdAt: "asc" },
        take: 50000,
        select: {
          id: true, status: true, createdAt: true,
          contact: { select: { id: true, firstName: true, lastName: true, phoneNumberE164: true, status: true } },
        },
      },
      _count: { select: { recipients: true, messages: true } },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  return NextResponse.json({ campaign });
}

export async function PATCH(request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to edit campaigns." }, { status: 403 });
  const { campaignId } = await route.params;
  const existing = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organization.id },
    select: { id: true, status: true, messageBody: true, mediaAssetId: true },
  });
  if (!existing) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (existing.status !== "DRAFT") return NextResponse.json({ error: "Only draft campaigns can be edited." }, { status: 409 });

  try {
    const body = await request.json();
    const data: { name?: string; description?: string | null; messageBody?: string | null; senderId?: string | null; extraSenderIds?: string[]; scheduledAt?: Date | null; mediaAssetId?: string | null } = {};
    let recipientContactIds: string[] | undefined;

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "Campaign name is required." }, { status: 400 });
      data.name = body.name.trim().slice(0, 120);
    }
    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== "string") return NextResponse.json({ error: "Description must be text." }, { status: 400 });
      data.description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) || null : null;
    }
    if (body.messageBody !== undefined) {
      if (body.messageBody !== null && typeof body.messageBody !== "string") return NextResponse.json({ error: "Message content must be text." }, { status: 400 });
      const messageBody = typeof body.messageBody === "string" ? body.messageBody.trim() : "";
      if (messageBody.length > 4096) return NextResponse.json({ error: "Message content must be 4,096 characters or fewer." }, { status: 400 });
      const unsupported = findUnsupportedTemplateVariables(messageBody, await getCustomFieldKeys(context.organization.id));
      if (unsupported.length) return NextResponse.json({ error: `Unsupported template variables: ${unsupported.join(", ")}` }, { status: 400 });
      data.messageBody = messageBody || null;
    }
    if (body.mediaAssetId !== undefined) {
      if (body.mediaAssetId === null || body.mediaAssetId === "") data.mediaAssetId = null;
      else if (typeof body.mediaAssetId === "string") {
        const asset = await prisma.mediaAsset.findFirst({ where: { id: body.mediaAssetId, organizationId: context.organization.id }, select: { id: true } });
        if (!asset) return NextResponse.json({ error: "File not found in this workspace." }, { status: 404 });
        data.mediaAssetId = asset.id;
      } else return NextResponse.json({ error: "Invalid file." }, { status: 400 });
    }
    {
      // what will be sent together: the text after this change and the file after this change
      const nextBody = data.messageBody !== undefined ? data.messageBody : existing.messageBody;
      const nextMediaId = data.mediaAssetId !== undefined ? data.mediaAssetId : existing.mediaAssetId;
      if (nextMediaId) {
        const asset = await prisma.mediaAsset.findFirst({ where: { id: nextMediaId, organizationId: context.organization.id }, select: { kind: true } });
        const problem = mediaProblem(asset?.kind, nextBody);
        if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      }
    }
    if (body.senderId !== undefined) {
      if (body.senderId === null || body.senderId === "") data.senderId = null;
      else if (typeof body.senderId === "string") {
        const sender = await prisma.sender.findFirst({
          where: { id: body.senderId, organizationId: context.organization.id, archivedAt: null, status: "CONNECTED" },
          select: { id: true },
        });
        if (!sender) return NextResponse.json({ error: "Select a connected sender from this workspace." }, { status: 400 });
        data.senderId = sender.id;
      } else return NextResponse.json({ error: "Invalid sender." }, { status: 400 });
    }
    if (body.extraSenderIds !== undefined) {
      if (!Array.isArray(body.extraSenderIds) || body.extraSenderIds.length > 9 || body.extraSenderIds.some((id: unknown) => typeof id !== "string")) {
        return NextResponse.json({ error: "Choose up to 9 more senders." }, { status: 400 });
      }
      const wanted = [...new Set(body.extraSenderIds as string[])].filter(id => id !== (data.senderId ?? null));
      const found = wanted.length ? await prisma.sender.findMany({ where: { id: { in: wanted }, organizationId: context.organization.id, archivedAt: null, status: "CONNECTED" }, select: { id: true } }) : [];
      if (found.length !== wanted.length) return NextResponse.json({ error: "Every extra sender must be a connected sender of this workspace." }, { status: 400 });
      data.extraSenderIds = wanted;
    }
    if (body.scheduledAt !== undefined) {
      if (body.scheduledAt === null || body.scheduledAt === "") data.scheduledAt = null;
      else if (typeof body.scheduledAt === "string") {
        const scheduledAt = new Date(body.scheduledAt);
        if (Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "Enter a valid schedule date and time." }, { status: 400 });
        if (scheduledAt.getTime() <= Date.now()) return NextResponse.json({ error: "Schedule time must be in the future." }, { status: 400 });
        data.scheduledAt = scheduledAt;
      } else return NextResponse.json({ error: "Invalid schedule date and time." }, { status: 400 });
    }
    if (body.recipientContactIds !== undefined) {
      if (!Array.isArray(body.recipientContactIds) || body.recipientContactIds.length > 50000 || body.recipientContactIds.some((id: unknown) => typeof id !== "string")) {
        return NextResponse.json({ error: "Recipient selection must contain up to 50,000 contact IDs." }, { status: 400 });
      }
      recipientContactIds = [...new Set(body.recipientContactIds as string[])];
      const eligibleIds = await getEligibleWhatsAppMarketingContactIds(context.organization.id, 100000);
      const eligible = new Set(eligibleIds);
      if (recipientContactIds.some(id => !eligible.has(id))) {
        return NextResponse.json({ error: "Selected recipients must be active contacts with current WhatsApp marketing consent." }, { status: 400 });
      }
    }

    const campaign = await prisma.$transaction(async tx => {
      const updated = await tx.campaign.update({
        where: { id: existing.id },
        data,
        select: { id: true, name: true, description: true, status: true, senderId: true, scheduledAt: true, updatedAt: true, _count: { select: { recipients: true } } },
      });
      if (recipientContactIds !== undefined) {
        await tx.campaignRecipient.deleteMany({ where: { campaignId: existing.id } });
        if (recipientContactIds.length) {
          await tx.campaignRecipient.createMany({
            data: recipientContactIds.map(contactId => ({ campaignId: existing.id, contactId, status: "PENDING" })),
          });
        }
      }
      await tx.auditLog.create({
        data: {
          organizationId: context.organization.id,
          actorUserId: context.user.id,
          action: "campaign.updated",
          resourceType: "Campaign",
          resourceId: existing.id,
          metadata: {
            fields: [...Object.keys(data), ...(recipientContactIds !== undefined ? ["recipientContactIds"] : [])],
            recipientCount: recipientContactIds?.length,
          },
        },
      });
      return { ...updated, _count: { recipients: recipientContactIds?.length ?? updated._count.recipients } };
    }, { maxWait: 10_000, timeout: 120_000 });
    return NextResponse.json({ campaign });
  } catch (error) {
    console.error("Campaign update failed", error);
    return NextResponse.json({ error: "Unable to update campaign." }, { status: 500 });
  }
}
