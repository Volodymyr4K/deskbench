import { describe, it, expect } from "vitest";
import { computeStats } from "./stats";

const rows = (spec: [status: string, source: string, n: number][]) =>
  spec.flatMap(([status, source, n]) => Array.from({ length: n }, () => ({ status, source })));

describe("computeStats", () => {
  it("counts statuses and sources", () => {
    const s = computeStats(
      rows([
        ["BOOKED", "MANUAL", 5],
        ["COMPLETED", "MANUAL", 8],
        ["CANCELLED", "ASSISTANT", 2],
        ["NO_SHOW", "ASSISTANT", 2],
      ]),
      30,
    );
    expect(s.total).toBe(17);
    expect(s.counts).toEqual({ booked: 5, completed: 8, cancelled: 2, noShow: 2 });
    expect(s.bySource).toEqual({ manual: 13, assistant: 4 });
  });

  it("computes no-show rate over reached appointments only (excludes booked/cancelled)", () => {
    const s = computeStats(
      rows([
        ["BOOKED", "MANUAL", 10], // future — excluded from no-show rate
        ["COMPLETED", "MANUAL", 8],
        ["NO_SHOW", "MANUAL", 2],
        ["CANCELLED", "MANUAL", 5], // cancelled ahead — not a no-show
      ]),
      30,
    );
    expect(s.noShowRate).toBeCloseTo(2 / 10); // 2 of (8 completed + 2 no-show)
    expect(s.cancelRate).toBeCloseTo(5 / 25);
  });

  it("is zero-safe on an empty window", () => {
    const s = computeStats([], 30);
    expect(s.total).toBe(0);
    expect(s.noShowRate).toBe(0);
    expect(s.cancelRate).toBe(0);
  });
});
