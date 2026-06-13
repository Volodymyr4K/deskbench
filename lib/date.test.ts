import { describe, it, expect } from "vitest";
import { parseDateParam, toDateParam, addDays, isToday } from "./date";
import { todayInZone } from "./tz";

const TZ = "UTC";

describe("parseDateParam", () => {
  it("parses a valid YYYY-MM-DD", () => {
    expect(parseDateParam("2026-06-15", TZ)).toEqual({ year: 2026, month: 6, day: 15 });
  });

  it("falls back to today for missing or malformed input", () => {
    const today = toDateParam(todayInZone(TZ));
    expect(toDateParam(parseDateParam(undefined, TZ))).toBe(today);
    expect(toDateParam(parseDateParam("nonsense", TZ))).toBe(today);
    expect(toDateParam(parseDateParam("2026-13-01", TZ))).toBe(today); // bad month
    expect(toDateParam(parseDateParam("2026-02-31", TZ))).toBe(today); // overflow day
  });
});

describe("toDateParam / addDays", () => {
  it("round-trips through parseDateParam", () => {
    expect(toDateParam(parseDateParam("2026-12-31", TZ))).toBe("2026-12-31");
  });

  it("adds days across a month boundary", () => {
    expect(toDateParam(addDays({ year: 2026, month: 6, day: 30 }, 1))).toBe("2026-07-01");
    expect(toDateParam(addDays({ year: 2026, month: 6, day: 1 }, -1))).toBe("2026-05-31");
  });
});

describe("isToday", () => {
  it("is true for today in zone and false for another day", () => {
    expect(isToday(todayInZone(TZ), TZ)).toBe(true);
    expect(isToday(addDays(todayInZone(TZ), 1), TZ)).toBe(false);
  });
});
