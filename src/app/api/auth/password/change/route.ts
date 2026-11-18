import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { mailConfigured } from "@/lib/mailer";
import { verifyPasswordOtp } from "@/lib/auth-tokens";

export const runtime = "nodejs";

/**
 * Change your own password. Needs the current password and, when e-mail is switched on, the 6-digit code that was e-mailed.
 * (Without e-mail the code cannot be sent, so only the current password is asked.)
 */
export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  const otp = typeof body?.otp === "string" ? body.otp.trim() : "";
  if (newPassword.length < 10 || newPassword.length > 128) return NextResponse.json({ error: "Choose a new password of at least 10 characters." }, { status: 400 });
  if (newPassword === currentPassword) return NextResponse.json({ error: "The new password must be different from the current one." }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: context.user.id }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await compare(currentPassword, user.passwordHash))) return NextResponse.json({ error: "The current password is not correct." }, { status: 400 });
  const otpRequired = await mailConfigured();
  if (otpRequired) {
    const result = await verifyPasswordOtp(context.user.id, otp);
    if (result === "wrong") return NextResponse.json({ error: "That code is not correct. Check the e-mail and try again." }, { status: 400 });
    if (result === "expired") return NextResponse.json({ error: "The code has expired or was used too many times. Ask for a new code." }, { status: 400 });
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: context.user.id }, data: { passwordHash: await hash(newPassword, 12) } }),
    prisma.authToken.updateMany({ where: { userId: context.user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.auditLog.create({ data: { organizationId: context.organization.id, actorUserId: context.user.id, action: "auth.password_changed", resourceType: "User", resourceId: context.user.id, metadata: { withOtp: otpRequired } } }),
  ]);
  return NextResponse.json({ ok: true });
}
