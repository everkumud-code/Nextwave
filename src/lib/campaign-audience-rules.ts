export type ConsentSnapshot = { status: "GRANTED" | "WITHDRAWN" | "UNKNOWN" };

export function hasCurrentMarketingConsent(records: ConsentSnapshot[]): boolean {
  return records[0]?.status === "GRANTED";
}
