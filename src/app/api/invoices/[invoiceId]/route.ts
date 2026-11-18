import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ invoiceId: string }> };

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rupees = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

/** A printable invoice (open it and press Print / Save as PDF). Only the client it belongs to can open it. */
export async function GET(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return new Response("Authentication required.", { status: 401 });
  const { invoiceId } = await route.params;
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, organizationId: context.organization.id },
    include: { organization: { select: { name: true, clientCode: true } } },
  });
  if (!invoice) return new Response("Invoice not found.", { status: 404 });
  const date = invoice.issuedAt.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice ${esc(invoice.invoiceNumber)}</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#0f172a;margin:0;background:#f8fafc}.page{max-width:760px;margin:24px auto;background:#fff;padding:40px;border:1px solid #e2e8f0;border-radius:12px}
h1{margin:0;font-size:26px;letter-spacing:.02em}.muted{color:#64748b;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:28px}th,td{text-align:left;padding:12px 8px;border-bottom:1px solid #e2e8f0;font-size:14px}th{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#64748b}
.right{text-align:right}.total{font-size:20px;font-weight:700}.row{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-top:24px}button{margin-top:24px;padding:10px 18px;border:0;border-radius:10px;background:#0A78CC;color:#fff;font-weight:600;cursor:pointer}
@media print{body{background:#fff}.page{border:0;margin:0}button{display:none}}</style></head><body><div class="page">
<h1>NextWave</h1><p class="muted">A Next Resource product · Boom PR &amp; Media LLP</p>
<div class="row"><div><p class="muted">Invoice number</p><p><b>${esc(invoice.invoiceNumber)}</b></p></div><div><p class="muted">Date</p><p><b>${esc(date)}</b></p></div><div><p class="muted">Billed to</p><p><b>${esc(invoice.organization.name)}</b><br><span class="muted">Client ID ${esc(invoice.organization.clientCode ?? "")}</span></p></div></div>
<table><thead><tr><th>Description</th><th class="right">Amount</th></tr></thead><tbody><tr><td>${esc(invoice.description)}</td><td class="right">${esc(rupees(invoice.amountPaise))}</td></tr></tbody></table>
<p class="right total" style="text-align:right;margin-top:20px">Total paid: ${esc(rupees(invoice.amountPaise))}</p>
<p class="muted" style="margin-top:28px">This is a receipt for prepaid WhatsApp messaging credit that has been added to your NextWave wallet. Tax details are shown only if they were agreed with you in writing.</p>
<button onclick="window.print()">Print / Save as PDF</button></div></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" } });
}
