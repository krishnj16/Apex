/** Date helpers. Calendar dates are stored as UTC-midnight Date values (Postgres DATE). */

export const toDateOnly = (iso: string): Date => new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/** Today's calendar date in the user's timezone. */
export function todayIn(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now);
}

export const addDays = (iso: string, n: number): string => {
  const d = toDateOnly(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
};

export const weekday = (iso: string): number => toDateOnly(iso).getUTCDay();

export const daysBetween = (fromIso: string, toIso: string): number =>
  Math.round((toDateOnly(toIso).getTime() - toDateOnly(fromIso).getTime()) / 86_400_000);

/** Monday of the week containing iso. */
export const weekStart = (iso: string): string => addDays(iso, -((weekday(iso) + 6) % 7));
