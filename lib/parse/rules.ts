import type { DayToken, Intent, ParsedRequest, ServiceKey, TimeToken } from "./types";

// Rule-based front-desk request parser — the cheap, deterministic, $0 baseline.
// It is intentionally simple. Its job is to set the bar: an LLM is only worth
// its cost and latency if it measurably beats THIS.

const WEEKDAYS: DayToken[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function detectIntent(t: string): Intent {
  if (/\bcancel\b/.test(t)) return "CANCEL";
  if (/\b(reschedule|move|push|change)\b/.test(t)) return "RESCHEDULE";

  const bookingVerb =
    /\b(book|schedule|appointment|slot|opening|openings|come in|come by|i want|i'd like|i would like|i'll take|sign me up|get me)\b/.test(
      t,
    ) || /\bcan i (get|come|book|schedule)\b/.test(t);
  if (bookingVerb) return "BOOK";

  const questionCue =
    /\b(how much|what time|what are your hours|are you open|do you|where are you|located|is \w+ working|when (do|are))\b/.test(
      t,
    ) || /^(what|how|where|when|do|does|are|is)\b/.test(t.trim());
  if (questionCue) return "QUESTION";

  // No explicit verb: if a concrete time is present, treat as a booking ask.
  if (detectTime(t) && /\b\d/.test(t)) return "BOOK";

  return "UNKNOWN";
}

function detectService(t: string): ServiceKey | null {
  const hasBeard = /\bbeard\b/.test(t);
  const hasHair = /\bhaircut\b|\bhair cut\b|\bcut\b/.test(t);
  if ((hasBeard && hasHair) || /\bcombo\b|\bboth\b/.test(t)) return "combo";
  if (hasBeard) return "beard";
  if (hasHair) return "haircut";
  return null;
}

function detectDay(t: string): DayToken | null {
  if (/\btoday\b|\btonight\b/.test(t)) return "today";
  if (/\btomorrow\b/.test(t)) return "tomorrow";
  const short: Record<string, DayToken> = {
    mon: "monday",
    tue: "tuesday",
    wed: "wednesday",
    thu: "thursday",
    fri: "friday",
    sat: "saturday",
    sun: "sunday",
  };
  for (const d of WEEKDAYS) if (new RegExp(`\\b${d}\\b`).test(t)) return d;
  for (const [abbr, full] of Object.entries(short))
    if (new RegExp(`\\b${abbr}\\b`).test(t)) return full;
  return null;
}

function detectTime(t: string): TimeToken {
  if (/\bnoon\b/.test(t)) return "12:00";
  if (/\bmidnight\b/.test(t)) return "00:00";

  // 12-hour with am/pm, optional minutes: "2pm", "2:30 pm", "10am"
  const ampm = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
    if (ampm[3] === "pm" && h < 12) h += 12;
    if (ampm[3] === "am" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // 24-hour explicit: "14:00", "9:30"
  const h24 = t.match(/\b(\d{1,2}):(\d{2})\b/);
  if (h24) {
    const h = parseInt(h24[1], 10);
    const m = parseInt(h24[2], 10);
    if (h <= 23 && m <= 59) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // Parts of day. "tonight" implies evening.
  if (/\bmorning\b/.test(t)) return "morning";
  if (/\bafternoon\b/.test(t)) return "afternoon";
  if (/\bevening\b|\btonight\b/.test(t)) return "evening";

  // Bare hour near a time cue ("at 9", "friday 9", "maybe 5"). Ambiguous am/pm:
  // heuristic — 1–7 => afternoon (pm), 8–11 => morning (am). Honestly imperfect.
  const bare = t.match(/\b(?:at|around|by|maybe)\s+(\d{1,2})\b/) || t.match(/\b(\d{1,2})\s*o'?clock\b/);
  if (bare) {
    let h = parseInt(bare[1], 10);
    if (h >= 1 && h <= 7) h += 12;
    if (h <= 23) return `${String(h).padStart(2, "0")}:00`;
  }

  return null;
}

export function ruleBasedParse(raw: string): ParsedRequest {
  const t = raw.toLowerCase();
  return {
    intent: detectIntent(t),
    service: detectService(t),
    day: detectDay(t),
    time: detectTime(t),
  };
}
