import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";

const COOKIE_NAME = "nextwave_session";
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function getSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters.");
  return new TextEncoder().encode(value);
}

export function assertAuthConfigured() { getSecret(); }

export function isPlatformAdminUser(user: { isPlatformAdmin?: boolean; email?: string }) {
  const configured = (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
  return user.isPlatformAdmin === true || (!!user.email && configured.includes(user.email.toLowerCase()));
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_SECONDS}s`)
    .sign(getSecret());

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getAuthContext() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = typeof payload.userId === "string" ? payload.userId : null;
    if (!userId) return null;

    const membership = await prisma.membership.findFirst({
      where: {
        userId,
        organization: { status: "ACTIVE" },
        joinedAt: { not: null },
      },
      orderBy: { createdAt: "asc" },
      include: {
        organization: { select: { id: true, name: true, slug: true, timezone: true, clientCode: true } },
        user: { select: { id: true, email: true, name: true, image: true, isPlatformAdmin: true, emailVerified: true } },
      },
    });
    if (!membership) return null;

    return {
      user: { ...membership.user, isPlatformAdmin: isPlatformAdminUser(membership.user) },
      organization: membership.organization,
      role: membership.role,
    };
  } catch {
    return null;
  }
}

export function canManageSenders(role: string) {
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER";
}
