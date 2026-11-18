import { createHash, randomBytes, randomInt } from "node:crypto";
import type { AuthTokenKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { appUrl, mailConfigured, mailLayout, sendMail } from "@/lib/mailer";

const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

const TTL_MINUTES: Record<AuthTokenKind, number> = { PASSWORD_RESET: 60, EMAIL_VERIFY: 60 * 48, PASSWORD_OTP: 10 };

/** A single-use link token. Only its hash is stored, so a copy of the database cannot be used to reset anyone's password. */
export async function createAuthToken(userId: string, kind: AuthTokenKind): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await prisma.authToken.create({ data: { userId, kind, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + TTL_MINUTES[kind] * 60_000) } });
  return raw;
}

/** Uses a token exactly once. Returns the user it belongs to, or null when it is unknown, expired or already used. */
export async function consumeAuthToken(raw: string, kind: AuthTokenKind): Promise<string | null> {
  if (!raw || raw.length > 200) return null;
  const record = await prisma.authToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!record || record.kind !== kind || record.usedAt || record.expiresAt < new Date()) return null;
  const claimed = await prisma.authToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  return claimed.count ? record.userId : null;
}

/** Too many requests for one person in an hour are refused quietly (stops someone flooding another person's inbox). */
export async function tooManyTokens(userId: string, kind: AuthTokenKind, max = 3): Promise<boolean> {
  const recent = await prisma.authToken.count({ where: { userId, kind, createdAt: { gte: new Date(Date.now() - 60 * 60_000) } } });
  return recent >= max;
}

// ---------------------------------------------------------------- one-time codes (OTP) for a password change
const OTP_MINUTES = 10;
export const OTP_MAX_WRONG_TRIES = 5;
const otpHash = (userId: string, code: string) => createHash("sha256").update(`otp:${userId}:${code}`).digest("hex");

/** A fresh 6-digit code. Older unused codes of this person stop working. Only a hash is stored. */
export async function createPasswordOtp(userId: string): Promise<string> {
  for (let tries = 0; ; tries++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      await prisma.$transaction([
        // older codes stop working (they stay as rows, which is also how the hourly limit is counted)
        prisma.authToken.updateMany({ where: { userId, kind: "PASSWORD_OTP", usedAt: null }, data: { usedAt: new Date() } }),
        prisma.authToken.create({ data: { userId, kind: "PASSWORD_OTP", tokenHash: otpHash(userId, code), expiresAt: new Date(Date.now() + OTP_MINUTES * 60_000) } }),
      ]);
      return code;
    } catch (error) {
      // the very same code was issued to this person before (1 in a million): draw another
      if (tries < 3 && error && typeof error === "object" && "code" in error && error.code === "P2002") continue;
      throw error;
    }
  }
}

/**
 * Checks the code. A wrong code counts as a try; after 5 wrong tries the code is dead and a new one has to be asked for,
 * so nobody can guess a 6-digit number. A right code works once.
 */
export async function verifyPasswordOtp(userId: string, code: string): Promise<"ok" | "wrong" | "expired"> {
  if (!/^\d{6}$/.test(code)) return "wrong";
  const record = await prisma.authToken.findFirst({ where: { userId, kind: "PASSWORD_OTP", usedAt: null }, orderBy: { createdAt: "desc" } });
  if (!record || record.expiresAt < new Date() || record.attempts >= OTP_MAX_WRONG_TRIES) return "expired";
  if (record.tokenHash !== otpHash(userId, code)) {
    await prisma.authToken.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    return "wrong";
  }
  const claimed = await prisma.authToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  return claimed.count ? "ok" : "expired";
}

export async function sendPasswordOtpEmail(user: { id: string; email: string; name: string | null }): Promise<boolean> {
  if (!(await mailConfigured())) return false;
  if (await tooManyTokens(user.id, "PASSWORD_OTP", 5)) return false;
  const code = await createPasswordOtp(user.id);
  const text = `Hello${user.name ? ` ${user.name}` : ""},\n\nYour NextWave code for changing your password is ${code}.\nIt works for ${OTP_MINUTES} minutes and only once. Never tell this code to anyone.\n\nIf you did not ask for it, please ignore this message and consider changing your password.`;
  return sendMail({ to: user.email, subject: `${code} is your NextWave password code`, text, html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0f172a"><h2 style="margin:0 0 12px">Your password code</h2><p>Use this code to change your NextWave password:</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:16px 0">${code}</p><p style="color:#64748b;font-size:13px">It works for ${OTP_MINUTES} minutes and only once. Never tell this code to anyone. If you did not ask for it, ignore this message.</p></div>` });
}

export async function sendVerificationEmail(user: { id: string; email: string; name: string | null }, request?: Request): Promise<boolean> {
  if (!(await mailConfigured())) return false;
  if (await tooManyTokens(user.id, "EMAIL_VERIFY")) return false;
  const token = await createAuthToken(user.id, "EMAIL_VERIFY");
  const link = `${appUrl(request)}/verify-email?token=${token}`;
  const layout = mailLayout("Confirm your e-mail address", `Hello${user.name ? ` ${user.name}` : ""}, please confirm that this e-mail address is yours to start sending campaigns on NextWave. The link works for 48 hours.`, "Confirm my e-mail", link);
  return sendMail({ to: user.email, subject: "Confirm your NextWave e-mail", ...layout });
}

export async function sendPasswordResetEmail(user: { id: string; email: string; name: string | null }, request?: Request): Promise<boolean> {
  if (!(await mailConfigured())) return false;
  if (await tooManyTokens(user.id, "PASSWORD_RESET")) return false;
  const token = await createAuthToken(user.id, "PASSWORD_RESET");
  const code = await createPasswordOtp(user.id);
  const link = `${appUrl(request)}/reset-password?token=${token}`;
  const layout = mailLayout("Reset your password", `We received a request to reset the password of your NextWave account. Open the link below, or type this 6-digit code on the "Forgot password" page: ${code}. The link works for one hour, the code for ${OTP_MINUTES} minutes, each only once.`, "Choose a new password", link);
  return sendMail({ to: user.email, subject: `${code} is your NextWave password reset code`, ...layout });
}

/** Sending campaigns needs a confirmed e-mail, but only when e-mail is switched on (otherwise nobody could ever confirm). */
export async function emailConfirmationMissing(user: { emailVerified?: Date | string | null }): Promise<boolean> {
  return !user.emailVerified && (await mailConfigured());
}
