import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ruleBasedParse } from "../lib/parse/rules";
import { makeLlmParser } from "../lib/parse/llm";
import type { LabeledExample, ParsedRequest } from "../lib/parse/types";

// deskbench evaluation harness.
//
//   npm run eval                       -> rule baseline only ($0, offline)
//   npm run eval -- --model X          -> baseline + LLM X (needs OPENAI_API_KEY)
//   npm run eval -- --model X --model Y --limit 5
//
// Scores each parser on four fields plus a strict "all fields correct" rate, on
// the same curated benchmark. The LLM has to beat the baseline to justify cost.

const __dirname = dirname(fileURLToPath(import.meta.url));

type Parser = { name: string; parse: (text: string) => ParsedRequest | Promise<ParsedRequest> };

const FIELDS = ["intent", "service", "day", "time"] as const;
type Field = (typeof FIELDS)[number];

function parseArgs(argv: string[]) {
  const models: string[] = [];
  let limit = Infinity;
  let delayMs = 300;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--model") models.push(argv[++i]);
    else if (argv[i] === "--limit") limit = parseInt(argv[++i], 10);
    else if (argv[i] === "--delay") delayMs = parseInt(argv[++i], 10);
  }
  return { models, limit, delayMs };
}

function loadDataset(limit: number): LabeledExample[] {
  const raw = readFileSync(join(__dirname, "dataset.json"), "utf8");
  const all = JSON.parse(raw).examples as LabeledExample[];
  return Number.isFinite(limit) ? all.slice(0, limit) : all;
}

const fieldEq = (a: unknown, b: unknown): boolean => (a ?? null) === (b ?? null);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function scoreParser(parser: Parser, data: LabeledExample[], delayMs: number) {
  const correct: Record<Field, number> = { intent: 0, service: 0, day: 0, time: 0 };
  let fullyCorrect = 0;
  const misses: { text: string; field: Field; expected: unknown; got: unknown }[] = [];
  const isLlm = parser.name.startsWith("llm:");

  const t0 = Date.now();
  for (const ex of data) {
    const got = await parser.parse(ex.text);
    let allOk = true;
    for (const f of FIELDS) {
      if (fieldEq(got[f], ex.expected[f])) correct[f]++;
      else {
        allOk = false;
        misses.push({ text: ex.text, field: f, expected: ex.expected[f], got: got[f] });
      }
    }
    if (allOk) fullyCorrect++;
    if (isLlm && delayMs) await sleep(delayMs);
  }

  const n = data.length;
  return {
    name: parser.name,
    n,
    intent: correct.intent / n,
    service: correct.service / n,
    day: correct.day / n,
    time: correct.time / n,
    fullMatch: fullyCorrect / n,
    seconds: (Date.now() - t0) / 1000,
    misses,
  };
}

async function main() {
  const { models, limit, delayMs } = parseArgs(process.argv.slice(2));
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

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const summaries = [];
  for (const parser of parsers) {
    const r = await scoreParser(parser, data, delayMs);
    summaries.push({
      parser: r.name,
      n: r.n,
      intent: r.intent,
      service: r.service,
      day: r.day,
      time: r.time,
      fullMatch: r.fullMatch,
      seconds: Number(r.seconds.toFixed(1)),
    });
    console.log(
      `### ${r.name}  (${r.seconds.toFixed(1)}s)\n` +
        `  intent ${pct(r.intent)} · service ${pct(r.service)} · day ${pct(r.day)} · time ${pct(r.time)}\n` +
        `  full match ${pct(r.fullMatch)}  (all four fields), misses ${r.misses.length}`,
    );
    for (const m of r.misses) {
      console.log(`    [${m.field}] "${m.text}"  exp=${JSON.stringify(m.expected)} got=${JSON.stringify(m.got)}`);
    }
    console.log("");
  }

  // Comparison table
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
  // Keep baseline.json as the canonical $0 reference; write comparisons separately.
  const file = models.length ? "latest.json" : "baseline.json";
  writeFileSync(join(outDir, file), JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWrote eval/results/${file}`);
}

main();
