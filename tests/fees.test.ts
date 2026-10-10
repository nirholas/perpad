import { describe, expect, it } from "vitest";
import { MICRO, planSweep, routeProfit, splitFees, toMicro } from "../src/fees.js";

describe("fees", () => {
  it("splits 30/70 with no dust lost", () => {
    for (const t of [0n, 1n, 7n, 999_999n, 123_456_789n]) {
      const s = splitFees(t);
      expect(s.platform + s.agent).toBe(t);
    }
    expect(splitFees(toMicro(100))).toEqual({ platform: toMicro(30), agent: toMicro(70) });
  });
  it("rejects invalid bps", () => {
    expect(() => splitFees(10n, 10_001n)).toThrow();
  });
  it("holds sub-$15 amounts for the next sweep", () => {
    expect(planSweep(toMicro(14.99))).toEqual({ sweep: false, amount: 0n, carry: toMicro(14.99) });
    expect(planSweep(15n * MICRO).sweep).toBe(true);
  });
  it("routes profit and keeps rounding dust in compound", () => {
    const r = routeProfit(1_000_001n, { buybackBps: 3333, compoundBps: 3334, payoutBps: 3333 });
    expect(r.buyback + r.compound + r.payout).toBe(1_000_001n);
    expect(routeProfit(-5n, { buybackBps: 0, compoundBps: 10_000, payoutBps: 0 })).toEqual({ buyback: 0n, compound: 0n, payout: 0n });
  });
});
