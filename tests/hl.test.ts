import { describe, expect, it } from "vitest";
import { HyperliquidPrices, roundPrice, roundSize } from "../src/hl.js";

describe("rounding", () => {
  it("prices keep 5 significant figures and 6 - szDecimals decimals", () => {
    expect(roundPrice(82998.4, 5)).toBe("82998");
    expect(roundPrice(2506.74, 4)).toBe("2506.7");
    expect(roundPrice(0.123456789, 0)).toBe("0.12346");
    expect(roundPrice(100, 3)).toBe("100");
  });
  it("sizes round down", () => {
    expect(roundSize(0.123456789, 5)).toBe("0.12345");
    expect(roundSize(0.00000001, 5)).toBe("0");
    expect(roundSize(2, 4)).toBe("2");
  });
});

describe("live Hyperliquid market data (read-only, no key)", () => {
  it("reports the exchange leverage caps the risk engine clamps to", async () => {
    const m = await new HyperliquidPrices().markets(["BTC", "ETH"]);
    const by = Object.fromEntries(m.map((x) => [x.coin, x]));
    expect(by.BTC?.maxLeverage).toBeGreaterThanOrEqual(40);
    expect(by.ETH?.maxLeverage).toBeGreaterThanOrEqual(25);
    expect(by.BTC?.markPx).toBeGreaterThan(0);
  }, 20_000);
});
