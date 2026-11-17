/**
 * Daily sending limit per sender, with a warm-up for new numbers.
 * A number that has just been linked and suddenly sends hundreds of messages is the quickest way to get it restricted,
 * so the allowance grows with the days since it was first connected. Pure functions; the dispatcher applies them.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Messages a number may send in one day, by the number of full days since it was first connected. */
export function dailyLimitForAge(daysSinceFirstConnected: number): number {
  const days = Math.max(0, Math.floor(daysSinceFirstConnected));
  if (days < 3) return 50;
  if (days < 7) return 100;
  if (days < 14) return 200;
  return 400;
}

export function daysSince(first: Date, now: Date): number {
  return Math.max(0, (now.getTime() - first.getTime()) / DAY_MS);
}

/** The instant a local calendar day starts in the given IANA time zone (falls back to Asia/Kolkata). */
export function startOfLocalDay(now: Date, timeZone: string): Date {
  const zone = isValidZone(timeZone) ? timeZone : "Asia/Kolkata";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
  const sinceMidnightMs = ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - sinceMidnightMs);
}

/** The next local midnight after `now` (a day is taken as 24 hours, which holds for the zones in use). */
export function startOfNextLocalDay(now: Date, timeZone: string): Date {
  return new Date(startOfLocalDay(now, timeZone).getTime() + DAY_MS);
}

function isValidZone(zone: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
}
