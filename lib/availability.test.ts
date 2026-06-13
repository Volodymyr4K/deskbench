import { describe, it, expect } from "vitest";
import { freeSlots, startWithinHours } from "./availability";
import { zonedDayMinutesToInstant, instantParts, type CalendarDay } from "./tz";

// Tests run in a fixed zone (UTC) and assert on wall-clock minutes, so they are
// deterministic regardless of the machine/CI timezone.
const TZ = "UTC";
const DAY: CalendarDay = { year: 2026, month: 6, day: 15 };

const mins = (d: Date) => instantParts(d, TZ).minutes;
const at = (m: number) => zonedDayMinutesToInstant(DAY, m, TZ);

describe("freeSlots", () => {
  it("fills a working interval at the given step", () => {
    const slots = freeSlots({
      day: DAY,
      tz: TZ,
      workingMinutes: [{ start: 9 * 60, end: 12 * 60 }],
      busy: [],
      durationMin: 30,
      stepMin: 30,
    });
    expect(slots.map(mins)).toEqual([540, 570, 600, 630, 660, 690]); // 9:00..11:30
  });

  it("excludes slots that overlap a busy range", () => {
    const slots = freeSlots({
      day: DAY,
      tz: TZ,
      workingMinutes: [{ start: 9 * 60, end: 11 * 60 }],
      busy: [{ start: at(9 * 60 + 30), end: at(10 * 60) }],
      durationMin: 30,
      stepMin: 30,
    });
    // 9:30 overlaps the busy block and is dropped; 9:00 (ends 9:30) is fine.
    expect(slots.map(mins)).toEqual([540, 600, 630]); // 9:00, 10:00, 10:30
  });

  it("does not return a slot that would run past the working interval", () => {
    const slots = freeSlots({
      day: DAY,
      tz: TZ,
      workingMinutes: [{ start: 9 * 60, end: 10 * 60 }],
      busy: [],
      durationMin: 45,
      stepMin: 15,
    });
    // 9:00 (→9:45) and 9:15 (→10:00) fit; 9:30 (→10:15) would overflow.
    expect(slots.map(mins)).toEqual([540, 555]);
  });

  it("excludes slots before `now`", () => {
    const slots = freeSlots({
      day: DAY,
      tz: TZ,
      workingMinutes: [{ start: 9 * 60, end: 11 * 60 }],
      busy: [],
      durationMin: 30,
      stepMin: 30,
      now: at(10 * 60),
    });
    expect(slots.map(mins)).toEqual([600, 630]); // 10:00, 10:30
  });

  it("returns nothing for a non-positive duration", () => {
    expect(freeSlots({ day: DAY, tz: TZ, workingMinutes: [{ start: 540, end: 720 }], busy: [], durationMin: 0 })).toEqual([]);
  });
});

describe("startWithinHours", () => {
  const work = [{ start: 9 * 60, end: 18 * 60 }]; // 09:00–18:00

  it("accepts a slot fully inside working hours", () => {
    expect(startWithinHours(at(10 * 60), 30, TZ, work)).toBe(true);
  });

  it("rejects a slot that runs past closing", () => {
    expect(startWithinHours(at(17 * 60 + 50), 30, TZ, work)).toBe(false); // 17:50 + 30 = 18:20
  });

  it("rejects a slot before opening", () => {
    expect(startWithinHours(at(8 * 60 + 20), 30, TZ, work)).toBe(false);
  });

  it("rejects when there are no working hours that day", () => {
    expect(startWithinHours(at(10 * 60), 30, TZ, [])).toBe(false);
  });
});
