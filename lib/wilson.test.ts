import { describe, it, expect } from "vitest";
import { wilson } from "./wilson";

describe("wilson", () => {
  it("matches the known 95% interval for 50/100", () => {
    const { lo, hi } = wilson(50, 100);
    expect(lo).toBeCloseTo(0.404, 2);
    expect(hi).toBeCloseTo(0.596, 2);
  });

  it("stays within [0,1] at the extremes", () => {
    const all = wilson(10, 10);
    expect(all.hi).toBeLessThanOrEqual(1);
    expect(all.lo).toBeGreaterThan(0);
    const none = wilson(0, 10);
    expect(none.lo).toBe(0);
    expect(none.hi).toBeLessThan(1);
  });

  it("narrows as n grows", () => {
    const small = wilson(45, 50);
    const big = wilson(900, 1000);
    expect(hiMinusLo(big)).toBeLessThan(hiMinusLo(small));
  });

  it("is zero-safe for n=0", () => {
    expect(wilson(0, 0)).toEqual({ lo: 0, hi: 0 });
  });
});

const hiMinusLo = ({ lo, hi }: { lo: number; hi: number }) => hi - lo;
