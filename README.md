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

`npm run eval` scores a parser on a curated 109-example benchmark
(`eval/dataset.json` — hand-written, not real customer logs) on four fields, a strict
"all four correct" rate, and per-intent precision/recall/F1 + an intent confusion matrix.

Current **rule baseline** (`$0`, ~0 ms, offline), committed in `eval/results/baseline.json`:

| field      | accuracy | 95% CI (Wilson) |
|------------|---------:|:----------------|
| intent     |   89.9%  | 82.8–94.3%      |
| service    |  100.0%  | 96.6–100.0%     |
| day        |   98.2%  | 93.6–99.5%      |
| time       |   91.7%  | 85.0–95.6%      |
| full match |   80.7%  | 72.3–87.0%      |

The intervals are wide because n is only 109 — that's the honest precision of these numbers,
not a rounding flex. Per-intent F1: BOOK 88.3 · CANCEL 93.3 · RESCHEDULE 97.1 · QUESTION 92.7 ·
UNKNOWN 80.0.
The confusion matrix shows exactly where it fails: **5 booking requests phrased without an
explicit verb or time** ("need a beard trim today", "haircut now") fall through to UNKNOWN,
which is why UNKNOWN's precision is only 66.7%. That's the point of measuring — it names the
gap instead of hiding it.

The baseline is **not** tuned to flatter these numbers. Since the benchmark was authored by
the same assistant, tuning the parser against its own visible misses would be overfitting
(there is no held-out split), so the honest baseline + "here's where it breaks" is kept as-is.

**Labels were cross-checked.** Two independent blind labelers (separate Sonnet subagents
given only the texts and the rubric, not the author's labels — see `eval/relabel/` and
`npx tsx eval/relabel/agree.ts`) reached 99.1% intent agreement and 93.6% full-record
agreement with the author. The disagreements caught 5 inconsistent author day-labels, which
were reconciled to the independent majority. This reduces single-author bias — though all
labelers are AI, not humans, so it is still not human ground truth.

**Classical ML baseline (rules vs ML).** `npm run eval:ml` trains a Multinomial Naive Bayes
intent classifier (TF unigrams + bigrams, no Python, deterministic) and scores it against the
rule baseline on the **same 5-fold held-out splits** (cross-validation — so this leg has a
proper train/test split). Result — intent accuracy:

| classifier            | intent accuracy (5-fold CV) | 95% CI (Wilson) |
|-----------------------|----------------------------:|:----------------|
| rule baseline         |                      89.9%  | 82.8–94.3%      |
| Naive Bayes (TF)      |                      79.8%  | 71.3–86.3%      |

The hand-written rules lead. NB over-predicts BOOK (it lacks the structural cues — like the
literal word "cancel" — that the rules encode). **Honest caveat: the two intervals overlap**,
so at n=109 this says "rules are at least as good as classical ML here," not a statistically
conclusive win — but it definitely gives no reason to prefer ML. So on this task classical ML
doesn't beat the `$0` rules, which is exactly the kind of result deskbench exists to surface:
the bar an LLM has to clear is the rules, not ML. Full numbers in `eval/results/ml-baseline.json`.

**LLM comparison (separate, older run):** on the earlier 35-example set, `Gemma-4-31b:free`
scored 100% full match vs. that set's 82.9% baseline — but that was a different, smaller
benchmark, so it is **not** comparable to the table above; a re-run on the 109-example set is
pending (gated on LLM quota). A small-model run (llama-3.2-3b) was drowned by free-tier
rate-limit 429s and is deliberately not reported. Reproduce the LLM path with
`npm run eval -- --model google/gemma-4-31b-it:free` (needs `OPENAI_API_KEY`).

**The honest caveats still stand:** the set is author-labeled (a model can score for agreeing
with the labeler on ambiguous items), and the LLM's cost is not just dollars — it answers in
seconds with an external dependency, where the baseline answers in ~0 ms offline.

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
  intake in a real browser against an isolated test database; appointment lifecycle
  (mark completed / no-show on past appointments) and a `/stats` view that measures the
  business — no-show rate, cancellation rate, status breakdown, and manual-vs-assistant
  source split (`lib/stats.ts`, unit-tested).
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
