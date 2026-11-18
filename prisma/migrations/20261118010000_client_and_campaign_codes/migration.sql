-- Unique identification numbers: BPML/<year of creation>/NR<serial> for every client, and <client number>/CP<serial> for every campaign.
ALTER TABLE "Organization" ADD COLUMN "clientCode" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "campaignCode" TEXT;

CREATE TABLE "IdCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "IdCounter_pkey" PRIMARY KEY ("key")
);

-- the clients that exist: the year they were created, the serial in order of creation within that year
WITH numbered AS (
  SELECT "id", EXTRACT(YEAR FROM "createdAt")::int AS yr,
         ROW_NUMBER() OVER (PARTITION BY EXTRACT(YEAR FROM "createdAt") ORDER BY "createdAt", "id") AS n
  FROM "Organization"
)
UPDATE "Organization" AS o
SET "clientCode" = 'BPML/' || numbered.yr || '/NR' || LPAD(numbered.n::text, 3, '0')
FROM numbered WHERE o."id" = numbered."id";

INSERT INTO "IdCounter" ("key", "value")
SELECT 'client:' || EXTRACT(YEAR FROM "createdAt")::int, COUNT(*)::int FROM "Organization" GROUP BY EXTRACT(YEAR FROM "createdAt");

-- the campaigns that exist: the client's number and a serial in order of creation within the client
WITH numbered AS (
  SELECT c."id", o."clientCode", ROW_NUMBER() OVER (PARTITION BY c."organizationId" ORDER BY c."createdAt", c."id") AS n
  FROM "Campaign" c JOIN "Organization" o ON o."id" = c."organizationId"
)
UPDATE "Campaign" AS c
SET "campaignCode" = numbered."clientCode" || '/CP' || LPAD(numbered.n::text, 4, '0')
FROM numbered WHERE c."id" = numbered."id";

INSERT INTO "IdCounter" ("key", "value")
SELECT 'campaign:' || "organizationId", COUNT(*)::int FROM "Campaign" GROUP BY "organizationId";

CREATE UNIQUE INDEX "Organization_clientCode_key" ON "Organization"("clientCode");
CREATE UNIQUE INDEX "Campaign_campaignCode_key" ON "Campaign"("campaignCode");
