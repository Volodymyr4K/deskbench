import type { DayToken, TimeToken } from "./types";
import { type CalendarDay, instantParts, todayInZone } from "@/lib/tz";
import { DateTime } from "luxon";

// Turns the coarse tokens a parser produces (day = "tomorrow"/"friday",
// time = "14:00"/"afternoon") into concrete scheduling constraints, so a parsed
// request can be matched against real free slots — all relative to a business's
// timezone.

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** Resolve a day token to a concrete CalendarDay, relative to today in `tz`. */
export function resolveDay(token: DayToken | null, tz: string): CalendarDay | null {
  if (!token) return null;
  const today = todayInZone(tz);
  const base = DateTime.fromObject({ year: today.year, month: today.month, day: today.day });

  if (token === "today") return today;
  if (token === "tomorrow") {
    const d = base.plus({ days: 1 });
    return { year: d.year, month: d.month, day: d.day };
  }
  const target = WEEKDAY_INDEX[token];
  if (target === undefined) return null;
  // Next occurrence of that weekday, today included. base.weekday: Mon=1..Sun=7.
  const todayDow = base.weekday % 7; // 0=Sun..6=Sat
  const ahead = (target - todayDow + 7) % 7;
  const d = base.plus({ days: ahead });
  return { year: d.year, month: d.month, day: d.day };
}

const PART_RANGES: Record<string, [number, number]> = {
  morning: [0, 12 * 60], // before noon
  afternoon: [12 * 60, 17 * 60], // noon–17:00
  evening: [17 * 60, 24 * 60], // 17:00 onward
};

/** Does a concrete slot instant satisfy the requested time token (wall-clock in `tz`)? */
export function slotMatchesTime(slot: Date, token: TimeToken, tz: string): boolean {
  if (!token) return true; // no time requested → any slot is fine
  const minutes = instantParts(slot, tz).minutes;

  const hm = token.match(/^(\d{2}):(\d{2})$/);
  if (hm) return minutes === parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);

  const range = PART_RANGES[token];
  if (range) return minutes >= range[0] && minutes < range[1];

  return true;
}

/** Filter concrete slots down to those matching the requested time token. */
export function filterSlotsByTime(slots: Date[], token: TimeToken, tz: string): Date[] {
  return slots.filter((s) => slotMatchesTime(s, token, tz));
}

/**
 * Whether an existing appointment matches a parsed cancel/reschedule request:
 * same service (if one was named) and a start time consistent with the request.
 */
export function appointmentMatchesRequest(
  appt: { startAt: Date; serviceId: string },
  opts: { time: TimeToken; serviceId?: string },
  tz: string,
): boolean {
  if (opts.serviceId && appt.serviceId !== opts.serviceId) return false;
  return slotMatchesTime(appt.startAt, opts.time, tz);
}
