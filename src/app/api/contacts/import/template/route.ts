import { getAuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/** A sample file to fill in: the columns the import understands, with two example rows. Opens in Excel. */
export async function GET() {
  const context = await getAuthContext();
  if (!context) return new Response(JSON.stringify({ error: "Authentication required." }), { status: 401, headers: { "Content-Type": "application/json" } });
  const rows = [
    "phone,first_name,last_name,email,company,whatsapp_consent",
    "9876543210,Asha,Verma,asha@example.com,Verma Traders,yes",
    "+919812345678,Rahul,,rahul@example.com,,yes",
  ];
  return new Response("﻿" + rows.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="nextwave-contacts-sample.csv"',
      "Cache-Control": "no-store",
    },
  });
}
