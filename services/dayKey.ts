/**
 * Day keys: the string that names a calendar day in todayLog/dailyLogs,
 * lastActiveDate, the dashboard's selected day and Health summaries.
 *
 * Format: "M/D/YYYY" in the DEVICE's local calendar, e.g. "10/14/2026".
 * That is exactly what `toLocaleDateString()` produced on US devices, so
 * every key already stored stays valid. What changed (audit DATE-01/02):
 *
 *  - Keys no longer depend on the device locale. On en-GB/de-DE devices
 *    `toLocaleDateString()` gave "14/10/2026" / "14.10.2026", which
 *    `new Date()` can't parse back ("Invalid Date"), and en-CA's
 *    "2026-10-14" parsed as UTC (one day off west of Greenwich).
 *  - Keys are parsed explicitly into a LOCAL date (never `new Date(str)`).
 *  - Day arithmetic uses calendar fields (setDate), never "+ 86,400,000 ms",
 *    which breaks on daylight-saving days (stuck on Sun Nov 1, 2026).
 *
 * Use these helpers for every day key. Display formatting (weekday names
 * etc.) is separate and may use toLocaleDateString(locale, options).
 */

/** Key for a Date, in local time. */
export const dayKey = (d: Date = new Date()): string =>
  `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;

/** Local "YYYY-MM-DD" (the weigh-in date format). */
export const isoDate = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Today's key. */
export const todayKey = (): string => dayKey(new Date());

/**
 * Local midnight of a key. Accepts "M/D/YYYY" (current), "YYYY-MM-DD"
 * (weigh-ins, en-CA) and unambiguous legacy "D/M/YYYY" / "D.M.YYYY"
 * (day > 12). Returns an Invalid Date for anything else.
 */
export function parseDayKey(key: string | null | undefined): Date {
  const s = String(key ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return local(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    // US order unless the first number can't be a month (legacy en-GB/de-DE key).
    return a > 12 ? local(y, b, a) : local(y, a, b);
  }
  return new Date(NaN);
}

function local(y: number, month: number, day: number): Date {
  const d = new Date(y, month - 1, day);
  // Reject rollovers like 2/31 -> 3/3.
  return d.getFullYear() === y && d.getMonth() === month - 1 && d.getDate() === day ? d : new Date(NaN);
}

export const isValidDayKey = (key: string | null | undefined): boolean => !Number.isNaN(parseDayKey(key).getTime());

/** The same day in canonical form; unknown strings come back unchanged. */
export const normalizeDayKey = (key: string): string => {
  const d = parseDayKey(key);
  return Number.isNaN(d.getTime()) ? key : dayKey(d);
};

/** Key n calendar days after (or before, n < 0) the given key. DST-safe. */
export function shiftDayKey(key: string, n: number): string {
  const d = parseDayKey(key);
  if (Number.isNaN(d.getTime())) return key;
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** A local-midnight Date n calendar days from `from` (default today). DST-safe. */
export function addDays(from: Date, n: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + n);
  return d;
}

/** Whole calendar days from a to b (b − a), ignoring DST hour shifts. */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}

/** Sort comparator for day keys, oldest first. */
export const compareDayKeys = (a: string, b: string): number =>
  parseDayKey(a).getTime() - parseDayKey(b).getTime();
