CREATE TYPE "QrDeliveryStatus" AS ENUM ('SENT', 'DELIVERED', 'READ');

CREATE TABLE "QrDeliveryReceipt" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "status" "QrDeliveryStatus" NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt" TIMESTAMP(3),
  CONSTRAINT "QrDeliveryReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QrDeliveryReceipt_organizationId_senderId_providerMessageId_key"
  ON "QrDeliveryReceipt"("organizationId", "senderId", "providerMessageId");

CREATE INDEX "QrDeliveryReceipt_organizationId_senderId_appliedAt_idx"
  ON "QrDeliveryReceipt"("organizationId", "senderId", "appliedAt");

ALTER TABLE "QrDeliveryReceipt"
  ADD CONSTRAINT "QrDeliveryReceipt_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QrDeliveryReceipt"
  ADD CONSTRAINT "QrDeliveryReceipt_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
