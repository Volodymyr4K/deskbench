import type { DayToken, TimeToken } from "./types";

// Turns the coarse tokens a parser produces (day = "tomorrow"/"friday",
// time = "14:00"/"afternoon") into concrete scheduling constraints, so a parsed
// request can be matched against real free slots. Pure and dependency-free.

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Resolve a day token to a concrete date, relative to `ref` (default: now). */
export function resolveDay(token: DayToken | null, ref: Date = new Date()): Date | null {
  if (!token) return null;
  const base = startOfDay(ref);
  if (token === "today") return base;
  if (token === "tomorrow") {
    base.setDate(base.getDate() + 1);
    return base;
  }
  const target = WEEKDAY_INDEX[token];
  if (target === undefined) return null;
  // Next occurrence of that weekday, today included.
  const ahead = (target - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + ahead);
  return base;
}

const PART_RANGES: Record<string, [number, number]> = {
  morning: [0, 12 * 60], // before noon
  afternoon: [12 * 60, 17 * 60], // noon–17:00
  evening: [17 * 60, 24 * 60], // 17:00 onward
};

/** Does a concrete slot start time satisfy the requested time token? */
export function slotMatchesTime(slot: Date, token: TimeToken): boolean {
  if (!token) return true; // no time requested → any slot is fine
  const minutes = slot.getHours() * 60 + slot.getMinutes();

  const hm = token.match(/^(\d{2}):(\d{2})$/);
  if (hm) return minutes === parseInt(hm[1], 10) * 60 + parseInt(hm[2], 10);

  const range = PART_RANGES[token];
  if (range) return minutes >= range[0] && minutes < range[1];

  return true;
}

/** Filter concrete slots down to those matching the requested time token. */
export function filterSlotsByTime(slots: Date[], token: TimeToken): Date[] {
  return slots.filter((s) => slotMatchesTime(s, token));
}
