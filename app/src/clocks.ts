// Family Time clocks (spec 6.5): computed in the browser with Intl, no network.

export const FAMILY_ZONES = [
  { label: 'India', timeZone: 'Asia/Kolkata' },
  { label: 'Pakistan', timeZone: 'Asia/Karachi' },
  { label: 'Bangladesh', timeZone: 'Asia/Dhaka' },
  { label: 'Nepal', timeZone: 'Asia/Kathmandu' },
  { label: 'Sri Lanka', timeZone: 'Asia/Colombo' },
] as const;

export interface Clock {
  label: string;
  time: string; // e.g. "10:55 PM"
  day: string; // e.g. "Fri"
}

function fmt(now: number, timeZone: string | undefined): { time: string; day: string } {
  const opts: Intl.DateTimeFormatOptions = timeZone ? { timeZone } : {};
  return {
    time: new Intl.DateTimeFormat('en-US', { ...opts, hour: 'numeric', minute: '2-digit' }).format(now),
    day: new Intl.DateTimeFormat('en-US', { ...opts, weekday: 'short' }).format(now),
  };
}

/** The visitor's own time first, then the five home-country zones. */
export function clocks(now: number): Clock[] {
  return [{ label: 'Your time', ...fmt(now, undefined) }, ...FAMILY_ZONES.map((z) => ({ label: z.label, ...fmt(now, z.timeZone) }))];
}
