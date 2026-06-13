// Multinomial Naive Bayes text classifier — a classical ML baseline, with no
// external ML dependency. Deterministic (no randomness), so results are
// reproducible. Used to answer, honestly, whether classical ML beats the
// hand-written rule baseline for front-desk intent — before reaching for an LLM.

/** Lowercase tokens: unigrams + adjacent bigrams (bigrams catch "do you", "i want"). */
export function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const out = [...words];
  for (let i = 0; i + 1 < words.length; i++) out.push(`${words[i]}_${words[i + 1]}`);
  return out;
}

export interface NBModel {
  classes: string[];
  logPrior: Record<string, number>;
  logLik: Record<string, Record<string, number>>; // class -> token -> log P(token|class)
  logLikUnseen: Record<string, number>; // class -> log P(unseen-but-in-vocab|class)
  vocab: Set<string>;
}

export interface Doc {
  tokens: string[];
  label: string;
}

/** Train Multinomial NB with Laplace (add-one) smoothing. */
export function trainNB(docs: Doc[]): NBModel {
  const vocab = new Set<string>();
  for (const d of docs) for (const t of d.tokens) vocab.add(t);
  const V = vocab.size;

  const classes = [...new Set(docs.map((d) => d.label))].sort();
  const logPrior: Record<string, number> = {};
  const logLik: Record<string, Record<string, number>> = {};
  const logLikUnseen: Record<string, number> = {};

  for (const c of classes) {
    const classDocs = docs.filter((d) => d.label === c);
    logPrior[c] = Math.log(classDocs.length / docs.length);

    const counts: Record<string, number> = {};
    let total = 0;
    for (const d of classDocs)
      for (const t of d.tokens) {
        counts[t] = (counts[t] ?? 0) + 1;
        total++;
      }

    const denom = total + V; // Laplace
    logLik[c] = {};
    for (const t of vocab) logLik[c][t] = Math.log(((counts[t] ?? 0) + 1) / denom);
    logLikUnseen[c] = Math.log(1 / denom);
  }

  return { classes, logPrior, logLik, logLikUnseen, vocab };
}

/** Predict the most likely class for a token list. Out-of-vocab tokens are ignored. */
export function predictNB(model: NBModel, tokens: string[]): string {
  let best = model.classes[0];
  let bestScore = -Infinity;
  for (const c of model.classes) {
    let score = model.logPrior[c];
    for (const t of tokens) {
      if (!model.vocab.has(t)) continue; // OOV: no evidence
      score += model.logLik[c][t] ?? model.logLikUnseen[c];
    }
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}
