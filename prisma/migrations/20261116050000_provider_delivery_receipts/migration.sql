CREATE TABLE "ProviderDeliveryReceipt" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "status" "QrDeliveryStatus" NOT NULL,
  "eventTimestamp" TIMESTAMP(3) NOT NULL,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3),
  CONSTRAINT "ProviderDeliveryReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProviderDeliveryReceipt_event_key"
ON "ProviderDeliveryReceipt"("organizationId", "senderId", "providerMessageId", "status", "eventTimestamp");
CREATE INDEX "ProviderDeliveryReceipt_pending_idx"
ON "ProviderDeliveryReceipt"("organizationId", "senderId", "providerMessageId", "appliedAt");

ALTER TABLE "ProviderDeliveryReceipt" ADD CONSTRAINT "ProviderDeliveryReceipt_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderDeliveryReceipt" ADD CONSTRAINT "ProviderDeliveryReceipt_senderId_fkey"
FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
