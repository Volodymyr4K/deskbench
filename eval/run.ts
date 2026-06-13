import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ruleBasedParse } from "../lib/parse/rules";
import type { LabeledExample, ParsedRequest } from "../lib/parse/types";

// deskbench evaluation harness.
//
// Scores a parser against the curated benchmark on four fields (intent,
// service, day, time) plus a strict "all fields correct" rate. Deterministic
// and $0 for the baseline. Add the LLM parser here later and compare on the
// same numbers — the LLM has to beat the baseline to justify its cost.

const __dirname = dirname(fileURLToPath(import.meta.url));

type Parser = { name: string; parse: (text: string) => ParsedRequest };

const PARSERS: Parser[] = [{ name: "rule-baseline", parse: ruleBasedParse }];

const FIELDS = ["intent", "service", "day", "time"] as const;
type Field = (typeof FIELDS)[number];

function loadDataset(): LabeledExample[] {
  const raw = readFileSync(join(__dirname, "dataset.json"), "utf8");
  return JSON.parse(raw).examples as LabeledExample[];
}

function fieldEq(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null);
}

function scoreParser(parser: Parser, data: LabeledExample[]) {
  const fieldCorrect: Record<Field, number> = { intent: 0, service: 0, day: 0, time: 0 };
  let fullyCorrect = 0;
  const misses: { text: string; field: Field; expected: unknown; got: unknown }[] = [];

  for (const ex of data) {
    const got = parser.parse(ex.text);
    let allOk = true;
    for (const f of FIELDS) {
      if (fieldEq(got[f], ex.expected[f])) {
        fieldCorrect[f]++;
      } else {
        allOk = false;
        misses.push({ text: ex.text, field: f, expected: ex.expected[f], got: got[f] });
      }
    }
    if (allOk) fullyCorrect++;
  }

  const n = data.length;
  const pct = (x: number) => `${((x / n) * 100).toFixed(1)}%`;

  return {
    name: parser.name,
    n,
    intent: fieldCorrect.intent / n,
    service: fieldCorrect.service / n,
    day: fieldCorrect.day / n,
    time: fieldCorrect.time / n,
    fullMatch: fullyCorrect / n,
    misses,
    pct,
  };
}

function main() {
  const data = loadDataset();
  console.log(`\ndeskbench eval — ${data.length} labeled examples\n`);

  const summaries = [];
  for (const parser of PARSERS) {
    const r = scoreParser(parser, data);
    summaries.push({
      parser: r.name,
      n: r.n,
      intent: r.intent,
      service: r.service,
      day: r.day,
      time: r.time,
      fullMatch: r.fullMatch,
    });

    console.log(`### ${r.name}`);
    console.log(`  intent      ${r.pct(r.intent * r.n)}`);
    console.log(`  service     ${r.pct(r.service * r.n)}`);
    console.log(`  day         ${r.pct(r.day * r.n)}`);
    console.log(`  time        ${r.pct(r.time * r.n)}`);
    console.log(`  full match  ${r.pct(r.fullMatch * r.n)}   (all four fields correct)`);
    console.log(`\n  misses (${r.misses.length}):`);
    for (const m of r.misses) {
      console.log(
        `    [${m.field}] "${m.text}"  expected=${JSON.stringify(m.expected)} got=${JSON.stringify(m.got)}`,
      );
    }
    console.log("");
  }

  const outDir = join(__dirname, "results");
  mkdirSync(outDir, { recursive: true });
  const out = { generatedAt: new Date().toISOString(), datasetSize: data.length, results: summaries };
  writeFileSync(join(outDir, "baseline.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote eval/results/baseline.json`);
}

main();
