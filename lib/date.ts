import { DateTime } from "luxon";
import { type CalendarDay, todayInZone } from "@/lib/tz";

// Calendar-day helpers for the board's day navigation. A day is a tz-agnostic
// {year,month,day}; the timezone only matters for "what day is it now" and for
// turning a day into instants (see lib/tz.ts).

/** Parse a `YYYY-MM-DD` param to a CalendarDay; fall back to today in `tz`. */
export function parseDateParam(s: string | undefined, tz: string): CalendarDay {
  if (s) {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const year = +m[1];
      const month = +m[2];
      const day = +m[3];
      // Reject impossible dates (e.g. 2026-02-31) by round-tripping through Luxon.
      const dt = DateTime.fromObject({ year, month, day });
      if (dt.isValid && dt.year === year && dt.month === month && dt.day === day) {
        return { year, month, day };
      }
    }
  }
  return todayInZone(tz);
}

/** Serialize a CalendarDay to a `YYYY-MM-DD` param. */
export function toDateParam(day: CalendarDay): string {
  return `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
}

/** Calendar arithmetic (timezone-independent). */
export function addDays(day: CalendarDay, n: number): CalendarDay {
  const dt = DateTime.fromObject({ year: day.year, month: day.month, day: day.day }).plus({ days: n });
  return { year: dt.year, month: dt.month, day: dt.day };
}

export function isToday(day: CalendarDay, tz: string): boolean {
  return toDateParam(day) === toDateParam(todayInZone(tz));
}
