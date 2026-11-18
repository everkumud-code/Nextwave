import { prisma } from "@/lib/db/prisma";
import { decryptSecret, encryptSecret } from "@/lib/secret-box";

/**
 * Settings the platform admin enters on a screen. Every one can also come from the server's environment (the screen wins).
 * Secrets are stored encrypted and are never sent back to the browser.
 */
export const SETTING_DEFS = {
  "smtp.host": { env: "SMTP_HOST", secret: false, label: "Mail server" },
  "smtp.port": { env: "SMTP_PORT", secret: false, label: "Port" },
  "smtp.user": { env: "SMTP_USER", secret: false, label: "Mail account (e-mail address)" },
  "smtp.pass": { env: "SMTP_PASS", secret: true, label: "App password" },
  "smtp.from": { env: "SMTP_FROM", secret: false, label: "Sender name and address" },
  "payu.key": { env: "PAYU_KEY", secret: false, label: "Merchant key" },
  "payu.salt": { env: "PAYU_SALT", secret: true, label: "Merchant salt" },
  "payu.mode": { env: "PAYU_MODE", secret: false, label: "Mode (test or live)" },
  "meta.appSecret": { env: "META_APP_SECRET", secret: true, label: "Meta app secret" },
  "meta.verifyToken": { env: "META_WEBHOOK_VERIFY_TOKEN", secret: true, label: "Webhook verify token" },
} as const;

export type SettingKey = keyof typeof SETTING_DEFS;
export const SETTING_KEYS = Object.keys(SETTING_DEFS) as SettingKey[];

let cache: { at: number; values: Map<string, string> } | null = null;
const TTL_MS = 10_000;

export function forgetSettingsCache() { cache = null; }

async function stored(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values;
  const values = new Map<string, string>();
  try {
    const rows = await prisma.platformSetting.findMany();
    for (const row of rows) {
      try { values.set(row.key, row.isSecret ? decryptSecret(row.value) : row.value); } catch { /* an unreadable secret counts as not set */ }
    }
  } catch { /* the table may not exist yet while a deploy is running */ }
  cache = { at: Date.now(), values };
  return values;
}

/** The value of a setting: from the screen if set there, otherwise from the server environment, otherwise null. */
export async function getSetting(key: SettingKey): Promise<string | null> {
  const fromScreen = (await stored()).get(key);
  if (fromScreen !== undefined && fromScreen !== "") return fromScreen;
  const fromEnv = process.env[SETTING_DEFS[key].env]?.trim();
  return fromEnv || null;
}

export async function getSettings(keys: readonly SettingKey[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  for (const key of keys) out[key] = await getSetting(key);
  return out;
}

export type SettingStatus = { key: SettingKey; label: string; secret: boolean; source: "screen" | "server" | null; value: string | null };

/** What the settings screen shows: where each value comes from, and the value itself except for secrets. */
export async function describeSettings(): Promise<SettingStatus[]> {
  const fromScreen = await stored();
  return SETTING_KEYS.map(key => {
    const def = SETTING_DEFS[key];
    const screen = fromScreen.get(key);
    const env = process.env[def.env]?.trim();
    const source = screen ? "screen" : env ? "server" : null;
    const value = def.secret ? null : (screen || env || null);
    return { key, label: def.label, secret: def.secret, source, value };
  });
}

export async function saveSetting(key: SettingKey, value: string | null, userId: string | null): Promise<void> {
  const def = SETTING_DEFS[key];
  if (value === null || value === "") {
    await prisma.platformSetting.deleteMany({ where: { key } });
  } else {
    const data = def.secret ? encryptSecret(value) : value;
    await prisma.platformSetting.upsert({
      where: { key },
      create: { key, value: data, isSecret: def.secret, updatedById: userId },
      update: { value: data, isSecret: def.secret, updatedById: userId },
    });
  }
  forgetSettingsCache();
}
