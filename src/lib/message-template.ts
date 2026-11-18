export type MessageTemplateContact = {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  phoneNumber?: string | null;
  /** The extra columns of the contact's row (city, order number, ...): any of them can be used in a message. */
  custom?: unknown;
};

export const MESSAGE_TEMPLATE_VARIABLES = ["firstName", "lastName", "company", "phoneNumber"] as const;

/**
 * A variable is {{name}}, or {{name|what to write when it is empty}}, for example "Hello {{First Name|there}}".
 * The name is not picky about capital letters, spaces or underscores: {{First Name}}, {{firstName}} and {{first_name}} are the same.
 * It is one of the four built in (first name, last name, company, phone number, with the usual short forms) or any extra column of the imported file.
 */
const VARIABLE = /{{\s*([^{}|]*?)\s*(?:\|([^{}]*))?}}/g;

const squash = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, "");

const BUILTIN_BY_NAME: Record<string, (typeof MESSAGE_TEMPLATE_VARIABLES)[number]> = {
  firstname: "firstName", name: "firstName", customername: "firstName", fullname: "firstName",
  lastname: "lastName", surname: "lastName",
  company: "company", companyname: "company", organisation: "company", organization: "company",
  phonenumber: "phoneNumber", phone: "phoneNumber", mobile: "phoneNumber", mobilenumber: "phoneNumber", whatsapp: "phoneNumber",
};

export function templateVariableNames(template: string): string[] {
  return [...new Set([...template.matchAll(VARIABLE)].map(match => match[1].trim()))];
}

/** Names that are neither built in nor an extra column of any contact (knownCustom), most likely a typing mistake. They would otherwise go out as raw {{...}} text. */
export function findUnsupportedTemplateVariables(template: string, knownCustom: readonly string[] = []): string[] {
  const custom = new Set(knownCustom.map(squash));
  return templateVariableNames(template).filter(name => !name || (!BUILTIN_BY_NAME[squash(name)] && !custom.has(squash(name))));
}

function customValue(custom: unknown, name: string): string {
  if (!custom || typeof custom !== "object" || Array.isArray(custom)) return "";
  const wanted = squash(name);
  for (const [key, value] of Object.entries(custom as Record<string, unknown>)) {
    if (squash(key) !== wanted) continue;
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
  }
  return "";
}

export function renderMessageTemplate(template: string, contact: MessageTemplateContact): string {
  const values: Record<string, string> = {
    firstName: contact.firstName ?? "",
    lastName: contact.lastName ?? "",
    company: contact.company ?? "",
    phoneNumber: contact.phoneNumber ?? "",
  };
  return template.replace(VARIABLE, (_match, rawName: string, fallback: string | undefined) => {
    const builtin = BUILTIN_BY_NAME[squash(rawName)];
    const value = (builtin ? values[builtin] : customValue(contact.custom, rawName)).trim();
    return value || (fallback ?? "").trim();
  });
}
