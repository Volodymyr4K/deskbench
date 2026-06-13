import { describe, it, expect } from "vitest";
import { resolveDay, slotMatchesTime, filterSlotsByTime, appointmentMatchesRequest } from "./resolve";
import { zonedDayMinutesToInstant, todayInZone, weekdayOf, type CalendarDay } from "@/lib/tz";
import { toDateParam, addDays } from "@/lib/date";

const TZ = "UTC";
const DAY: CalendarDay = { year: 2026, month: 6, day: 15 };
const at = (m: number) => zonedDayMinutesToInstant(DAY, m, TZ);

describe("resolveDay", () => {
  it("resolves today and tomorrow relative to the zone", () => {
    const today = todayInZone(TZ);
    expect(toDateParam(resolveDay("today", TZ)!)).toBe(toDateParam(today));
    expect(toDateParam(resolveDay("tomorrow", TZ)!)).toBe(toDateParam(addDays(today, 1)));
  });

  it("resolves a weekday to its next occurrence (today included, within a week)", () => {
    const res = resolveDay("friday", TZ)!;
    expect(weekdayOf(res, TZ)).toBe(5); // Friday
    const today = toDateParam(todayInZone(TZ));
    const resStr = toDateParam(res);
    expect(resStr >= today).toBe(true);
    expect(toDateParam(addDays(res, -7)) < today).toBe(true);
  });

  it("returns null for no day", () => {
    expect(resolveDay(null, TZ)).toBeNull();
  });
});

describe("slotMatchesTime", () => {
  it("matches an exact HH:MM", () => {
    expect(slotMatchesTime(at(14 * 60), "14:00", TZ)).toBe(true);
    expect(slotMatchesTime(at(14 * 60 + 30), "14:00", TZ)).toBe(false);
  });

  it("matches parts of day", () => {
    expect(slotMatchesTime(at(9 * 60), "morning", TZ)).toBe(true);
    expect(slotMatchesTime(at(13 * 60), "morning", TZ)).toBe(false);
    expect(slotMatchesTime(at(13 * 60), "afternoon", TZ)).toBe(true);
    expect(slotMatchesTime(at(18 * 60), "evening", TZ)).toBe(true);
  });

  it("treats a null time as a match for anything", () => {
    expect(slotMatchesTime(at(8 * 60), null, TZ)).toBe(true);
  });
});

describe("filterSlotsByTime", () => {
  it("keeps only matching slots", () => {
    const slots = [at(9 * 60), at(13 * 60), at(18 * 60)];
    expect(filterSlotsByTime(slots, "afternoon", TZ)).toHaveLength(1);
    expect(filterSlotsByTime(slots, null, TZ)).toHaveLength(3);
  });
});

describe("appointmentMatchesRequest", () => {
  const appt = { startAt: at(15 * 60), serviceId: "svc-haircut" };

  it("matches on time token alone when no service is named", () => {
    expect(appointmentMatchesRequest(appt, { time: "15:00" }, TZ)).toBe(true);
    expect(appointmentMatchesRequest(appt, { time: "afternoon" }, TZ)).toBe(true);
    expect(appointmentMatchesRequest(appt, { time: "morning" }, TZ)).toBe(false);
  });

  it("requires the service to match when one is named", () => {
    expect(appointmentMatchesRequest(appt, { time: null, serviceId: "svc-haircut" }, TZ)).toBe(true);
    expect(appointmentMatchesRequest(appt, { time: null, serviceId: "svc-beard" }, TZ)).toBe(false);
  });

  it("matches everything on that day when neither is specified", () => {
    expect(appointmentMatchesRequest(appt, { time: null }, TZ)).toBe(true);
  });
});
