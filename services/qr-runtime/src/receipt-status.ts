export type QrDeliveryStatus = "FAILED" | "SENT" | "DELIVERED" | "READ";

const rank: Record<QrDeliveryStatus, number> = {
  FAILED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
};

export function highestReceiptStatus(
  current: QrDeliveryStatus,
  incoming: QrDeliveryStatus,
): QrDeliveryStatus {
  return rank[incoming] > rank[current] ? incoming : current;
}

export function receiptCanAdvance(current: string, incoming: QrDeliveryStatus): boolean {
  if (current === "CANCELLED") return false;
  const currentRank = current in rank ? rank[current as QrDeliveryStatus] : 0;
  return rank[incoming] > currentRank || current === "FAILED";
}
