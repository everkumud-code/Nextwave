import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

const databaseAvailable = Boolean(process.env.DATABASE_URL);
after(async () => { if (databaseAvailable) await prisma.$disconnect(); });

test("contact groups persist tenant-owned membership and cascade on group deletion", { skip: !databaseAvailable }, async () => {
  const organization = await prisma.organization.create({
    data: { name: "Contact groups integration", slug: `contact-groups-${randomUUID()}` },
  });
  try {
    const contact = await prisma.contact.create({
      data: {
        organizationId: organization.id,
        phoneNumber: "9876543210",
        phoneNumberE164: "+919876543210",
      },
    });
    const group = await prisma.contactGroup.create({
      data: {
        organizationId: organization.id,
        name: "Integration audience",
        members: { create: [{ contactId: contact.id }] },
      },
      include: { members: true },
    });
    assert.equal(group.members.length, 1);
    assert.equal(group.members[0].contactId, contact.id);

    await assert.rejects(
      prisma.contactGroup.create({
        data: { organizationId: organization.id, name: "Integration audience" },
      }),
      error => Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002"),
    );

    await prisma.contactGroup.delete({ where: { id: group.id } });
    assert.equal(await prisma.contactGroupMember.count({ where: { groupId: group.id } }), 0);
    assert.ok(await prisma.contact.findUnique({ where: { id: contact.id } }));
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } });
  }
});
