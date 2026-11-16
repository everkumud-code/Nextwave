export type MessageTemplateContact = {
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  phoneNumber?: string | null;
};

export const MESSAGE_TEMPLATE_VARIABLES = ["firstName", "lastName", "company", "phoneNumber"] as const;
const supported = new Set<string>(MESSAGE_TEMPLATE_VARIABLES);

export function findUnsupportedTemplateVariables(template: string): string[] {
  const variables = [...template.matchAll(/{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g)].map(match => match[1]);
  return [...new Set(variables.filter(variable => !supported.has(variable)))];
}

export function renderMessageTemplate(template: string, contact: MessageTemplateContact): string {
  const values: Record<string, string> = {
    firstName: contact.firstName ?? "",
    lastName: contact.lastName ?? "",
    company: contact.company ?? "",
    phoneNumber: contact.phoneNumber ?? "",
  };
  return template.replace(/{{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g, (_match, key: string) => values[key] ?? "");
}
