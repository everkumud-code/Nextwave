/**
 * Finds the latitude and longitude in a Google Maps (or similar) address that the person pasted:
 * .../@23.3441,85.3096,17z   ...!3d23.3441!4d85.3096   ...?q=23.3441,85.3096   ...?ll=...   or plain "23.3441, 85.3096".
 * Short links (maps.app.goo.gl/...) hide the position, so they cannot be read here.
 */
export function parseMapsLink(text: string): { lat: number; lng: number } | null {
  const value = text.trim();
  if (!value) return null;
  const patterns = [
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/,
    /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,
    /[?&](?:q|ll|query|center)=(-?\d{1,2}(?:\.\d+)?)(?:,|%2C)(-?\d{1,3}(?:\.\d+)?)/i,
    /^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  return null;
}

export function isShortMapsLink(text: string): boolean {
  return /(?:maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(text);
}
