import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { consumeAuthToken } from "@/lib/auth-tokens";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length < 10 || password.length > 128) return NextResponse.json({ error: "Choose a password of at least 10 characters." }, { status: 400 });
  const userId = await consumeAuthToken(token, "PASSWORD_RESET");
  if (!userId) return NextResponse.json({ error: "This link has expired or was already used. Ask for a new one." }, { status: 400 });
  const passwordHash = await hash(password, 12);
  await prisma.$transaction([
    // the person has proved they own the inbox, so the address counts as confirmed too
    prisma.user.update({ where: { id: userId }, data: { passwordHash, emailVerified: new Date() } }),
    prisma.authToken.updateMany({ where: { userId, kind: "PASSWORD_RESET", usedAt: null }, data: { usedAt: new Date() } }),
  ]);
  return NextResponse.json({ ok: true });
}
