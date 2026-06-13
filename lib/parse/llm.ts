import type { DayToken, Intent, ParsedRequest, ServiceKey, TimeToken } from "./types";

// LLM parser path — same ParsedRequest contract as the rule baseline, so the
// eval harness scores them identically. The prompt is fixed ("pre-registered"):
// we do not tweak it per model to flatter results.

const INTENTS: Intent[] = ["BOOK", "CANCEL", "RESCHEDULE", "QUESTION", "UNKNOWN"];
const SERVICES: ServiceKey[] = ["haircut", "beard", "combo"];
const DAYS: DayToken[] = [
  "today",
  "tomorrow",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const PARTS = ["morning", "afternoon", "evening"];

const SYSTEM_PROMPT = `You parse a single customer message to a barbershop front desk into structured fields. The shop offers exactly three services: "haircut", "beard" (beard trim), "combo" (haircut + beard together).

Return ONLY a JSON object with these keys:
- "intent": one of ["BOOK","CANCEL","RESCHEDULE","QUESTION","UNKNOWN"]. BOOK = wants/asks to make an appointment or asks about availability for a time. CANCEL = wants to cancel. RESCHEDULE = wants to move an existing appointment. QUESTION = asks about hours, price, location, staff, or whether a service is offered. UNKNOWN = greeting/thanks/smalltalk with no request.
- "service": one of ["haircut","beard","combo"] or null if not specified.
- "day": one of ["today","tomorrow","monday","tuesday","wednesday","thursday","friday","saturday","sunday"] or null. "tonight" => "today".
- "time": a 24-hour time as "HH:MM" (e.g. "14:00", "09:30"), OR one of ["morning","afternoon","evening"], OR null. "tonight" => "evening". "noon" => "12:00". Convert am/pm to 24h. If a bare hour like "at 5" clearly means afternoon/evening, use 24h (e.g. "17:00").

Output JSON only, no prose, no code fences.`;

export interface LlmParserConfig {
  model: string;
  baseUrl: string;
  apiKey: string;
  /** Max retries on HTTP/parse failure. */
  retries?: number;
}

function clampDay(v: unknown): DayToken | null {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase().trim();
  return (DAYS as string[]).includes(s) ? (s as DayToken) : null;
}

function clampService(v: unknown): ServiceKey | null {
  if (typeof v !== "string") return null;
  const s = v.toLowerCase().trim();
  return (SERVICES as string[]).includes(s) ? (s as ServiceKey) : null;
}

function clampIntent(v: unknown): Intent {
  if (typeof v !== "string") return "UNKNOWN";
  const s = v.toUpperCase().trim();
  return (INTENTS as string[]).includes(s) ? (s as Intent) : "UNKNOWN";
}

function clampTime(v: unknown): TimeToken {
  if (v == null) return null;
  if (typeof v !== "string") return null;
  const s = v.toLowerCase().trim();
  if (PARTS.includes(s)) return s;
  const hm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    const h = parseInt(hm[1], 10);
    const m = parseInt(hm[2], 10);
    if (h <= 23 && m <= 59) return `${String(h).padStart(2, "0")}:${hm[2]}`;
  }
  return null;
}

/** Pull the first JSON object out of a model response (handles code fences/prose). */
function extractJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : content;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no JSON object in response");
  return JSON.parse(body.slice(start, end + 1));
}

function normalize(obj: unknown): ParsedRequest {
  const o = (obj ?? {}) as Record<string, unknown>;
  return {
    intent: clampIntent(o.intent),
    service: clampService(o.service),
    day: clampDay(o.day),
    time: clampTime(o.time),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function makeLlmParser(cfg: LlmParserConfig) {
  const retries = cfg.retries ?? 4;

  async function parse(text: string): Promise<ParsedRequest> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: cfg.model,
            temperature: 0,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: text },
            ],
          }),
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
        }
        const data = await res.json();
        const content: string = data?.choices?.[0]?.message?.content ?? "";
        return normalize(extractJson(content));
      } catch (e) {
        lastErr = e;
        // Back off hard on rate limits — free-tier rpm windows are ~60s.
        const is429 = String(e).includes("429");
        if (attempt < retries) await sleep((is429 ? 8000 : 1500) * (attempt + 1));
      }
    }
    // Honest failure: count it as UNKNOWN/null (a miss), do not hide it.
    console.warn(`  ! ${cfg.model} failed on "${text.slice(0, 40)}…": ${String(lastErr).slice(0, 120)}`);
    return { intent: "UNKNOWN", service: null, day: null, time: null };
  }

  return { name: `llm:${cfg.model}`, parse };
}
