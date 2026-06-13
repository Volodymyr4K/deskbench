// Wilson score confidence interval for a binomial proportion. Used to put honest
// error bars on eval accuracies: with ~100 examples, a point estimate like 89.9%
// has a wide interval, and Wilson behaves well near 0/1 and for small n (unlike
// the naive normal approximation).

export interface Interval {
  lo: number;
  hi: number;
}

/** 95% Wilson interval (z=1.96 default) for k successes out of n. */
export function wilson(k: number, n: number, z = 1.96): Interval {
  if (n === 0) return { lo: 0, hi: 0 };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}
