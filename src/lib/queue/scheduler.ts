import { prisma } from "@/lib/db/prisma";
import { queueDueScheduledCampaign } from "./scheduled-campaigns";

export type ScheduledCampaignBatchResult = {
  scanned: number;
  queued: number;
  failed: number;
  skipped: number;
};

export async function processDueScheduledCampaigns(limit = 10): Promise<ScheduledCampaignBatchResult> {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 100));
  const due = await prisma.campaign.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    take: safeLimit,
    select: { id: true },
  });
  const result: ScheduledCampaignBatchResult = { scanned: due.length, queued: 0, failed: 0, skipped: 0 };

  for (const campaign of due) {
    try {
      const outcome = await prisma.$transaction(
        tx => queueDueScheduledCampaign(tx, campaign.id),
        { isolationLevel: "Serializable", maxWait: 5000, timeout: 180000 },
      );
      if (outcome.status === "QUEUED") result.queued += 1;
      else if (outcome.status === "FAILED") result.failed += 1;
      else result.skipped += 1;
    } catch (error) {
      // A later poll can safely retry: the campaign status transition and message creation are transactional.
      console.error("Scheduled campaign processing failed", campaign.id, error);
      result.skipped += 1;
    }
  }
  return result;
}
