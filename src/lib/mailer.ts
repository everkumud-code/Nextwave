import nodemailer from "nodemailer";

/** E-mail works only when the owner has put the SMTP details in the server settings; without them every e-mail feature stays quietly off. */
export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_FROM?.trim());
}

export function appUrl(request?: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (configured && !configured.includes("localhost")) return configured;
  if (request) return new URL(request.url).origin;
  return configured || "http://localhost:3000";
}

export async function sendMail(input: { to: string; subject: string; text: string; html?: string }): Promise<boolean> {
  if (!mailConfigured()) return false;
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
  try {
    await transport.sendMail({ from: process.env.SMTP_FROM!.trim(), to: input.to, subject: input.subject, text: input.text, html: input.html });
    return true;
  } catch (error) {
    console.error("Sending e-mail failed", error instanceof Error ? error.message : error);
    return false;
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
