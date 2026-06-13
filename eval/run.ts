import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ruleBasedParse } from "../lib/parse/rules";
import { makeLlmParser } from "../lib/parse/llm";
import { wilson } from "../lib/wilson";
import type { Intent, LabeledExample, ParsedRequest } from "../lib/parse/types";

// deskbench evaluation harness.
//
//   npm run eval                       -> rule baseline only ($0, offline)
//   npm run eval -- --model X          -> baseline + LLM X (needs OPENAI_API_KEY)
//   npm run eval -- --model X --limit 5 --delay 3000
//
// Reports, per parser, on the same curated benchmark:
//   - field accuracy (intent/service/day/time) + strict all-four "full match"
//   - per-intent precision / recall / F1 and an intent confusion matrix
// The LLM has to beat the baseline on these to justify its cost.

const __dirname = dirname(fileURLToPath(import.meta.url));

type Parser = { name: string; parse: (text: string) => ParsedRequest | Promise<ParsedRequest> };

const FIELDS = ["intent", "service", "day", "time"] as const;
type Field = (typeof FIELDS)[number];
const INTENTS: Intent[] = ["BOOK", "CANCEL", "RESCHEDULE", "QUESTION", "UNKNOWN"];

function parseArgs(argv: string[]) {
  const models: string[] = [];
  let limit = Infinity;
  let concurrency = 1;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--model") models.push(argv[++i]);
    else if (argv[i] === "--limit") limit = parseInt(argv[++i], 10);
    else if (argv[i] === "--concurrency") concurrency = parseInt(argv[++i], 10);
  }
  return { models, limit, concurrency };
}

/** Run `fn` over items with up to `n` in flight, preserving result order. */
async function mapPool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  return results;
}

function loadDataset(limit: number): LabeledExample[] {
  const raw = readFileSync(join(__dirname, "dataset.json"), "utf8");
  const all = JSON.parse(raw).examples as LabeledExample[];
  return Number.isFinite(limit) ? all.slice(0, limit) : all;
}

const fieldEq = (a: unknown, b: unknown): boolean => (a ?? null) === (b ?? null);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

type IntentMetric = { precision: number; recall: number; f1: number; support: number };

async function scoreParser(parser: Parser, data: LabeledExample[], concurrency: number) {
  const correct: Record<Field, number> = { intent: 0, service: 0, day: 0, time: 0 };
  let fullyCorrect = 0;
  const misses: { text: string; field: Field; expected: unknown; got: unknown }[] = [];
  // confusion[expected][predicted]
  const confusion: Record<Intent, Record<Intent, number>> = Object.fromEntries(
    INTENTS.map((e) => [e, Object.fromEntries(INTENTS.map((p) => [p, 0])) as Record<Intent, number>]),
  ) as Record<Intent, Record<Intent, number>>;

  const t0 = Date.now();
  const preds = await mapPool(data, concurrency, (ex) => Promise.resolve(parser.parse(ex.text)));
  data.forEach((ex, i) => {
    const got = preds[i];
    confusion[ex.expected.intent][got.intent]++;
    let allOk = true;
    for (const f of FIELDS) {
      if (fieldEq(got[f], ex.expected[f])) correct[f]++;
      else {
        allOk = false;
        misses.push({ text: ex.text, field: f, expected: ex.expected[f], got: got[f] });
      }
    }
    if (allOk) fullyCorrect++;
  });

  const n = data.length;
  const perIntent: Record<Intent, IntentMetric> = {} as Record<Intent, IntentMetric>;
  for (const i of INTENTS) {
    const tp = confusion[i][i];
    const support = INTENTS.reduce((s, p) => s + confusion[i][p], 0);
    const predicted = INTENTS.reduce((s, e) => s + confusion[e][i], 0);
    const precision = predicted ? tp / predicted : 0;
    const recall = support ? tp / support : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    perIntent[i] = { precision, recall, f1, support };
  }

  return {
    name: parser.name,
    n,
    intent: correct.intent / n,
    service: correct.service / n,
    day: correct.day / n,
    time: correct.time / n,
    fullMatch: fullyCorrect / n,
    correctCounts: { ...correct, full: fullyCorrect },
    seconds: (Date.now() - t0) / 1000,
    perIntent,
    confusion,
    misses,
  };
}

