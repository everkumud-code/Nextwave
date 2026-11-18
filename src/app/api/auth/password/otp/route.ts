import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { mailConfigured } from "@/lib/mailer";
import { sendPasswordOtpEmail } from "@/lib/auth-tokens";

export const runtime = "nodejs";

/** A signed-in person asks for a 6-digit code (sent to their e-mail) before changing their password. */
export async function POST() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!(await mailConfigured())) return NextResponse.json({ error: "E-mail codes are not switched on for this platform yet." }, { status: 503 });
  const sent = await sendPasswordOtpEmail({ id: context.user.id, email: context.user.email, name: context.user.name });
  if (!sent) return NextResponse.json({ error: "The code could not be sent right now (at most 5 an hour). Try again a little later." }, { status: 429 });
  const [name, domain] = context.user.email.split("@");
  return NextResponse.json({ ok: true, sentTo: `${name.slice(0, 2)}***@${domain}`, validMinutes: 10 });
}
