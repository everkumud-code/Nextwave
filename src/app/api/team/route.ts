import { NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
const roles = new Set(["ADMIN", "MANAGER", "AGENT", "VIEWER"]);

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!["OWNER", "ADMIN"].includes(context.role)) return NextResponse.json({ error: "Only workspace owners and admins can manage team access." }, { status: 403 });
  const [members, invitations] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: context.organization.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, joinedAt: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.organizationInvite.findMany({
      where: { organizationId: context.organization.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    }),
  ]);
  return NextResponse.json({ members, invitations });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!["OWNER", "ADMIN"].includes(context.role)) return NextResponse.json({ error: "Only workspace owners and admins can invite team members." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body.role === "string" ? body.role : "AGENT";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !roles.has(role)) {
    return NextResponse.json({ error: "Enter a valid email and choose an allowed team role." }, { status: 400 });
  }
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    const membership = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId: context.organization.id, userId: existing.id } } });
    if (membership) return NextResponse.json({ error: "This user is already a member of the workspace." }, { status: 409 });
  }
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const invitation = await prisma.organizationInvite.create({
    data: {
      organizationId: context.organization.id,
      email,
      role: role as "ADMIN" | "MANAGER" | "AGENT" | "VIEWER",
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      invitedByUserId: context.user.id,
    },
    select: { id: true, email: true, role: true, expiresAt: true },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: context.organization.id,
      actorUserId: context.user.id,
      action: "team.invitation_created",
      resourceType: "OrganizationInvite",
      resourceId: invitation.id,
      metadata: { email, role },
    },
  });
  const inviteUrl = new URL(`/team/accept?token=${rawToken}`, request.url).toString();
  return NextResponse.json({ invitation, inviteUrl }, { status: 201 });
}
