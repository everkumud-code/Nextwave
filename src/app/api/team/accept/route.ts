import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { assertAuthConfigured, createSession, getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertAuthConfigured();
    const body = await request.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token : "";
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[a-f0-9]{64}$/.test(token) || password.length < 10 || password.length > 128) {
      return NextResponse.json({ error: "A valid invitation and password of at least 10 characters are required." }, { status: 400 });
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const currentContext = await getAuthContext();
    const result = await prisma.$transaction(async tx => {
      const invitation = await tx.organizationInvite.findUnique({ where: { tokenHash } });
      if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) return null;
      let user = await tx.user.findUnique({ where: { email: invitation.email } });
      if (user && currentContext?.user.id !== user.id) return { requiresSignIn: true as const };
      if (!user) {
        if (!name) return { needsName: true as const };
        const passwordHash = await hash(password, 12);
        user = await tx.user.create({ data: { email: invitation.email, name, passwordHash } });
      }
      await tx.membership.upsert({
        where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } },
        create: { organizationId: invitation.organizationId, userId: user.id, role: invitation.role, joinedAt: new Date() },
        update: { role: invitation.role, joinedAt: new Date() },
      });
      await tx.organizationInvite.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          organizationId: invitation.organizationId,
          actorUserId: user.id,
          action: "team.invitation_accepted",
          resourceType: "OrganizationInvite",
          resourceId: invitation.id,
        },
      });
      return { userId: user.id };
    }, { isolationLevel: "Serializable" });

    if (!result) return NextResponse.json({ error: "This invitation is invalid, expired or already used." }, { status: 410 });
    if ("needsName" in result) return NextResponse.json({ error: "Enter your name to finish setting up your account." }, { status: 400 });
    if ("requiresSignIn" in result) return NextResponse.json({ error: "This email already has a NextWave account. Sign in to that account first, then reopen this invitation link." }, { status: 401 });
    await createSession(result.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Team invitation acceptance failed", error);
    return NextResponse.json({ error: "Unable to accept this invitation." }, { status: 500 });
  }
}
