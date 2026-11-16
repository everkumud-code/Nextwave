-- Initial PostgreSQL schema for NextWave MultiSender.
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'VIEWER');
CREATE TYPE "SenderOwnership" AS ENUM ('CUSTOMER', 'PLATFORM');
CREATE TYPE "SenderConnector" AS ENUM ('QR_SESSION', 'META_CLOUD_API', 'OTHER');
CREATE TYPE "SenderStatus" AS ENUM ('PENDING', 'CONNECTED', 'ATTENTION', 'DISCONNECTED', 'RESTRICTED', 'ARCHIVED');
CREATE TYPE "QrSessionStatus" AS ENUM ('CREATED', 'QR_PENDING', 'PAIRING', 'CONNECTED', 'RECONNECTING', 'DISCONNECTED', 'REVOKED', 'ERROR');
CREATE TYPE "ContactStatus" AS ENUM ('ACTIVE', 'UNSUBSCRIBED', 'INVALID', 'BLOCKED');
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'WITHDRAWN', 'UNKNOWN');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'FAILED');
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SUBMITTED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'CANCELLED');
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'API');

CREATE TABLE "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "passwordHash" TEXT,
  "emailVerified" TIMESTAMP(3),
  "image" TEXT,
  "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Membership" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "MemberRole" NOT NULL DEFAULT 'AGENT',
  "invitedAt" TIMESTAMP(3),
  "joinedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Sender" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "phoneNumberE164" TEXT NOT NULL,
  "ownership" "SenderOwnership" NOT NULL DEFAULT 'CUSTOMER',
  "connector" "SenderConnector" NOT NULL,
  "status" "SenderStatus" NOT NULL DEFAULT 'PENDING',
  "providerAccountRef" TEXT,
  "assignedLabel" TEXT,
  "lastConnectedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "Sender_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "QrSession" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "ownership" "SenderOwnership" NOT NULL,
  "status" "QrSessionStatus" NOT NULL DEFAULT 'CREATED',
  "providerSessionId" TEXT,
  "activeKey" TEXT,
  "credentialRef" TEXT,
  "connectedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "QrSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "QrCredential" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "encryptedCreds" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QrCredential_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "QrSignalKey" (
  "id" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "keyType" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "encryptedValue" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QrSignalKey_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Contact" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "phoneNumber" TEXT NOT NULL,
  "phoneNumberE164" TEXT NOT NULL,
  "firstName" TEXT,
  "lastName" TEXT,
  "email" TEXT,
  "company" TEXT,
  "customFields" JSONB,
  "status" "ContactStatus" NOT NULL DEFAULT 'ACTIVE',
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ConsentRecord" (
  "id" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "status" "ConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
  "source" TEXT,
  "evidenceRef" TEXT,
  "noticeVersion" TEXT,
  "grantedAt" TIMESTAMP(3),
  "withdrawnAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "senderId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
  "scheduledAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CampaignRecipient" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Message" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "campaignId" TEXT,
  "senderId" TEXT,
  "recipientE164" TEXT NOT NULL,
  "body" TEXT,
  "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
  "idempotencyKey" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "submittedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorType" "AuditActorType" NOT NULL DEFAULT 'USER',
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Membership_organizationId_userId_key" ON "Membership"("organizationId", "userId");
CREATE INDEX "Membership_userId_role_idx" ON "Membership"("userId", "role");
CREATE INDEX "Membership_organizationId_role_idx" ON "Membership"("organizationId", "role");
CREATE UNIQUE INDEX "Sender_organizationId_phoneNumberE164_key" ON "Sender"("organizationId", "phoneNumberE164");
CREATE INDEX "Sender_organizationId_status_idx" ON "Sender"("organizationId", "status");
CREATE INDEX "Sender_organizationId_ownership_idx" ON "Sender"("organizationId", "ownership");
CREATE INDEX "Sender_connector_status_idx" ON "Sender"("connector", "status");
CREATE UNIQUE INDEX "QrSession_activeKey_key" ON "QrSession"("activeKey");
CREATE INDEX "QrSession_organizationId_senderId_status_idx" ON "QrSession"("organizationId", "senderId", "status");
CREATE INDEX "QrSession_providerSessionId_idx" ON "QrSession"("providerSessionId");
CREATE INDEX "QrSession_status_lastSeenAt_idx" ON "QrSession"("status", "lastSeenAt");
CREATE INDEX "QrCredential_organizationId_senderId_idx" ON "QrCredential"("organizationId", "senderId");
CREATE UNIQUE INDEX "QrSignalKey_credentialId_keyType_keyId_key" ON "QrSignalKey"("credentialId", "keyType", "keyId");
CREATE INDEX "QrSignalKey_credentialId_keyType_idx" ON "QrSignalKey"("credentialId", "keyType");
CREATE UNIQUE INDEX "Contact_organizationId_phoneNumberE164_key" ON "Contact"("organizationId", "phoneNumberE164");
CREATE INDEX "Contact_organizationId_status_idx" ON "Contact"("organizationId", "status");
CREATE INDEX "Contact_organizationId_email_idx" ON "Contact"("organizationId", "email");
CREATE INDEX "ConsentRecord_contactId_channel_purpose_status_idx" ON "ConsentRecord"("contactId", "channel", "purpose", "status");
CREATE INDEX "Campaign_organizationId_status_scheduledAt_idx" ON "Campaign"("organizationId", "status", "scheduledAt");
CREATE INDEX "Campaign_senderId_status_idx" ON "Campaign"("senderId", "status");
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_contactId_key" ON "CampaignRecipient"("campaignId", "contactId");
CREATE INDEX "CampaignRecipient_campaignId_status_idx" ON "CampaignRecipient"("campaignId", "status");
CREATE INDEX "CampaignRecipient_contactId_idx" ON "CampaignRecipient"("contactId");
CREATE UNIQUE INDEX "Message_organizationId_idempotencyKey_key" ON "Message"("organizationId", "idempotencyKey");
CREATE INDEX "Message_organizationId_status_createdAt_idx" ON "Message"("organizationId", "status", "createdAt");
CREATE INDEX "Message_campaignId_status_idx" ON "Message"("campaignId", "status");
CREATE INDEX "Message_providerMessageId_idx" ON "Message"("providerMessageId");
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sender" ADD CONSTRAINT "Sender_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QrSession" ADD CONSTRAINT "QrSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QrSession" ADD CONSTRAINT "QrSession_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QrCredential" ADD CONSTRAINT "QrCredential_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QrCredential" ADD CONSTRAINT "QrCredential_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QrSignalKey" ADD CONSTRAINT "QrSignalKey_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "QrCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
