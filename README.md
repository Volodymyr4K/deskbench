# deskbench

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

### Current baseline (measured, not claimed)

Run `npm run eval`. On a curated 35-example benchmark of front-desk requests
(`eval/dataset.json` — hand-written, not real customer logs), the rule-based parser
(`lib/parse/rules.ts`) scores:

| field      | accuracy |
|------------|---------:|
| intent     |   91.4%  |
| service    |  100.0%  |
| day        |  100.0%  |
| time       |   91.4%  |
| full match |   82.9%  |

The 6 misses are real and unhidden (ambiguous "do you have anything…", an unguessable
am/pm, two times in one sentence). The parser was **not** tuned to flatter these numbers —
this is the honest bar. An LLM assistant has to beat **82.9% full match** here to justify
its cost and latency. Full results: `eval/results/baseline.json`.

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
```

## Status

**Early development — honest snapshot:**

- **Done:** data model (Prisma/Postgres); rule-based slot-availability engine
  (`lib/availability.ts`); operator board (`app/page.tsx`) — per-staff appointments with
  book/cancel; rule-based request parser (`lib/parse/`) and the **evaluation harness**
  (`eval/`) scoring it on a curated benchmark (numbers above). Verified end-to-end.
- **Next:** add the LLM parser path behind the same `ParsedRequest` contract and run it
  through the harness — measuring accuracy, hallucinated-slot rate, and cost per
  conversation against this baseline. Then a larger benchmark.
- **Known simplifications:** times are computed in the server's local timezone (per-business
  timezone + DST is a real TODO); booking is walk-in (no client capture yet); single demo
  business; the benchmark is curated by hand, not drawn from real traffic.

This README tracks the real state, not an aspirational one.

## License

[MIT](LICENSE) © 2026 Volodymyr Kozachok
