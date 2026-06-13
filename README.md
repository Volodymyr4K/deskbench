# deskbench

[![CI](https://github.com/Volodymyr4K/deskbench/actions/workflows/ci.yml/badge.svg)](https://github.com/Volodymyr4K/deskbench/actions/workflows/ci.yml)

A front-desk assistant for small service businesses — built around one idea:
**before you ship "AI", measure whether you actually need it.**

deskbench handles the routine front-desk work of a salon, clinic, repair shop, or
barbershop — booking appointments, rescheduling, reminders, and answering common
client questions. But the product is not the bot. The product is the **discipline of
measuring where a large language model genuinely beats plain machine learning and
simple rule-based logic, and where it does not.**

> Most "AI receptionist" tools assume the LLM is the answer. deskbench treats that as a
> hypothesis to test, on real data, against cheaper baselines — and ships the LLM only
> where the numbers justify the cost.

## Why this exists

The market is full of front-desk tools that staple an LLM onto a calendar and call it
intelligent. A lot of that work is solved just as well — and far more cheaply and
predictably — by classical ML or a few well-chosen rules. "AI" has become a marketing
reflex applied even where plain ML is plenty.

deskbench takes the opposite stance. Every automated capability starts with a simple
baseline (rules and/or classical ML). An LLM is introduced only when it is **measured**
to outperform that baseline on the same data — and where it loses or merely ties, the
simpler approach stays, and we say so out loud.

## What it does (target scope)

- **Booking** — clients request appointments; the system proposes open slots.
- **Reschedule / cancel** — handled conversationally, with the calendar as source of truth.
- **Reminders** — reduce no-shows via timely notifications.
- **Routine Q&A** — answer common client questions (hours, prices, location) without staff.
- **Operator view** — a simple, readable calendar for non-technical staff, not a CRM monster.

## The measurement layer (the differentiator)

Each capability is benchmarked against simpler baselines on real dialogue data, scored on:

- **Accuracy** — did it understand and act on the request correctly?
- **Hallucinated-slot rate** — did it offer or book a time that wasn't actually free?
- **Cost per conversation** — real API cost of the LLM path vs. the cheaper baseline.

Comparisons are reproducible: fixed dataset, fixed prompts, a script anyone can re-run.
Honest conclusions over flattering ones — including where the LLM is not worth it.

### Measured results (not claimed)

On a curated 35-example benchmark of front-desk requests (`eval/dataset.json` —
hand-written, not real customer logs), scored on four fields plus a strict
"all four correct" rate:

| parser                     | intent | service |  day  |  time | full match |
|----------------------------|-------:|--------:|------:|------:|-----------:|
| rule baseline (`$0`, ~0ms) |  91.4% |   100%  |  100% | 91.4% |   **82.9%** |
| Gemma-4-31b (free, LLM)    |   100% |   100%  |  100% |  100% |    **100%** |

Reproduce: `npm run eval` (baseline only, offline, `$0`) or
`npm run eval -- --model google/gemma-4-31b-it:free` (needs `OPENAI_API_KEY`).
Baseline result is committed in `eval/results/baseline.json`, the comparison in
`eval/results/latest.json`.

**What this says — and what it doesn't (read this):**

- On this set the LLM clears the bar: it gets all 6 cases the baseline misses
  (ambiguous "do you have anything…", an unguessable am/pm, two times in one sentence).
  The baseline was **not** tuned to flatter its numbers.
- **35 examples is tiny.** 100% here is not 100% in general — the confidence interval is wide.
- The benchmark was **authored by the same person who reads the LLM's answers**, so on
  genuinely ambiguous items the LLM partly scores for agreeing with the author's labels,
  not against an external ground truth. This inflates the LLM's apparent edge.
- **Cost is not just dollars.** The baseline answers in ~0ms, offline, with no dependency.
  The Gemma run took ~302s for 35 calls — most of that is a self-imposed 3s delay to stay
  under the free tier's rate limit, but real per-call latency is still several seconds. For
  a live front desk that latency and the external dependency are a real cost the accuracy
  win has to outweigh.
- A small-model comparison (llama-3.2-3b) was attempted to test the "model class vs.
  information" question, but free-tier rate limits (shared quota) drowned it in HTTP 429s,
  so those numbers are not trustworthy and are deliberately **not** reported here. Deferred.

## Tech stack

- **App:** Next.js (App Router), TypeScript
- **Data:** PostgreSQL
- **LLM:** OpenAI-compatible endpoint (OpenRouter by default; any compatible endpoint works)
- **Eval:** reproducible benchmark harness with baseline (rules / classical ML) vs. LLM

## Running locally

```bash
npm install
cp .env.example .env          # set DATABASE_URL (local Postgres)
npm run db:migrate            # create the schema
npm run db:seed               # demo barbershop, staff, services, appointments
npm run dev                   # operator board at http://localhost:3000
npm test                      # unit tests (availability, parser, resolver, dates)
npm run e2e                    # Playwright e2e (book / cancel / reschedule / intake) on an isolated test DB
```

On the board, the **quick intake** box turns a free-text request into a parsed intent and
an action — bookable slots for "combo friday at 2pm", matching appointments to drop for
"cancel my 3pm today", or a reschedule flow for "move my beard trim to friday" — all on the
rule-based parser, no LLM.

## Status

**Early development — honest snapshot:**

- **Done:** data model (Prisma/Postgres); rule-based slot-availability engine
  (`lib/availability.ts`); operator board (`app/page.tsx`) — per-staff appointments with
  book/cancel; rule-based request parser (`lib/parse/rules.ts`); LLM parser path
  (`lib/parse/llm.ts`) behind the same `ParsedRequest` contract; the **evaluation harness**
  (`eval/`) scoring baseline vs. LLM on a curated benchmark (numbers above); a
  full intake loop on the rule parser (`lib/parse/`) — book, cancel, and reschedule from
  free text; day navigation (any date) with a booking confirm step that captures client
  name/phone (or walk-in); an operator reschedule mode (move an appointment to a new
  slot/staff); a unit-test suite (`npm test`, 28 tests over availability, parser, resolver,
  date helpers); and Playwright e2e (`npm run e2e`) that drives book / cancel / reschedule /
  intake in a real browser against an isolated test database.
- **Next:** grow the benchmark and have someone other than the author label it; add more
  models (incl. a small one once rate limits allow) for the model-class comparison; wire the
  parser into an actual booking conversation and measure hallucinated-slot rate and real
  cost per conversation end-to-end.
- **Timezone:** all wall-clock reasoning (working hours, slots, display, day navigation)
  runs in each business's IANA timezone (`Business.timezone`, e.g. `Europe/Kyiv`); stored
  `startAt`/`endAt` are UTC instants. DST-correct via Luxon. So the board is correct no
  matter what timezone the server runs in.
- **Known simplifications:** single demo business; the benchmark is curated by hand, not
  drawn from real traffic; **no auth yet** — the server actions trust the IDs in the form
  and do no tenant/ownership checks, fine for a single-operator demo but a real deployment
  needs authentication and tenant scoping; the overlap check on booking is best-effort, not
  race-proof (no DB constraint/transaction).

This README tracks the real state, not an aspirational one.

## License

[MIT](LICENSE) © 2026 Volodymyr Kozachok
