/**
 * Rules that stop a campaign by itself before a struggling number is made worse.
 * Pure functions, so they are easy to test; the dispatcher applies them.
 */

/** Error codes that say nothing about the health of the number (a person withdrew consent, bad data). */
const NOT_A_SENDER_PROBLEM = new Set(["CONSENT_REVOKED", "INVALID_MESSAGE", "UNSUPPORTED_CONNECTOR"]);

export const FAILURE_WINDOW = 10;
export const FAILURE_LIMIT = 5;

export type RecentOutcome = { status: string; errorCode: string | null };

/**
 * Looks at the most recent finished messages of a campaign (newest first). When at least
 * FAILURE_LIMIT of the last FAILURE_WINDOW ended in a delivery failure, the campaign should pause.
 */
export function shouldPauseForFailures(recent: RecentOutcome[]): boolean {
  const window = recent.filter(item => !(item.status === "FAILED" && item.errorCode && NOT_A_SENDER_PROBLEM.has(item.errorCode))).slice(0, FAILURE_WINDOW);
  if (window.length < FAILURE_WINDOW) return false;
  return window.filter(item => item.status === "FAILED").length >= FAILURE_LIMIT;
}
