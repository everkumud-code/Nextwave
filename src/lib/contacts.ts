export type NormalizedPhone = { national: string; e164: string };

export function normalizePhoneNumber(value: string, defaultCountry = "IN"): NormalizedPhone | null {
  const raw = value.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) {
    if (!/^[1-9]\d{7,14}$/.test(digits)) return null;
    return { national: digits, e164: `+${digits}` };
  }
  if (defaultCountry === "IN") {
    const national = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
    if (!/^[6-9]\d{9}$/.test(national)) return null;
    return { national, e164: `+91${national}` };
  }
  return null;
}

export function cleanOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().slice(0, maxLength);
  return cleaned || null;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
