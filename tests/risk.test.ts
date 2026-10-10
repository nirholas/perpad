import { describe, expect, it } from "vitest";
import { evaluate, type RiskContext, type RiskLimits } from "../src/risk.js";

const limits: RiskLimits = { markets: ["BTC", "ETH"], maxLeverage: 50, marginPerTradeUsd: 100, maxOpenPositions: 2, maxDailyLossUsd: 50 };
const ctx: RiskContext = { openCoins: [], withdrawableUsd: 500, dailyPnlUsd: 0, exchangeMaxLeverage: { BTC: 40, ETH: 25 } };

describe("evaluate", () => {
  it("clamps a cap above the exchange max to the exchange max", () => {
    const v = evaluate({ coin: "BTC", side: "long", leverage: 50, marginUsd: 50 }, ctx, limits);
    expect(v.allowed).toBe(true);
    expect(v.adjusted.leverage).toBe(40);
    const e = evaluate({ coin: "ETH", side: "long", leverage: 40, marginUsd: 50 }, ctx, limits);
    expect(e.adjusted.leverage).toBe(25);
  });
  it("clamps margin to the per-trade limit and to withdrawable", () => {
    expect(evaluate({ coin: "BTC", side: "long", leverage: 5, marginUsd: 400 }, ctx, limits).adjusted.marginUsd).toBe(100);
    expect(evaluate({ coin: "BTC", side: "long", leverage: 5, marginUsd: 90 }, { ...ctx, withdrawableUsd: 30 }, limits).adjusted.marginUsd).toBe(30);
  });
  it("refuses markets outside the allow-list", () => {
    expect(evaluate({ coin: "SOL", side: "long", leverage: 2, marginUsd: 50 }, { ...ctx, exchangeMaxLeverage: { SOL: 20 } }, limits).allowed).toBe(false);
  });
  it("refuses a duplicate position and a full book", () => {
    expect(evaluate({ coin: "BTC", side: "long", leverage: 2, marginUsd: 50 }, { ...ctx, openCoins: ["BTC"] }, limits).allowed).toBe(false);
    expect(evaluate({ coin: "ETH", side: "long", leverage: 2, marginUsd: 50 }, { ...ctx, openCoins: ["BTC", "SOL"] }, limits).allowed).toBe(false);
  });
  it("trips the daily loss kill switch", () => {
    expect(evaluate({ coin: "BTC", side: "short", leverage: 2, marginUsd: 50 }, { ...ctx, dailyPnlUsd: -50 }, limits).allowed).toBe(false);
    expect(evaluate({ coin: "BTC", side: "short", leverage: 2, marginUsd: 50 }, { ...ctx, dailyPnlUsd: -49.9 }, limits).allowed).toBe(true);
  });
  it("refuses notional under the exchange minimum", () => {
    expect(evaluate({ coin: "BTC", side: "long", leverage: 1, marginUsd: 5 }, ctx, limits).allowed).toBe(false);
  });
  it("never lets leverage fall below 1", () => {
    expect(evaluate({ coin: "BTC", side: "long", leverage: 0.2, marginUsd: 50 }, ctx, limits).allowed).toBe(false);
  });
});
