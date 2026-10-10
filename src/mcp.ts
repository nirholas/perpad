import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { HyperliquidPrices } from "./hl.js";
import { Journal } from "./journal.js";
import { evaluate, RiskLimitsSchema } from "./risk.js";

/** Read-only MCP server: lets any MCP client inspect markets, audit a journal, and dry-run risk checks. Never signs or sends orders. */
export async function serveMcp(journalPath?: string): Promise<void> {
  const server = new McpServer({ name: "perpad", version: "0.1.0" });
  const prices = new HyperliquidPrices();

  server.registerTool(
    "get_markets",
    { description: "Live Hyperliquid mark price, max leverage and funding for the given coins.", inputSchema: { coins: z.array(z.string()).min(1) } },
    async ({ coins }) => ({ content: [{ type: "text", text: JSON.stringify(await prices.markets(coins)) }] }),
  );

  server.registerTool(
    "check_risk",
    {
      description: "Dry-run a trade proposal against risk limits using live exchange leverage caps. Sends nothing.",
      inputSchema: {
        limits: RiskLimitsSchema,
        proposal: z.object({ coin: z.string(), side: z.enum(["long", "short"]), leverage: z.number(), marginUsd: z.number() }),
        openCoins: z.array(z.string()).default([]),
        withdrawableUsd: z.number(),
        dailyPnlUsd: z.number().default(0),
      },
    },
    async ({ limits, proposal, openCoins, withdrawableUsd, dailyPnlUsd }) => {
      const m = await prices.markets([proposal.coin]);
      const verdict = evaluate(proposal, { openCoins, withdrawableUsd, dailyPnlUsd, exchangeMaxLeverage: Object.fromEntries(m.map((x) => [x.coin, x.maxLeverage])) }, limits);
      return { content: [{ type: "text", text: JSON.stringify(verdict) }] };
    },
  );

  if (journalPath) {
    server.registerTool(
      "read_journal",
      { description: "Latest entries of the agent's public decision journal, plus hash-chain integrity.", inputSchema: { last: z.number().int().min(1).max(200).default(20) } },
      async ({ last }) => {
        const entries = Journal.read(journalPath);
        return { content: [{ type: "text", text: JSON.stringify({ intact: Journal.verify(entries) === null, total: entries.length, entries: entries.slice(-last) }) }] };
      },
    );
  }

  await server.connect(new StdioServerTransport());
}
