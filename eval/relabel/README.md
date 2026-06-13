# Independent label cross-check

The benchmark in `../dataset.json` was authored by one assistant, which biases it: on
ambiguous items a model can score for *agreeing with the labeler* rather than against ground
truth. To measure that bias, the 109 texts were re-labeled **blind** by two independent
labelers (separate Sonnet subagents that saw only `texts.json` + the rubric — never the
author's labels).

- `texts.json` — the 109 messages, no labels (what the blind labelers saw).
- `agent-a.json`, `agent-b.json` — each labeler's independent output.
- `agree.ts` — computes inter-annotator agreement: `npx tsx eval/relabel/agree.ts`.

**Result (before reconciliation):** intent agreement 99.1%, full-record all-three agreement
93.6%. The disagreements surfaced 5 inconsistent author *day* labels (`this evening/afternoon`,
`now`), which were reconciled to the independent majority; after that, all-three agreement is
97.2%, with one genuinely ambiguous item remaining.

Caveat: all three labelers are AI, not humans — this reduces single-author bias, it does not
establish human ground truth.
