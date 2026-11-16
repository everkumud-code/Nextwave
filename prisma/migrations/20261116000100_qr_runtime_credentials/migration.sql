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

CREATE INDEX "QrCredential_organizationId_senderId_idx" ON "QrCredential"("organizationId", "senderId");
CREATE UNIQUE INDEX "QrSignalKey_credentialId_keyType_keyId_key" ON "QrSignalKey"("credentialId", "keyType", "keyId");
CREATE INDEX "QrSignalKey_credentialId_keyType_idx" ON "QrSignalKey"("credentialId", "keyType");

ALTER TABLE "QrCredential" ADD CONSTRAINT "QrCredential_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QrCredential" ADD CONSTRAINT "QrCredential_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "Sender"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QrSignalKey" ADD CONSTRAINT "QrSignalKey_credentialId_fkey"
  FOREIGN KEY ("credentialId") REFERENCES "QrCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
