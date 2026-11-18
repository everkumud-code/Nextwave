import { renderMessageTemplate, type MessageTemplateContact } from "@/lib/message-template";

/** What a campaign sends besides (or instead of) text: a map pin, or an approved official-API template. */
export type Pin = { lat: number; lng: number; name: string | null; address: string | null };

export type CampaignContentFields = {
  messageBody?: string | null;
  mediaAssetId?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  locationName?: string | null;
  locationAddress?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  templateParams?: string[] | null;
};

/** Add these to a campaign `select` to read the pin and the template. */
export const CONTENT_SELECT = {
  locationLat: true, locationLng: true, locationName: true, locationAddress: true,
  templateName: true, templateLanguage: true, templateParams: true,
} as const;

export function campaignPin(c: CampaignContentFields): Pin | null {
  if (typeof c.locationLat !== "number" || typeof c.locationLng !== "number") return null;
  return { lat: c.locationLat, lng: c.locationLng, name: c.locationName ?? null, address: c.locationAddress ?? null };
}

export type TemplateRef = { name: string; language: string; params: string[] };

export function campaignTemplate(c: CampaignContentFields): TemplateRef | null {
  if (!c.templateName) return null;
  return { name: c.templateName, language: c.templateLanguage || "en", params: c.templateParams ?? [] };
}

/** Reads {lat, lng, name?, address?} (or null to remove the pin) from a request body. */
export function parsePinInput(value: unknown): { pin: Pin | null } | { error: string } {
  if (value === null || value === undefined || value === "") return { pin: null };
  if (typeof value !== "object" || Array.isArray(value)) return { error: "The location must have a latitude and a longitude." };
  const input = value as Record<string, unknown>;
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (input.lat === "" || input.lng === "" || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: "Latitude must be between -90 and 90, and longitude between -180 and 180." };
  }
  const text = (v: unknown, max: number) => typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  return { pin: { lat, lng, name: text(input.name, 100), address: text(input.address, 200) } };
}

export function hasContent(c: CampaignContentFields): boolean {
  return Boolean(c.messageBody?.trim() || c.mediaAssetId || campaignPin(c) || c.templateName);
}

/** The first thing wrong with what a campaign is about to send, given the kind of number it sends from (or null). */
export function contentProblem(c: CampaignContentFields, connector: string | null | undefined): string | null {
  const pin = campaignPin(c);
  if (connector === "META_CLOUD_API") {
    if (!c.templateName) return "An official WhatsApp number can start a chat only with an approved template. Choose one.";
    if (c.messageBody?.trim() || c.mediaAssetId || pin) return "With an official number the message is the approved template; remove the free text, file and location.";
    return null;
  }
  if (!c.messageBody?.trim() && !c.mediaAssetId && !pin) return "Add a message, a file or a location before sending.";
  if (c.mediaAssetId && pin) return "Send either a file or a location in one campaign, not both.";
  return null;
}

/** A template variable is "text:fixed words", or a contact field such as firstName, city or city|there. */
export function templateParamIsValid(spec: string): boolean {
  if (spec.startsWith("text:")) return spec.length > 5 && spec.length <= 200;
  return /^[a-zA-Z][a-zA-Z0-9_]*(\|[^}]{0,100})?$/.test(spec);
}

/** The words that go into {{1}}, {{2}} ... for one person. WhatsApp refuses an empty value, so an empty one becomes "-". */
export function templateValues(specs: readonly string[], contact: MessageTemplateContact): string[] {
  return specs.map(spec => {
    const text = spec.startsWith("text:") ? spec.slice(5).trim() : renderMessageTemplate(`{{${spec}}}`, contact);
    return (text || "-").replace(/[\r\n\t]+/g, " ").slice(0, 1000);
  });
}

/** How a template message is shown in reports (the customer sees the approved template text, we only know its name and values). */
export function templateSummary(template: TemplateRef, values: readonly string[]): string {
  return `[template ${template.name}] ${values.join(" | ")}`.slice(0, 4000);
}
