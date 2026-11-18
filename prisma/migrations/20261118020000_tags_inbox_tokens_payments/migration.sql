-- Tags, replies (inbox), several senders per campaign, a hand-set daily limit, e-mail links, online payments and invoices.
ALTER TABLE "Contact" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
CREATE INDEX "Contact_tags_idx" ON "Contact" USING GIN ("tags");

ALTER TABLE "Sender" ADD COLUMN "dailyLimitOverride" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "extraSenderIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- e-mail verification (User.emailVerified already exists): the people who already have an account are taken as verified
UPDATE "User" SET "emailVerified" = "createdAt" WHERE "emailVerified" IS NULL;

CREATE TYPE "AuthTokenKind" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFY', 'PASSWORD_OTP');

CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AuthTokenKind" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");
CREATE INDEX "AuthToken_userId_kind_idx" ON "AuthToken"("userId", "kind");
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InboundMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "contactId" TEXT,
    "fromE164" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "isOptOut" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InboundMessage_organizationId_senderId_providerMessageId_key" ON "InboundMessage"("organizationId", "senderId", "providerMessageId");
CREATE INDEX "InboundMessage_organizationId_receivedAt_idx" ON "InboundMessage"("organizationId", "receivedAt");
CREATE INDEX "InboundMessage_organizationId_fromE164_idx" ON "InboundMessage"("organizationId", "fromE164");
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "provider" TEXT NOT NULL DEFAULT 'RAZORPAY',
    "providerOrderId" TEXT,
    "providerPaymentId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentOrder_providerOrderId_key" ON "PaymentOrder"("providerOrderId");
CREATE INDEX "PaymentOrder_organizationId_createdAt_idx" ON "PaymentOrder"("organizationId", "createdAt");
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentOrderId" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE UNIQUE INDEX "Invoice_paymentOrderId_key" ON "Invoice"("paymentOrderId");
CREATE INDEX "Invoice_organizationId_issuedAt_idx" ON "Invoice"("organizationId", "issuedAt");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentOrderId_fkey" FOREIGN KEY ("paymentOrderId") REFERENCES "PaymentOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
