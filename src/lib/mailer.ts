import nodemailer from "nodemailer";
import { getSettings } from "@/lib/platform-settings";

export type MailConfig = { host: string; port: number; user: string | null; pass: string | null; from: string };

/** The mail account entered on the settings screen (or in the server environment). null while it is not set: every e-mail feature then stays quietly off. */
export async function getMailConfig(): Promise<MailConfig | null> {
  const s = await getSettings(["smtp.host", "smtp.port", "smtp.user", "smtp.pass", "smtp.from"]);
  const host = s["smtp.host"];
  const user = s["smtp.user"];
  // the sender address defaults to the account itself
  const from = s["smtp.from"] || (user ? `NextWave <${user}>` : null);
  if (!host || !from) return null;
  return { host, port: Number(s["smtp.port"]) || 587, user: user ?? null, pass: s["smtp.pass"] ?? null, from };
}

export async function mailConfigured(): Promise<boolean> {
  return (await getMailConfig()) !== null;
}

export function appUrl(request?: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured && !configured.includes("localhost")) return configured;
  if (request) return new URL(request.url).origin;
  return configured || "http://localhost:3000";
}

function transportFor(config: MailConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: config.user ? { user: config.user, pass: config.pass ?? "" } : undefined,
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

export async function sendMail(input: { to: string; subject: string; text: string; html?: string }): Promise<boolean> {
  const config = await getMailConfig();
  if (!config) return false;
  try {
    await transportFor(config).sendMail({ from: config.from, to: input.to, subject: input.subject, text: input.text, html: input.html });
    return true;
  } catch (error) {
    console.error("Sending e-mail failed", error instanceof Error ? error.message : error);
    return false;
  }
}

/** Sends one test mail and says in plain words what went wrong, so the admin can fix the account (the password is never part of the message). */
export async function sendTestMail(to: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const config = await getMailConfig();
  if (!config) return { ok: false, reason: "The mail account is not set yet." };
  try {
    await transportFor(config).sendMail({ from: config.from, to, subject: "NextWave test e-mail", text: "This is a test e-mail from NextWave. If you can read it, password reset e-mails and OTP codes will reach your customers." });
    return { ok: true };
  } catch (error) {
    const raw = error instanceof Error ? `${error.message}` : "";
    if (/Invalid login|535|Username and Password not accepted|AUTH/i.test(raw)) return { ok: false, reason: "The mail server did not accept the account or the app password. For Gmail, use a 16-letter App Password (not the normal password); 2-step verification must be on." };
    if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ESOCKET|timeout/i.test(raw)) return { ok: false, reason: "The mail server could not be reached. Check the server name and the port (587 for most, 465 for SSL)." };
    return { ok: false, reason: `The mail server refused the message: ${raw.slice(0, 160)}` };
  }
}

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** One plain, safe layout for every message NextWave sends. */
export function mailLayout(heading: string, body: string, buttonLabel: string, link: string): { text: string; html: string } {
  return {
    text: `${heading}\n\n${body}\n\n${buttonLabel}: ${link}\n\nIf you did not ask for this, you can ignore this message.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0f172a"><h2 style="margin:0 0 12px">${esc(heading)}</h2><p style="line-height:1.6">${esc(body)}</p><p style="margin:24px 0"><a href="${esc(link)}" style="background:#0A78CC;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${esc(buttonLabel)}</a></p><p style="color:#64748b;font-size:12px;line-height:1.5">If the button does not work, copy this link into your browser:<br>${esc(link)}<br><br>If you did not ask for this, you can ignore this message.</p></div>`,
  };
}
