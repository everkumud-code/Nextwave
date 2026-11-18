import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ membershipId: string }> };
const roles = new Set(["ADMIN", "MANAGER", "AGENT", "VIEWER"]);

async function load(route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) } as const;
  if (!["OWNER", "ADMIN"].includes(context.role)) return { error: NextResponse.json({ error: "Only workspace owners and admins can manage team access." }, { status: 403 }) } as const;
  const { membershipId } = await route.params;
  const membership = await prisma.membership.findFirst({ where: { id: membershipId, organizationId: context.organization.id }, select: { id: true, role: true, userId: true } });
  if (!membership) return { error: NextResponse.json({ error: "Member not found." }, { status: 404 }) } as const;
  if (membership.role === "OWNER") return { error: NextResponse.json({ error: "The owner of the workspace cannot be changed or removed here." }, { status: 409 }) } as const;
  if (membership.userId === context.user.id) return { error: NextResponse.json({ error: "You cannot change or remove your own access." }, { status: 409 }) } as const;
  if (membership.role === "ADMIN" && context.role !== "OWNER") return { error: NextResponse.json({ error: "Only the owner can change or remove an admin." }, { status: 403 }) } as const;
  return { context, membership } as const;
}

/** Change a member's role, or set a new password for them ({"password": "..."}). */
export async function PATCH(request: Request, route: RouteContext) {
  const found = await load(route);
  if ("error" in found) return found.error;
  const { context, membership } = found;
  const body = await request.json().catch(() => ({}));
  if (typeof body?.role === "string") {
    if (!roles.has(body.role)) return NextResponse.json({ error: "Choose an allowed role." }, { status: 400 });
    if (body.role === "ADMIN" && context.role !== "OWNER") return NextResponse.json({ error: "Only the owner can make someone an admin." }, { status: 403 });
    await prisma.$transaction([
      prisma.membership.update({ where: { id: membership.id }, data: { role: body.role as "ADMIN" | "MANAGER" | "AGENT" | "VIEWER" } }),
      prisma.auditLog.create({ data: { organizationId: context.organization.id, actorUserId: context.user.id, action: "team.role_changed", resourceType: "Membership", resourceId: membership.id, metadata: { role: body.role } } }),
    ]);
    return NextResponse.json({ role: body.role });
  }
  if (typeof body?.password === "string") {
    if (body.password.length < 10 || body.password.length > 128) return NextResponse.json({ error: "A password needs at least 10 characters." }, { status: 400 });
    await prisma.$transaction([
      prisma.user.update({ where: { id: membership.userId }, data: { passwordHash: await hash(body.password, 12) } }),
      prisma.auditLog.create({ data: { organizationId: context.organization.id, actorUserId: context.user.id, action: "team.password_set", resourceType: "Membership", resourceId: membership.id } }),
    ]);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
}

/** Remove a member from this workspace (their login stays if they belong to another workspace). */
export async function DELETE(_request: Request, route: RouteContext) {
  const found = await load(route);
  if ("error" in found) return found.error;
  const { context, membership } = found;
  await prisma.$transaction([
    prisma.membership.delete({ where: { id: membership.id } }),
    prisma.auditLog.create({ data: { organizationId: context.organization.id, actorUserId: context.user.id, action: "team.member_removed", resourceType: "Membership", resourceId: membership.id } }),
  ]);
  return NextResponse.json({ removed: true });
}
