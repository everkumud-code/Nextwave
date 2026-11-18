import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encrypts secrets (an e-mail app password, a payment salt, an access token) before they are saved in the database,
 * so a copy of the database alone does not give them away. AES-256-GCM; the key is derived from a server secret.
 */
function key(): Buffer {
  const source = process.env.APP_ENCRYPTION_KEY?.trim() || process.env.QR_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!source) throw new Error("NO_ENCRYPTION_KEY");
  return createHash("sha256").update(`nextwave-secret-box:${source}`).digest();
}

export function secretBoxAvailable(): boolean {
  return Boolean(process.env.APP_ENCRYPTION_KEY?.trim() || process.env.QR_CREDENTIAL_ENCRYPTION_KEY?.trim());
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith("v1:")) throw new Error("UNKNOWN_SECRET_FORMAT");
  const raw = Buffer.from(stored.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
