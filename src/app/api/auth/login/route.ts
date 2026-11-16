import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { createSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user?.passwordHash ? await compare(password, user.passwordHash) : false;
    if (!user || !valid) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });

    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, joinedAt: { not: null }, organization: { status: "ACTIVE" } },
      select: { id: true },
    });
    if (!membership) return NextResponse.json({ error: "No active workspace is available for this account." }, { status: 403 });

    await createSession(user.id);
    return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    console.error("Login failed", error);
    return NextResponse.json({ error: "Unable to sign in right now." }, { status: 500 });
  }
}
