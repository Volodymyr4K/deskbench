import { describe, it, expect } from "vitest";
import { parseDateParam, toDateParam, addDays, isToday, startOfDay } from "./date";

describe("parseDateParam", () => {
  it("parses a valid YYYY-MM-DD to local midnight", () => {
    const d = parseDateParam("2026-06-15");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 5, 15]);
    expect([d.getHours(), d.getMinutes()]).toEqual([0, 0]);
  });

  it("falls back to today for missing or malformed input", () => {
    const todayParam = toDateParam(new Date());
    expect(toDateParam(parseDateParam(undefined))).toBe(todayParam);
    expect(toDateParam(parseDateParam("nonsense"))).toBe(todayParam);
    expect(toDateParam(parseDateParam("2026-13-01"))).toBe(todayParam); // bad month
    expect(toDateParam(parseDateParam("2026-02-31"))).toBe(todayParam); // overflow day
  });
});

describe("toDateParam / addDays", () => {
  it("round-trips through parseDateParam", () => {
    expect(toDateParam(parseDateParam("2026-12-31"))).toBe("2026-12-31");
  });

  it("adds days across a month boundary", () => {
    expect(toDateParam(addDays(parseDateParam("2026-06-30"), 1))).toBe("2026-07-01");
    expect(toDateParam(addDays(parseDateParam("2026-06-01"), -1))).toBe("2026-05-31");
  });
});

describe("isToday", () => {
  it("is true for now and false for another day", () => {
    expect(isToday(startOfDay(new Date()))).toBe(true);
    expect(isToday(addDays(new Date(), 1))).toBe(false);
  });
});
