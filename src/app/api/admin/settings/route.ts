import { NextResponse } from "next/server";
import { getAuthContext, isPlatformAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { appUrl } from "@/lib/mailer";
import { SETTING_DEFS, SETTING_KEYS, describeSettings, saveSetting, type SettingKey } from "@/lib/platform-settings";
import { secretBoxAvailable } from "@/lib/secret-box";

export const runtime = "nodejs";

async function adminOnly() {
  const context = await getAuthContext();
  if (!context) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401 }) } as const;
  if (!isPlatformAdminUser(context.user)) return { error: NextResponse.json({ error: "Platform admin access required." }, { status: 403 }) } as const;
  return { context } as const;
}

/** What is set and where it comes from. Secret values (app password, salt, token) are never sent back. */
export async function GET(request: Request) {
  const checked = await adminOnly();
  if ("error" in checked) return checked.error;
  const base = appUrl(request);
  return NextResponse.json({
    settings: await describeSettings(),
    encryptionAvailable: secretBoxAvailable(),
    urls: { payuReturn: `${base}/api/payments/payu/return`, metaWebhook: `${base}/api/webhooks/meta` },
  });
}

const validators: Partial<Record<SettingKey, (value: string) => string | null>> = {
  "smtp.port": value => /^\d{2,5}$/.test(value) && Number(value) <= 65535 ? null : "The port is a number such as 587 or 465.",
  "smtp.host": value => /^[A-Za-z0-9.-]{3,200}$/.test(value) ? null : "The mail server looks like smtp.gmail.com.",
  "smtp.user": value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "The mail account is an e-mail address.",
  "smtp.from": value => value.length <= 200 && !/[\r\n]/.test(value) ? null : "The sender name and address is too long.",
  "payu.mode": value => value === "test" || value === "live" ? null : "The mode is test or live.",
  "payu.key": value => /^[A-Za-z0-9_-]{3,60}$/.test(value) ? null : "The merchant key has letters and numbers only.",
  "payu.salt": value => /^[A-Za-z0-9_-]{3,100}$/.test(value) ? null : "The merchant salt has letters and numbers only.",
};

/** Save changed values: {"values": {"smtp.host": "smtp.gmail.com", "smtp.pass": "...", "payu.salt": null}}. null or "" clears a value. */
export async function PUT(request: Request) {
  const checked = await adminOnly();
  if ("error" in checked) return checked.error;
  const { context } = checked;
  const body = await request.json().catch(() => ({}));
  const values = body?.values && typeof body.values === "object" ? body.values as Record<string, unknown> : {};
  const entries = Object.entries(values);
  if (!entries.length) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  const changes: [SettingKey, string | null][] = [];
  for (const [key, raw] of entries) {
    if (!(SETTING_KEYS as string[]).includes(key)) return NextResponse.json({ error: `Unknown setting ${key}.` }, { status: 400 });
    if (raw !== null && typeof raw !== "string") return NextResponse.json({ error: "Values must be text." }, { status: 400 });
    const value = raw === null ? null : raw.trim();
    if (value && value.length > 500) return NextResponse.json({ error: "A value is too long." }, { status: 400 });
    const problem = value ? validators[key as SettingKey]?.(value) : null;
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    changes.push([key as SettingKey, value || null]);
  }
  if (!secretBoxAvailable() && changes.some(([key, value]) => SETTING_DEFS[key].secret && value)) {
    return NextResponse.json({ error: "The server has no encryption key, so secrets cannot be stored safely. Ask the developer to set APP_ENCRYPTION_KEY." }, { status: 503 });
  }
  for (const [key, value] of changes) await saveSetting(key, value, context.user.id);
  // only the names of what changed are written to the log, never the values
  await prisma.auditLog.create({ data: { organizationId: context.organization.id, actorUserId: context.user.id, action: "admin.settings_changed", resourceType: "PlatformSetting", metadata: { keys: changes.map(([key, value]) => `${key}:${value === null ? "cleared" : "set"}`) } } });
  return NextResponse.json({ settings: await describeSettings() });
}
