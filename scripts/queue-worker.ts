import { dispatchQueuedBatch } from "../src/lib/queue/dispatch";
import { processDueScheduledCampaigns } from "../src/lib/queue/scheduler";

const enabled = process.env.QUEUE_WORKER_ENABLED === "true";
if (!enabled) {
  console.error("Queue worker is disabled. Set QUEUE_WORKER_ENABLED=true to process scheduled campaigns and queued messages.");
  process.exitCode = 1;
} else {
  const batchSize = Math.max(1, Math.min(Number(process.env.QUEUE_WORKER_BATCH_SIZE ?? 25) || 25, 100));
  const pollMs = Math.max(250, Math.min(Number(process.env.QUEUE_WORKER_POLL_INTERVAL_MS ?? 1000) || 1000, 30_000));
  let stopping = false;
  process.on("SIGINT", () => { stopping = true; });
  process.on("SIGTERM", () => { stopping = true; });

  console.info(`NextWave queue worker started (batch=${batchSize}, poll=${pollMs}ms).`);
  while (!stopping) {
    try {
      const scheduled = await processDueScheduledCampaigns(Math.min(batchSize, 25));
      if (scheduled.scanned > 0) console.info("Scheduled campaigns processed", scheduled);
      const dispatched = await dispatchQueuedBatch(batchSize);
      if (dispatched.claimed > 0) console.info("Queue batch processed", dispatched);
    } catch (error) {
      console.error("Queue worker cycle failed", error);
    }
    if (!stopping) await new Promise(resolve => setTimeout(resolve, pollMs));
  }
  console.info("NextWave queue worker stopped.");
}
