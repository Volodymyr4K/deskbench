import { describe, it, expect } from "vitest";
import { freeSlots } from "./availability";

// A fixed day so results are deterministic regardless of when tests run.
const DAY = new Date(2026, 5, 15); // 2026-06-15, local midnight

function at(h: number, m = 0): Date {
  return new Date(2026, 5, 15, h, m);
}

describe("freeSlots", () => {
  it("fills a working interval at the given step", () => {
    const slots = freeSlots({
      date: DAY,
      workingMinutes: [{ start: 9 * 60, end: 12 * 60 }],
      busy: [],
      durationMin: 30,
      stepMin: 30,
    });
    expect(slots.map((s) => `${s.getHours()}:${String(s.getMinutes()).padStart(2, "0")}`)).toEqual([
      "9:00",
      "9:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
    ]);
  });

  it("excludes slots that overlap a busy range", () => {
    const slots = freeSlots({
      date: DAY,
      workingMinutes: [{ start: 9 * 60, end: 11 * 60 }],
      busy: [{ start: at(9, 30), end: at(10, 0) }],
      durationMin: 30,
      stepMin: 30,
    });
    const labels = slots.map((s) => `${s.getHours()}:${String(s.getMinutes()).padStart(2, "0")}`);
    // 9:30 overlaps the busy block and is dropped; 9:00 (ends 9:30) is fine.
    expect(labels).toEqual(["9:00", "10:00", "10:30"]);
  });

  it("does not return a slot that would run past the working interval", () => {
    const slots = freeSlots({
      date: DAY,
      workingMinutes: [{ start: 9 * 60, end: 10 * 60 }],
      busy: [],
      durationMin: 45,
      stepMin: 15,
    });
    // 9:00 (→9:45) and 9:15 (→10:00) fit; 9:30 (→10:15) would overflow.
    expect(slots.map((s) => `${s.getHours()}:${String(s.getMinutes()).padStart(2, "0")}`)).toEqual([
      "9:00",
      "9:15",
    ]);
  });

  it("excludes slots before `now`", () => {
    const slots = freeSlots({
      date: DAY,
      workingMinutes: [{ start: 9 * 60, end: 11 * 60 }],
      busy: [],
      durationMin: 30,
      stepMin: 30,
      now: at(10, 0),
    });
    expect(slots.map((s) => s.getHours() * 60 + s.getMinutes()).every((m) => m >= 600)).toBe(true);
    expect(slots.length).toBe(2); // 10:00, 10:30
  });

  it("returns nothing for a non-positive duration", () => {
    expect(freeSlots({ date: DAY, workingMinutes: [{ start: 540, end: 720 }], busy: [], durationMin: 0 })).toEqual([]);
  });
});
