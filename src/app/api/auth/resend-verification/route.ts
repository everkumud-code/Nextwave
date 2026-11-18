import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { mailConfigured } from "@/lib/mailer";
import { sendVerificationEmail } from "@/lib/auth-tokens";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!(await mailConfigured())) return NextResponse.json({ error: "E-mail is not switched on for this platform yet." }, { status: 503 });
  if (context.user.emailVerified) return NextResponse.json({ ok: true, alreadyConfirmed: true });
  const sent = await sendVerificationEmail({ id: context.user.id, email: context.user.email, name: context.user.name }, request);
  if (!sent) return NextResponse.json({ error: "The e-mail could not be sent right now (you can ask for at most 3 an hour). Try again a little later." }, { status: 429 });
  return NextResponse.json({ ok: true });
}
