/**
 * Rotating pace for an ordinary (QR) number: the gap between two messages is not fixed but a random number of seconds
 * between 10 and 90, so the sending does not look like a machine ticking every minute.
 */
export const MIN_GAP_MS = 10_000;
export const MAX_GAP_MS = 90_000;

export function randomGapMs(random: () => number = Math.random): number {
  return MIN_GAP_MS + Math.floor(random() * (MAX_GAP_MS - MIN_GAP_MS + 1));
}
