import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { formatCampaignCode, formatClientCode, nextCampaignCode, nextClientCode } from "./ids";

const databaseAvailable = Boolean(process.env.DATABASE_URL);
after(async () => { if (databaseAvailable) await prisma.$disconnect(); });

test("the numbers have the agreed format", () => {
  assert.equal(formatClientCode(2026, 1), "BPML/2026/NR001");
  assert.equal(formatClientCode(2026, 42), "BPML/2026/NR042");
  assert.equal(formatClientCode(2027, 1234), "BPML/2027/NR1234");
  assert.equal(formatCampaignCode("BPML/2026/NR001", 7), "BPML/2026/NR001/CP0007");
});

test("client and campaign numbers count up and are never repeated, even when taken at the same moment", { skip: !databaseAvailable }, async () => {
  const when = new Date("2090-06-15T10:00:00Z");     // a year nobody else uses, so the test owns its counter
  const codes = await Promise.all(Array.from({ length: 12 }, () => prisma.$transaction((tx) => nextClientCode(tx, when))));
  assert.equal(new Set(codes).size, 12);
  assert.ok(codes.every((code) => /^BPML\/2090\/NR\d{3,}$/.test(code)));
  const serials = codes.map((code) => Number(code.slice(-3))).sort((a, b) => a - b);
  assert.deepEqual(serials, Array.from({ length: 12 }, (_, index) => index + 1));

  const clientCode = `BPML/2090/NRT${randomUUID().slice(0, 6)}`;
  const organization = await prisma.organization.create({ data: { name: "Ids integration", slug: `ids-${randomUUID()}`, clientCode } });
  try {
    const campaigns = await Promise.all(Array.from({ length: 5 }, () => prisma.$transaction((tx) => nextCampaignCode(tx, organization.id))));
    assert.equal(new Set(campaigns).size, 5);
    assert.ok(campaigns.every((code) => code.startsWith(clientCode + "/CP")));
  } finally {
    await prisma.idCounter.deleteMany({ where: { OR: [{ key: "client:2090" }, { key: `campaign:${organization.id}` }] } });
    await prisma.organization.delete({ where: { id: organization.id } });
  }
});
