import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
const roles = new Set(["ADMIN", "MANAGER", "AGENT", "VIEWER"]);

/** The owner or an admin creates a team member's login right away: name, e-mail, role and a first password the person can change later. */
export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!["OWNER", "ADMIN"].includes(context.role)) return NextResponse.json({ error: "Only workspace owners and admins can add team members." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = typeof body?.role === "string" ? body.role : "AGENT";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !roles.has(role) || password.length < 10 || password.length > 128) {
    return NextResponse.json({ error: "Enter the person's name, a valid e-mail, a role and a password of at least 10 characters." }, { status: 400 });
  }
  if (role === "ADMIN" && context.role !== "OWNER") return NextResponse.json({ error: "Only the owner can add another admin." }, { status: 403 });
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    return NextResponse.json({ error: "This e-mail already has a NextWave account. Send the person an invite link instead (Create invite), so they join with their own login." }, { status: 409 });
  }
  const passwordHash = await hash(password, 12);
  const member = await prisma.$transaction(async tx => {
    const user = await tx.user.create({ data: { name, email, passwordHash, emailVerified: new Date() }, select: { id: true } });
    const membership = await tx.membership.create({
      data: { organizationId: context.organization.id, userId: user.id, role: role as "ADMIN" | "MANAGER" | "AGENT" | "VIEWER", joinedAt: new Date(), invitedAt: new Date() },
      select: { id: true },
    });
    await tx.auditLog.create({ data: { organizationId: context.organization.id, actorUserId: context.user.id, action: "team.member_added", resourceType: "Membership", resourceId: membership.id, metadata: { email, role } } });
    return membership;
  });
  return NextResponse.json({ member: { id: member.id, email, name, role } }, { status: 201 });
}
