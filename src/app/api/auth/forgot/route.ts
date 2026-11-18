import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { mailConfigured } from "@/lib/mailer";
import { sendPasswordResetEmail } from "@/lib/auth-tokens";

export const runtime = "nodejs";

/** Always answers the same, so nobody can find out which e-mail addresses have an account. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const emailEnabled = mailConfigured();
  if (email && emailEnabled) {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });
    if (user) await sendPasswordResetEmail(user, request);
  }
  return NextResponse.json({ ok: true, emailEnabled });
}
