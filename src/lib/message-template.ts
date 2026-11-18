export type MessageTemplateContact = {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  phoneNumber?: string | null;
  /** The extra columns of the contact's row (city, order number, ...): any of them can be used in a message. */
  custom?: unknown;
};

export const MESSAGE_TEMPLATE_VARIABLES = ["firstName", "lastName", "company", "phoneNumber"] as const;
const builtin = new Set<string>(MESSAGE_TEMPLATE_VARIABLES);

/**
 * A variable is {{name}}, or {{name|what to write when it is empty}}, for example "Hello {{firstName|there}}".
 * name is one of firstName, lastName, company, phoneNumber, or any extra column of the imported file (city, amount, ...).
 */
const VARIABLE = /{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*(?:\|([^}]*))?}}/g;

export function templateVariableNames(template: string): string[] {
  return [...new Set([...template.matchAll(VARIABLE)].map(match => match[1]))];
}

/** Names that are neither built in nor an extra column of any contact (knownCustom), most likely a typing mistake. */
export function findUnsupportedTemplateVariables(template: string, knownCustom: readonly string[] = []): string[] {
  const custom = new Set(knownCustom);
  return templateVariableNames(template).filter(name => !builtin.has(name) && !custom.has(name));
}

function customValue(custom: unknown, key: string): string {
  if (!custom || typeof custom !== "object" || Array.isArray(custom)) return "";
  const value = (custom as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

export function renderMessageTemplate(template: string, contact: MessageTemplateContact): string {
  const values: Record<string, string> = {
    firstName: contact.firstName ?? "",
    lastName: contact.lastName ?? "",
    company: contact.company ?? "",
    phoneNumber: contact.phoneNumber ?? "",
  };
  return template.replace(VARIABLE, (_match, key: string, fallback: string | undefined) => {
    const value = (builtin.has(key) ? values[key] : customValue(contact.custom, key)).trim();
    return value || (fallback ?? "").trim();
  });
}
