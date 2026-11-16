import { createConnectorRegistry } from "../src/lib/connectors";
import { dispatchQueuedBatch } from "../src/lib/queue/dispatch";

const enabled = process.env.QUEUE_WORKER_ENABLED === "true";
if (!enabled) {
  console.error("Queue worker is disabled. Set QUEUE_WORKER_ENABLED=true after configuring a messaging connector.");
  process.exitCode = 1;
} else {
  const registry = createConnectorRegistry();
  const configured = registry.list().some(item => registry.get(item.type).getCapabilities().configured);
  if (!configured) {
    console.error("Queue worker will not start: no registered connector is configured for message delivery.");
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
        const result = await dispatchQueuedBatch(batchSize);
        if (result.claimed > 0) console.info("Queue batch processed", result);
      } catch (error) {
        console.error("Queue batch failed", error);
      }
      if (!stopping) await new Promise(resolve => setTimeout(resolve, pollMs));
    }
    console.info("NextWave queue worker stopped.");
  }
}
