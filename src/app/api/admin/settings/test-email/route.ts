import { NextResponse } from "next/server";
import { getAuthContext, isPlatformAdminUser } from "@/lib/auth";
import { sendTestMail } from "@/lib/mailer";

export const runtime = "nodejs";

/** Sends one test e-mail (to the admin's own address unless another one is given) and says in plain words if it did not work. */
export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!isPlatformAdminUser(context.user)) return NextResponse.json({ error: "Platform admin access required." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const to = typeof body?.to === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.to.trim()) ? body.to.trim() : context.user.email;
  const result = await sendTestMail(to);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 502 });
  return NextResponse.json({ ok: true, to });
}
