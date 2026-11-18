import { getAuthContext, isPlatformAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { parseFormat, tableResponse } from "@/lib/table-output";

export const runtime = "nodejs";

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) return new Response("Authentication required.", { status: 401 });
  const requestedOrganizationId = new URL(request.url).searchParams.get("organizationId");
  if (requestedOrganizationId && !isPlatformAdminUser(context.user)) return new Response("Platform admin access required.", { status: 403 });
  const organizationId = requestedOrganizationId || context.organization.id;
  const contacts = await prisma.contact.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50000,
    select: { phoneNumberE164: true, firstName: true, lastName: true, email: true, company: true, tags: true, customFields: true, status: true, source: true, createdAt: true },
  });
  // every extra field (city, order_no ...) of any contact becomes a column of its own, so the file can be imported again as it is
  const extraKeys = [...new Set(contacts.flatMap(c => c.customFields && typeof c.customFields === "object" && !Array.isArray(c.customFields) ? Object.keys(c.customFields) : []))].slice(0, 40);
  const header = ["phone_e164","first_name","last_name","email","company","tags","status","source","created_at", ...extraKeys];
  const table = contacts.map(c => {
    const custom = (c.customFields && typeof c.customFields === "object" && !Array.isArray(c.customFields) ? c.customFields : {}) as Record<string, unknown>;
    return [c.phoneNumberE164,c.firstName,c.lastName,c.email,c.company,c.tags.join(", "),c.status,c.source,c.createdAt.toISOString(), ...extraKeys.map(key => custom[key] === undefined ? "" : String(custom[key]))];
  });
  const format = parseFormat(new URL(request.url).searchParams.get("format"));
  if (format !== "csv") return tableResponse({ format, fileBase: "nextwave-contacts", title: "Contacts", header, rows: table, pdfColumns: [0, 1, 2, 3, 4, 5, 6] });
  const rows = table.map(row => row.map(csvCell).join(","));
  return new Response([header.map(csvCell).join(","), ...rows].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="nextwave-contacts.csv"',
      "Cache-Control": "no-store",
    },
  });
}
