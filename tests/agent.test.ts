import type Anthropic from "@anthropic-ai/sdk";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Agent } from "../src/agent.js";
import { Journal } from "../src/journal.js";
import { PaperVenue } from "../src/paper.js";

const prices = { markets: async () => [{ coin: "BTC", markPx: 100_000, maxLeverage: 40, funding: 0 }, { coin: "ETH", markPx: 2500, maxLeverage: 25, funding: 0 }] };
const limits = { markets: ["BTC"], maxLeverage: 50, marginPerTradeUsd: 100, maxOpenPositions: 1 };

/** Scripted model: plays back tool calls so the loop and risk gate run for real. */
function scripted(rounds: Anthropic.ToolUseBlock[][]): Anthropic {
  let i = 0;
  return { messages: { create: async () => ({ content: rounds[i++] ?? [] }) } } as unknown as Anthropic;
}
const call = (id: string, name: string, input: object): Anthropic.ToolUseBlock => ({ type: "tool_use", id, name, input });

describe("Agent", () => {
  it("clamps an over-limit open and refuses an out-of-list market, journaling both", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "perpad-")), "j.jsonl");
    const journal = new Journal(path);
    const venue = new PaperVenue(prices, 1000);
    const client = scripted([
      [call("1", "open_position", { coin: "BTC", side: "long", leverage: 100, margin_usd: 900, reasoning: "go big" })],
      [call("2", "open_position", { coin: "ETH", side: "long", leverage: 2, margin_usd: 50, reasoning: "diversify" })],
      [call("3", "hold", { reasoning: "done" })],
    ]);
    await new Agent({ name: "t", strategy: "test strategy text", limits }, venue, journal, client).tick();

    const pos = (await venue.account()).positions;
    expect(pos).toHaveLength(1);
    expect(pos[0]).toMatchObject({ coin: "BTC", leverage: 40, marginUsd: 100 });
    const entries = Journal.read(path);
    expect(entries.some((e) => e.kind === "risk_denied")).toBe(true);
    expect(Journal.verify(entries)).toBeNull();
  });
});
