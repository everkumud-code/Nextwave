/**
 * A small client for Meta's WhatsApp Cloud API (the Graph API). Nothing here stores anything; the adapter and the
 * sender routes decide where tokens live. The base address can be changed with META_GRAPH_BASE (used by the tests).
 */
export const GRAPH_VERSION = process.env.META_GRAPH_VERSION?.trim() || "v21.0";

function base(): string {
  return (process.env.META_GRAPH_BASE?.trim() || "https://graph.facebook.com").replace(/\/+$/, "");
}

export type GraphError = { httpStatus: number; code: number | null; subcode: number | null; message: string };

export class GraphRequestError extends Error {
  constructor(readonly detail: GraphError) { super(detail.message); }
}

async function call<T>(token: string, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base()}/${GRAPH_VERSION}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new GraphRequestError({ httpStatus: 0, code: null, subcode: null, message: error instanceof Error ? error.message : "Network error" });
  }
  const data = await response.json().catch(() => ({})) as { error?: { message?: string; code?: number; error_subcode?: number; error_data?: { details?: string } } } & T;
  if (!response.ok || data.error) {
    const detail = data.error?.error_data?.details || data.error?.message || `Meta answered with status ${response.status}`;
    throw new GraphRequestError({ httpStatus: response.status, code: data.error?.code ?? null, subcode: data.error?.error_subcode ?? null, message: detail.slice(0, 500) });
  }
  return data;
}

export type PhoneInfo = { id: string; displayPhoneNumber: string; verifiedName: string | null; qualityRating: string | null };

/** Checks that the token can use this phone number ID, and reads its public details. */
export async function getPhoneInfo(token: string, phoneNumberId: string): Promise<PhoneInfo> {
  const data = await call<{ id: string; display_phone_number?: string; verified_name?: string; quality_rating?: string }>(token, "GET", `${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name,quality_rating`);
  return { id: data.id, displayPhoneNumber: data.display_phone_number ?? "", verifiedName: data.verified_name ?? null, qualityRating: data.quality_rating ?? null };
}

export type TemplateInfo = { name: string; language: string; category: string | null; bodyText: string; bodyVariableCount: number; hasHeaderMedia: boolean; hasButtonVariables: boolean };

type RawTemplate = { name: string; language: string; status: string; category?: string; components?: Array<{ type: string; format?: string; text?: string; buttons?: Array<{ type?: string; url?: string }> }> };

/** The approved templates of the business account: only these can be sent. */
export async function listApprovedTemplates(token: string, wabaId: string): Promise<TemplateInfo[]> {
  const out: TemplateInfo[] = [];
  let path: string | null = `${encodeURIComponent(wabaId)}/message_templates?fields=name,language,status,category,components&limit=100`;
  for (let page = 0; path && page < 10; page++) {
    const data: { data?: RawTemplate[]; paging?: { next?: string } } = await call(token, "GET", path);
    for (const template of data.data ?? []) {
      if (template.status !== "APPROVED") continue;
      const body = template.components?.find(component => component.type === "BODY");
      const header = template.components?.find(component => component.type === "HEADER");
      const text = body?.text ?? "";
      const numbers = [...text.matchAll(/{{\s*(\d+)\s*}}/g)].map(match => Number(match[1]));
      out.push({
        name: template.name, language: template.language, category: template.category ?? null, bodyText: text,
        bodyVariableCount: numbers.length ? Math.max(...numbers) : 0,
        hasHeaderMedia: Boolean(header && header.format && header.format !== "TEXT"),
        hasButtonVariables: Boolean(template.components?.some(component => component.type === "BUTTONS" && component.buttons?.some(button => button.url?.includes("{{")))),
      });
    }
    const next: string | undefined = data.paging?.next;
    // the next page address is a full URL: keep only what follows the version
    path = next ? next.slice(next.indexOf(`/${GRAPH_VERSION}/`) + GRAPH_VERSION.length + 2) : null;
  }
  return out;
}

/** Sends an approved template with text variables in the body. Returns Meta's message id (wamid...). */
export async function sendTemplateMessage(token: string, phoneNumberId: string, toDigits: string, template: { name: string; language: string; params: string[] }): Promise<string> {
  const data = await call<{ messages?: Array<{ id?: string }> }>(token, "POST", `${encodeURIComponent(phoneNumberId)}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: toDigits,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      ...(template.params.length ? { components: [{ type: "body", parameters: template.params.map(text => ({ type: "text", text })) }] } : {}),
    },
  });
  const id = data.messages?.[0]?.id;
  if (!id) throw new GraphRequestError({ httpStatus: 200, code: null, subcode: null, message: "Meta did not return a message id." });
  return id;
}

/** Turns a Meta error into one of our error codes (which decide whether the message is tried again). */
export function mapGraphError(error: GraphError): { errorCode: string; errorMessage: string } {
  const message = error.message;
  if (error.httpStatus === 0 || error.httpStatus >= 500) return { errorCode: "TEMPORARY_PROVIDER_ERROR", errorMessage: message };
  const code = error.code ?? 0;
  if (code === 190 || code === 102 || error.httpStatus === 401) return { errorCode: "AUTHENTICATION_FAILED", errorMessage: "Meta did not accept the access token. Update the token of this sender." };
  if (code === 4 || code === 80007 || code === 130429 || code === 131056 || error.httpStatus === 429) return { errorCode: "RATE_LIMITED", errorMessage: message };
  if (code === 131026 || code === 131021) return { errorCode: "INVALID_RECIPIENT", errorMessage: "This number cannot receive WhatsApp messages." };
  return { errorCode: "INVALID_MESSAGE", errorMessage: message };
}
