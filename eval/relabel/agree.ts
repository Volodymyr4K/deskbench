import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Inter-annotator agreement between the author labels (eval/dataset.json) and
// two independent (blind) labelers. Surfaces contested items so the author
// labels can be corrected where the independent labelers agree against them.

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
type Label = { i: number; intent: string; service: string | null; day: string | null; time: string | null };
const norm = (v: unknown) => v ?? null;

const me: Label[] = JSON.parse(readFileSync(join(root, "eval/dataset.json"), "utf8")).examples.map(
  (e: { text: string; expected: Omit<Label, "i"> }, i: number) => ({ i, ...e.expected }),
);
const texts: { i: number; text: string }[] = JSON.parse(readFileSync(join(root, "eval/relabel/texts.json"), "utf8"));
const A: Label[] = JSON.parse(readFileSync(join(root, "eval/relabel/agent-a.json"), "utf8"));
const B: Label[] = JSON.parse(readFileSync(join(root, "eval/relabel/agent-b.json"), "utf8"));

const byI = (arr: Label[]) => new Map(arr.map((x) => [x.i, x]));
const ma = byI(A);
const mb = byI(B);
const txt = new Map(texts.map((t) => [t.i, t.text]));

const fields = ["intent", "service", "day", "time"] as const;
const pair = { meA: 0, meB: 0, aB: 0 } as Record<string, number>;
const fieldAll: Record<string, number> = { intent: 0, service: 0, day: 0, time: 0 };
let full3 = 0;
const contested: { i: number; text: string; field: string; me: unknown; a: unknown; b: unknown }[] = [];
const intentContested: number[] = [];

for (const m of me) {
  const a = ma.get(m.i)!;
  const b = mb.get(m.i)!;
  let all3 = true;
  let intentOk = true;
  for (const f of fields) {
    const mv = norm(m[f]);
    const av = norm(a[f]);
    const bv = norm(b[f]);
    if (mv === av && av === bv) fieldAll[f]++;
    else {
      all3 = false;
      contested.push({ i: m.i, text: txt.get(m.i)!, field: f, me: mv, a: av, b: bv });
      if (f === "intent") intentOk = false;
    }
  }
  if (all3) full3++;
  if (!intentOk) intentContested.push(m.i);
}

// Pairwise full-record agreement.
for (const m of me) {
  const a = ma.get(m.i)!;
  const b = mb.get(m.i)!;
  const eq = (x: Label, y: Label) => fields.every((f) => norm(x[f]) === norm(y[f]));
  if (eq(m, a)) pair.meA++;
  if (eq(m, b)) pair.meB++;
  if (eq(a, b)) pair.aB++;
}

const n = me.length;
const p = (x: number) => `${((x / n) * 100).toFixed(1)}%`;

console.log(`\nInter-annotator agreement (n=${n}) — author vs 2 independent blind labelers\n`);
console.log("per-field 3-way agreement (all three identical):");
for (const f of fields) console.log(`  ${f.padEnd(8)} ${p(fieldAll[f])}`);
console.log(`\nfull-record pairwise agreement:`);
console.log(`  author vs A   ${p(pair.meA)}`);
console.log(`  author vs B   ${p(pair.meB)}`);
console.log(`  A vs B        ${p(pair.aB)}`);
console.log(`  all three     ${p(full3)}\n`);

console.log(`INTENT disagreements (${intentContested.length}) — author labels to review:`);
for (const c of contested.filter((c) => c.field === "intent")) {
  console.log(`  [${c.i}] "${c.text}"  me=${c.me} A=${c.a} B=${c.b}`);
}
console.log(`\nall contested fields (${contested.length}):`);
for (const c of contested) {
  console.log(`  [${c.i}] ${c.field}: me=${JSON.stringify(c.me)} A=${JSON.stringify(c.a)} B=${JSON.stringify(c.b)}  "${c.text}"`);
}