const ci = (k: number, n: number) => {
  const w = wilson(k, n);
  return `[${(w.lo * 100).toFixed(1)}–${(w.hi * 100).toFixed(1)}]`;
};

function printParser(r: Awaited<ReturnType<typeof scoreParser>>) {
  console.log(`### ${r.name}  (${r.seconds.toFixed(1)}s, n=${r.n})`);
  console.log("  field        acc      95% CI (Wilson)");
  const rows: [string, number, number][] = [
    ["intent", r.intent, r.correctCounts.intent],
    ["service", r.service, r.correctCounts.service],
    ["day", r.day, r.correctCounts.day],
    ["time", r.time, r.correctCounts.time],
    ["full match", r.fullMatch, r.correctCounts.full],
  ];
  for (const [label, acc, k] of rows) {
    console.log(`    ${label.padEnd(11)} ${pct(acc).padStart(6)}   ${ci(k, r.n)}`);
  }
  console.log("");

  console.log("  per-intent       prec   recall    f1   support");
  for (const i of INTENTS) {
    const m = r.perIntent[i];
    console.log(
      `    ${i.padEnd(12)} ${pct(m.precision).padStart(6)} ${pct(m.recall).padStart(7)} ${pct(m.f1).padStart(7)} ${String(m.support).padStart(6)}`,
    );
  }

  console.log("\n  intent confusion (rows = expected, cols = predicted):");
  console.log("    " + "".padEnd(12) + INTENTS.map((p) => p.slice(0, 4).padStart(6)).join(""));
  for (const e of INTENTS) {
    console.log("    " + e.padEnd(12) + INTENTS.map((p) => String(r.confusion[e][p]).padStart(6)).join(""));
  }
  console.log("");
}

async function main() {
  const { models, limit, concurrency } = parseArgs(process.argv.slice(2));
  const data = loadDataset(limit);

  const parsers: Parser[] = [{ name: "rule-baseline", parse: ruleBasedParse }];
  if (models.length) {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL ?? "https://openrouter.ai/api/v1";
    if (!apiKey) {
      console.error("OPENAI_API_KEY is not set (need it for --model). Aborting.");
      process.exit(1);
    }
    for (const model of models) parsers.push(makeLlmParser({ model, baseUrl, apiKey }));
  }

  console.log(`\ndeskbench eval — ${data.length} examples, ${parsers.length} parser(s)\n`);

  const summaries = [];
  for (const parser of parsers) {
    const r = await scoreParser(parser, data, concurrency);
    printParser(r);
    summaries.push({
      parser: r.name,
      n: r.n,
      intent: r.intent,
      service: r.service,
      day: r.day,
      time: r.time,
      fullMatch: r.fullMatch,
      ci95: {
        intent: wilson(r.correctCounts.intent, r.n),
        service: wilson(r.correctCounts.service, r.n),
        day: wilson(r.correctCounts.day, r.n),
        time: wilson(r.correctCounts.time, r.n),
        fullMatch: wilson(r.correctCounts.full, r.n),
      },
      seconds: Number(r.seconds.toFixed(1)),
      perIntent: r.perIntent,
      confusion: r.confusion,
    });
  }

  console.log("parser".padEnd(46) + "intent  service   day    time   FULL");
  for (const s of summaries) {
    console.log(
      s.parser.padEnd(46) +
        [s.intent, s.service, s.day, s.time, s.fullMatch].map((x) => pct(x).padStart(6)).join("  "),
    );
  }

  const outDir = join(__dirname, "results");
  mkdirSync(outDir, { recursive: true });
  const out = { generatedAt: new Date().toISOString(), datasetSize: data.length, results: summaries };
  const file = models.length ? "latest.json" : "baseline.json";
  writeFileSync(join(outDir, file), JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote eval/results/${file}`);
}

main();
