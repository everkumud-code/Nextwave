import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { verifyPasswordOtp } from "@/lib/auth-tokens";

export const runtime = "nodejs";

/** Forgot password, the code way: the e-mail address, the 6-digit code from the e-mail and the new password. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const otp = typeof body?.otp === "string" ? body.otp.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < 10 || password.length > 128) return NextResponse.json({ error: "Choose a password of at least 10 characters." }, { status: 400 });
  const user = email ? await prisma.user.findUnique({ where: { email }, select: { id: true } }) : null;
  // the same answer whether the e-mail exists or the code is wrong, so nobody can probe for accounts
  const refusal = NextResponse.json({ error: "That code is not correct or has expired. Ask for a new one." }, { status: 400 });
  if (!user) return refusal;
  if ((await verifyPasswordOtp(user.id, otp)) !== "ok") return refusal;
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hash(password, 12), emailVerified: new Date() } }),
    prisma.authToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  return NextResponse.json({ ok: true });
}
