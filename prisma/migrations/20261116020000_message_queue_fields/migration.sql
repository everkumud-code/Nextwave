ALTER TABLE "Message"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "lockToken" TEXT,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3);

CREATE INDEX "Message_status_nextAttemptAt_lockedAt_idx"
  ON "Message"("status", "nextAttemptAt", "lockedAt");
