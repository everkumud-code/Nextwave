/** Tag names are short, lower case words: "VIP", " Delhi  North " -> "vip", "delhi north". */
export function cleanTag(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40) : "";
}

export function cleanTags(value: unknown, max = 30): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanTag).filter(Boolean))].slice(0, max);
}
