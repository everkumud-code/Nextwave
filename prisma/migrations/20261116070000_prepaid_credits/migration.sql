CREATE TYPE "CreditTransactionType" AS ENUM ('CREDIT', 'DEBIT', 'ADJUSTMENT');

CREATE TABLE "CreditAccount" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "balancePaise" INTEGER NOT NULL DEFAULT 0,
  "pricePerMessagePaise" INTEGER NOT NULL DEFAULT 10,
  "defaultIntervalSeconds" INTEGER NOT NULL DEFAULT 60,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CreditTransaction" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "type" "CreditTransactionType" NOT NULL,
  "amountPaise" INTEGER NOT NULL,
  "balanceAfterPaise" INTEGER NOT NULL,
  "pricePerMessagePaise" INTEGER,
  "messageCount" INTEGER,
  "reference" TEXT,
  "description" TEXT,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditAccount_organizationId_key" ON "CreditAccount"("organizationId");
CREATE INDEX "CreditAccount_updatedAt_idx" ON "CreditAccount"("updatedAt");
CREATE INDEX "CreditTransaction_organizationId_createdAt_idx" ON "CreditTransaction"("organizationId", "createdAt");
CREATE INDEX "CreditTransaction_accountId_createdAt_idx" ON "CreditTransaction"("accountId", "createdAt");
CREATE INDEX "CreditTransaction_reference_idx" ON "CreditTransaction"("reference");

ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
