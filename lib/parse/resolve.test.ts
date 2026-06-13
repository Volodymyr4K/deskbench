import { describe, it, expect } from "vitest";
import { resolveDay, slotMatchesTime, filterSlotsByTime, appointmentMatchesRequest } from "./resolve";

// Reference: 2026-06-15 is a Monday.
const MON = new Date(2026, 5, 15, 10, 0);

function iso(d: Date | null): string | null {
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null;
}

describe("resolveDay", () => {
  it("resolves today/tomorrow relative to the reference", () => {
    expect(iso(resolveDay("today", MON))).toBe("2026-06-15");
    expect(iso(resolveDay("tomorrow", MON))).toBe("2026-06-16");
  });

  it("resolves a weekday to its next occurrence (today included)", () => {
    expect(iso(resolveDay("monday", MON))).toBe("2026-06-15"); // same day
    expect(iso(resolveDay("friday", MON))).toBe("2026-06-19");
    expect(iso(resolveDay("sunday", MON))).toBe("2026-06-21");
  });

  it("returns null for no day", () => {
    expect(resolveDay(null, MON)).toBeNull();
  });
});

describe("slotMatchesTime", () => {
  const at = (h: number, m = 0) => new Date(2026, 5, 15, h, m);

  it("matches an exact HH:MM", () => {
    expect(slotMatchesTime(at(14, 0), "14:00")).toBe(true);
    expect(slotMatchesTime(at(14, 30), "14:00")).toBe(false);
  });

  it("matches parts of day", () => {
    expect(slotMatchesTime(at(9), "morning")).toBe(true);
    expect(slotMatchesTime(at(13), "morning")).toBe(false);
    expect(slotMatchesTime(at(13), "afternoon")).toBe(true);
    expect(slotMatchesTime(at(18), "evening")).toBe(true);
  });

  it("treats a null time as a match for anything", () => {
    expect(slotMatchesTime(at(8), null)).toBe(true);
  });
});

describe("filterSlotsByTime", () => {
  it("keeps only matching slots", () => {
    const slots = [new Date(2026, 5, 15, 9), new Date(2026, 5, 15, 13), new Date(2026, 5, 15, 18)];
    expect(filterSlotsByTime(slots, "afternoon")).toHaveLength(1);
    expect(filterSlotsByTime(slots, null)).toHaveLength(3);
  });
});

describe("appointmentMatchesRequest", () => {
  const appt = { startAt: new Date(2026, 5, 15, 15, 0), serviceId: "svc-haircut" };

  it("matches on time token alone when no service is named", () => {
    expect(appointmentMatchesRequest(appt, { time: "15:00" })).toBe(true);
    expect(appointmentMatchesRequest(appt, { time: "afternoon" })).toBe(true);
    expect(appointmentMatchesRequest(appt, { time: "morning" })).toBe(false);
  });

  it("requires the service to match when one is named", () => {
    expect(appointmentMatchesRequest(appt, { time: null, serviceId: "svc-haircut" })).toBe(true);
    expect(appointmentMatchesRequest(appt, { time: null, serviceId: "svc-beard" })).toBe(false);
  });

  it("matches everything on that day when neither is specified", () => {
    expect(appointmentMatchesRequest(appt, { time: null })).toBe(true);
  });
});
