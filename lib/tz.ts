import { DateTime } from "luxon";

// Timezone-aware primitives. The whole app reasons about wall-clock time in a
// business's IANA timezone (e.g. "Europe/Kyiv"), while instants stored in the DB
// (Appointment.startAt/endAt) stay UTC. These helpers are the only bridge
// between "wall clock in a zone" and "UTC instant", and they are DST-correct
// because Luxon resolves the offset per instant.

/** A calendar day, timezone-agnostic on its own (interpreted in some zone). */
export interface CalendarDay {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

/** UTC instant for `minutes` past midnight on `day`, as wall-clock time in `tz`. */
export function zonedDayMinutesToInstant(day: CalendarDay, minutes: number, tz: string): Date {
  return DateTime.fromObject(
    { year: day.year, month: day.month, day: day.day, hour: Math.floor(minutes / 60), minute: minutes % 60 },
    { zone: tz },
  ).toJSDate();
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  /** 0 = Sunday .. 6 = Saturday (matches JS getDay and Appointment hours). */
  weekday: number;
  /** Minutes past midnight in the zone. */
  minutes: number;
}

/** Break an instant down into wall-clock parts in `tz`. */
export function instantParts(instant: Date, tz: string): ZonedParts {
  const d = DateTime.fromJSDate(instant).setZone(tz);
  return { year: d.year, month: d.month, day: d.day, weekday: d.weekday % 7, minutes: d.hour * 60 + d.minute };
}

/** The calendar day it is *right now* in `tz`. */
export function todayInZone(tz: string): CalendarDay {
  const d = DateTime.now().setZone(tz);
  return { year: d.year, month: d.month, day: d.day };
}

/** Weekday (0 = Sunday .. 6 = Saturday) of a calendar day in `tz`. */
export function weekdayOf(day: CalendarDay, tz: string): number {
  return DateTime.fromObject({ year: day.year, month: day.month, day: day.day }, { zone: tz }).weekday % 7;
}

/** Format an instant's time as "HH:MM" wall-clock in `tz`. */
export function formatTimeInZone(instant: Date, tz: string, locale = "uk-UA"): string {
  return instant.toLocaleTimeString(locale, { timeZone: tz, hour: "2-digit", minute: "2-digit" });
}

/** Format a calendar day for display (weekday, day, month) in `tz`. */
export function formatDayInZone(day: CalendarDay, tz: string, locale = "uk-UA"): string {
  // Use noon to avoid any midnight/DST edge when formatting the date label.
  const instant = zonedDayMinutesToInstant(day, 12 * 60, tz);
  return instant.toLocaleDateString(locale, { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
}

/** Format an instant's date (weekday, day, month) as wall-clock in `tz`. */
export function formatDateInstantInZone(instant: Date, tz: string, locale = "uk-UA"): string {
  return instant.toLocaleDateString(locale, { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
}
