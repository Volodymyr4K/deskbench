import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tokenize, trainNB, predictNB } from "../lib/ml/naiveBayes";
import { ruleBasedParse } from "../lib/parse/rules";
import type { Intent, LabeledExample } from "../lib/parse/types";

// Classical-ML baseline evaluation for INTENT classification.
//
// Multinomial Naive Bayes vs the hand-written rule baseline, both scored on the
// SAME held-out folds (deterministic stratified k-fold cross-validation). NB is
// trained per fold on the train split; rules need no training but are scored on
// the identical test items, so the comparison is apples-to-apples on held-out
// data. Slot fields (service/day/time) stay with the rules — NB is a classifier,
// not a slot filler — so this measures intent only.

const __dirname = dirname(fileURLToPath(import.meta.url));
const K = 5;
const INTENTS: Intent[] = ["BOOK", "CANCEL", "RESCHEDULE", "QUESTION", "UNKNOWN"];

function loadExamples(): { text: string; intent: Intent }[] {
  const raw = JSON.parse(readFileSync(join(__dirname, "dataset.json"), "utf8")).examples as LabeledExample[];
  return raw.map((e) => ({ text: e.text, intent: e.expected.intent }));
}

/** Deterministic stratified folds: within each class, round-robin indices into K folds. */
function stratifiedFolds(labels: Intent[], k: number): number[] {
  const fold = new Array(labels.length).fill(0);
  const perClass: Record<string, number> = {};
  // Stable order: by class then original index (the array is already in dataset order).
  const byClass: Record<string, number[]> = {};
  labels.forEach((l, i) => (byClass[l] ??= []).push(i));
  for (const c of Object.keys(byClass)) {
    perClass[c] = 0;
    for (const i of byClass[c]) fold[i] = perClass[c]++ % k;
  }
  return fold;
}

type Conf = Record<Intent, Record<Intent, number>>;
const emptyConf = (): Conf =>
  Object.fromEntries(INTENTS.map((e) => [e, Object.fromEntries(INTENTS.map((p) => [p, 0]))])) as Conf;

function metrics(conf: Conf) {
  let correct = 0;
  let total = 0;
  const perIntent: Record<Intent, { precision: number; recall: number; f1: number; support: number }> =
    {} as never;
  for (const e of INTENTS) for (const p of INTENTS) total += conf[e][p];
  for (const i of INTENTS) {
    const tp = conf[i][i];
    correct += tp;
    const support = INTENTS.reduce((s, p) => s + conf[i][p], 0);
    const predicted = INTENTS.reduce((s, e) => s + conf[e][i], 0);
    const precision = predicted ? tp / predicted : 0;
    const recall = support ? tp / support : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    perIntent[i] = { precision, recall, f1, support };
  }
  return { accuracy: total ? correct / total : 0, perIntent };
}

function main() {
  const ex = loadExamples();
  const docs = ex.map((e) => ({ tokens: tokenize(e.text), label: e.intent }));
  const folds = stratifiedFolds(
    ex.map((e) => e.intent),
    K,
  );

  const nbConf = emptyConf();
  const ruleConf = emptyConf();

  for (let f = 0; f < K; f++) {
    const train = docs.filter((_, i) => folds[i] !== f);
    const model = trainNB(train);
    ex.forEach((e, i) => {
      if (folds[i] !== f) return; // test items only
      const nbPred = predictNB(model, docs[i].tokens) as Intent;
      const rulePred = ruleBasedParse(e.text).intent;
      nbConf[e.intent][nbPred]++;
      ruleConf[e.intent][rulePred]++;
    });
  }

  const nb = metrics(nbConf);
  const rule = metrics(ruleConf);
  const p = (x: number) => `${(x * 100).toFixed(1)}%`;

  console.log(`\nIntent classification — ${K}-fold CV on ${ex.length} examples (held-out)\n`);
  console.log("                  rule-baseline   naive-bayes");
  console.log(`  accuracy           ${p(rule.accuracy).padStart(7)}     ${p(nb.accuracy).padStart(7)}`);
  console.log("\n  per-intent F1     rule      nb     support");
  for (const i of INTENTS) {
    console.log(
      `    ${i.padEnd(12)} ${p(rule.perIntent[i].f1).padStart(6)}  ${p(nb.perIntent[i].f1).padStart(6)}  ${String(rule.perIntent[i].support).padStart(6)}`,
    );
  }

  console.log("\n  naive-bayes confusion (rows=expected, cols=predicted):");
  console.log("    " + "".padEnd(12) + INTENTS.map((p2) => p2.slice(0, 4).padStart(6)).join(""));
  for (const e of INTENTS) {
    console.log("    " + e.padEnd(12) + INTENTS.map((p2) => String(nbConf[e][p2]).padStart(6)).join(""));
  }

  const outDir = join(__dirname, "results");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, "ml-baseline.json"),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), k: K, n: ex.length, ruleBaseline: rule, naiveBayes: nb },
      null,
      2,
    ) + "\n",
  );
  console.log(`\nWrote eval/results/ml-baseline.json`);
}

main();
