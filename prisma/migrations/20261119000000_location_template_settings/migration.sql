-- Map pins, official-API templates, platform settings (e-mail, payment, official app) and encrypted provider tokens.
ALTER TABLE "Campaign" ADD COLUMN "locationLat" DOUBLE PRECISION;
ALTER TABLE "Campaign" ADD COLUMN "locationLng" DOUBLE PRECISION;
ALTER TABLE "Campaign" ADD COLUMN "locationName" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "locationAddress" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "templateName" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "templateLanguage" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "templateParams" TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Message" ADD COLUMN "locationJson" JSONB;
ALTER TABLE "Message" ADD COLUMN "templateJson" JSONB;

CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "ProviderCredential" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCredential_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProviderCredential_senderId_key" ON "ProviderCredential"("senderId");
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
