import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { consumeAuthToken } from "@/lib/auth-tokens";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : "";
  const userId = await consumeAuthToken(token, "EMAIL_VERIFY");
  if (!userId) return NextResponse.json({ error: "This link has expired or was already used. Sign in and press 'Send the e-mail again'." }, { status: 400 });
  await prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
  return NextResponse.json({ ok: true });
}
