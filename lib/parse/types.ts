// What a front-desk message gets parsed into. This is the contract both the
// rule-based baseline and (later) the LLM path must produce, so the eval can
// score them on identical ground.

export type Intent = "BOOK" | "CANCEL" | "RESCHEDULE" | "QUESTION" | "UNKNOWN";

export type ServiceKey = "haircut" | "beard" | "combo";

export type DayToken =
  | "today"
  | "tomorrow"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/** Time is either a canonical "HH:MM" or a coarse part-of-day, or null. */
export type TimeToken = string | "morning" | "afternoon" | "evening" | null;

export interface ParsedRequest {
  intent: Intent;
  service: ServiceKey | null;
  day: DayToken | null;
  time: TimeToken;
}

export interface LabeledExample {
  text: string;
  expected: ParsedRequest;
}
