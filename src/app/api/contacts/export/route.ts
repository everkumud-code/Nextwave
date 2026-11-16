import { getAuthContext, isPlatformAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

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
    select: { phoneNumberE164: true, firstName: true, lastName: true, email: true, company: true, status: true, source: true, createdAt: true },
  });
  const header = ["phone_e164","first_name","last_name","email","company","status","source","created_at"];
  const rows = contacts.map(c => [c.phoneNumberE164,c.firstName,c.lastName,c.email,c.company,c.status,c.source,c.createdAt.toISOString()].map(csvCell).join(","));
  return new Response([header.map(csvCell).join(","), ...rows].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="nextwave-contacts.csv"',
      "Cache-Control": "no-store",
    },
  });
}
