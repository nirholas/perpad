import { describe, expect, it } from "vitest";
import { PaperVenue } from "../src/paper.js";
import type { MarketInfo } from "../src/venue.js";

function feed(px: { v: number }) {
  return { markets: async (): Promise<MarketInfo[]> => [{ coin: "BTC", markPx: px.v, maxLeverage: 40, funding: 0 }] };
}

describe("PaperVenue", () => {
  it("books profit and fees on a winning long", async () => {
    const px = { v: 100_000 };
    const v = new PaperVenue(feed(px), 1000);
    await v.open("BTC", "long", 10, 100);
    px.v = 101_000;
    expect((await v.account()).positions[0]?.unrealizedPnlUsd).toBeCloseTo(10, 6);
    await v.close("BTC");
    const a = await v.account();
    expect(a.positions).toHaveLength(0);
    expect(a.equityUsd).toBeGreaterThan(1000);
    expect(a.equityUsd).toBeLessThan(1010);
  });
  it("liquidates a leveraged short that moves against it and loses the margin", async () => {
    const px = { v: 100_000 };
    const v = new PaperVenue(feed(px), 1000);
    await v.open("BTC", "short", 20, 100);
    px.v = 110_000;
    const a = await v.account();
    expect(a.positions).toHaveLength(0);
    expect(a.equityUsd).toBeLessThan(905);
  });
  it("refuses to open with more margin than cash", async () => {
    await expect(new PaperVenue(feed({ v: 1 }), 50).open("BTC", "long", 2, 100)).rejects.toThrow(/insufficient/);
  });
});
