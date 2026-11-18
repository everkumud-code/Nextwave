import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { loadOfficialCredentials } from "@/lib/connectors/meta-cloud/adapter";
import { GraphRequestError, listApprovedTemplates, mapGraphError } from "@/lib/connectors/meta-cloud/graph";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ senderId: string }> };

/** The approved message templates of an official sender's business account (read from Meta each time, so a newly approved one shows up at once). */
export async function GET(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { senderId } = await route.params;
  const credentials = await loadOfficialCredentials(senderId, context.organization.id);
  if (!credentials) return NextResponse.json({ error: "This is not an official WhatsApp number, or its token is missing." }, { status: 404 });
  try {
    return NextResponse.json({ templates: await listApprovedTemplates(credentials.token, credentials.wabaId) });
  } catch (error) {
    const message = error instanceof GraphRequestError ? mapGraphError(error.detail).errorMessage : "Meta could not be reached.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
