import { describe, it, expect } from "vitest";
import { ruleBasedParse } from "./rules";

describe("ruleBasedParse", () => {
  it("parses a clear booking with service, day and time", () => {
    expect(ruleBasedParse("Can I get a haircut tomorrow at 2pm?")).toEqual({
      intent: "BOOK",
      service: "haircut",
      day: "tomorrow",
      time: "14:00",
    });
  });

  it("detects combo when both services are mentioned", () => {
    expect(ruleBasedParse("any openings monday for haircut and beard?").service).toBe("combo");
  });

  it("classifies cancellations", () => {
    expect(ruleBasedParse("I need to cancel my appointment").intent).toBe("CANCEL");
  });

  it("classifies reschedules", () => {
    expect(ruleBasedParse("can I move my appointment to friday?")).toMatchObject({
      intent: "RESCHEDULE",
      day: "friday",
    });
  });

  it("classifies questions", () => {
    expect(ruleBasedParse("how much is a haircut?")).toMatchObject({
      intent: "QUESTION",
      service: "haircut",
    });
  });

  it("normalizes part-of-day and 24h times", () => {
    expect(ruleBasedParse("book me in for the combo on saturday morning").time).toBe("morning");
    expect(ruleBasedParse("Could I come by at noon today for a haircut?").time).toBe("12:00");
  });

  it("treats smalltalk as UNKNOWN", () => {
    expect(ruleBasedParse("hi there").intent).toBe("UNKNOWN");
  });

  it("documents a known limitation: am/pm-less 3:30 is read as 03:30", () => {
    // This is one of the baseline's honest misses — pinned so a future fix is intentional.
    expect(ruleBasedParse("Can I schedule a haircut for 3:30 on wednesday").time).toBe("03:30");
  });
});
