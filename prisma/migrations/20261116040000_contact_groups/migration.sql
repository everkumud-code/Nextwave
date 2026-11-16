CREATE TABLE "ContactGroup" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContactGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactGroupMember" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactGroup_organizationId_name_key" ON "ContactGroup"("organizationId", "name");
CREATE INDEX "ContactGroup_organizationId_updatedAt_idx" ON "ContactGroup"("organizationId", "updatedAt");
CREATE UNIQUE INDEX "ContactGroupMember_groupId_contactId_key" ON "ContactGroupMember"("groupId", "contactId");
CREATE INDEX "ContactGroupMember_contactId_idx" ON "ContactGroupMember"("contactId");

ALTER TABLE "ContactGroup" ADD CONSTRAINT "ContactGroup_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactGroupMember" ADD CONSTRAINT "ContactGroupMember_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "ContactGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactGroupMember" ADD CONSTRAINT "ContactGroupMember_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
