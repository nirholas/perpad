import Anthropic from "@anthropic-ai/sdk";
import { Journal } from "./journal.js";
import { evaluate, type RiskLimits } from "./risk.js";
import type { Venue } from "./venue.js";

export interface AgentConfig {
  name: string;
  strategy: string;
  limits: RiskLimits;
  model?: string;
  /** Max tool-use rounds per tick. */
  maxRounds?: number;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_markets",
    description: "Live mark price, max leverage and hourly funding rate for each market you may trade.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_account",
    description: "Your equity, withdrawable margin, today's realized PnL and open positions (with liquidation prices).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "open_position",
    description: "Open an isolated-margin perp position. Leverage and margin are clamped to your hard limits; a request outside them is refused.",
    input_schema: {
      type: "object",
      properties: {
        coin: { type: "string" },
        side: { type: "string", enum: ["long", "short"] },
        leverage: { type: "integer", minimum: 1 },
        margin_usd: { type: "number", exclusiveMinimum: 0 },
        reasoning: { type: "string", description: "Why, in one or two sentences. Published in your public journal." },
      },
      required: ["coin", "side", "leverage", "margin_usd", "reasoning"],
    },
  },
  {
    name: "close_position",
    description: "Close an open position at market.",
    input_schema: {
      type: "object",
      properties: { coin: { type: "string" }, reasoning: { type: "string" } },
      required: ["coin", "reasoning"],
    },
  },
  {
    name: "hold",
    description: "Take no action this tick. Ends your turn.",
    input_schema: { type: "object", properties: { reasoning: { type: "string" } }, required: ["reasoning"] },
  },
];

export function systemPrompt(cfg: AgentConfig): string {
  const l = cfg.limits;
  return [
    `You are ${cfg.name}, an autonomous perpetual-futures trading agent on Hyperliquid. Every thought and action you take is published in a public journal.`,
    `Strategy from your launcher:\n${cfg.strategy}`,
    `Hard limits enforced in code, not by you: markets ${l.markets.join(", ")}; max leverage ${l.maxLeverage}x; max margin per trade ${l.marginPerTradeUsd} USD; max ${l.maxOpenPositions} open position(s)${l.maxDailyLossUsd ? `; no new positions after ${l.maxDailyLossUsd} USD realized loss in a day` : ""}.`,
    "Each tick: read markets and your account, then open, close or hold. Prefer holding to forcing a trade. Protect capital first. Finish every tick by calling hold, or after your last open/close.",
  ].join("\n\n");
}

export class Agent {
  private readonly client: Anthropic;

  constructor(
    private readonly cfg: AgentConfig,
    private readonly venue: Venue,
    private readonly journal: Journal,
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic();
  }

  private async runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
    const { limits } = this.cfg;
    switch (name) {
      case "get_markets":
        return this.venue.markets(limits.markets);
      case "get_account":
        return this.venue.account();
      case "open_position": {
        const coin = String(input.coin);
        const side = input.side === "short" ? "short" : "long";
        const [account, markets] = await Promise.all([this.venue.account(), this.venue.markets(limits.markets)]);
        const verdict = evaluate(
          { coin, side, leverage: Number(input.leverage), marginUsd: Number(input.margin_usd) },
          {
            openCoins: account.positions.map((p) => p.coin),
            withdrawableUsd: account.withdrawableUsd,
            dailyPnlUsd: account.dailyPnlUsd,
            exchangeMaxLeverage: Object.fromEntries(markets.map((m) => [m.coin, m.maxLeverage])),
          },
          limits,
        );
        this.journal.append("action", { tool: name, input, verdict });
        if (!verdict.allowed) {
          this.journal.append("risk_denied", { coin, reasons: verdict.reasons });
          return { ok: false, refused: verdict.reasons };
        }
        const res = await this.venue.open(coin, side, verdict.adjusted.leverage, verdict.adjusted.marginUsd);
        return { ok: true, note: verdict.reasons, fill: res };
      }
      case "close_position": {
        this.journal.append("action", { tool: name, input });
        return { ok: true, fill: await this.venue.close(String(input.coin)) };
      }
      case "hold":
        this.journal.append("action", { tool: name, input });
        return { ok: true };
      default:
        return { ok: false, error: `unknown tool ${name}` };
    }
  }

  /** One decision cycle. Returns after the model holds or runs out of rounds. */
  async tick(): Promise<void> {
    this.journal.append("tick", { mode: this.venue.mode });
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: `Tick at ${new Date().toISOString()}. Decide.` }];
    for (let round = 0; round < (this.cfg.maxRounds ?? 8); round++) {
      const res = await this.client.messages.create({
        model: this.cfg.model ?? "claude-sonnet-5-5",
        max_tokens: 1500,
        system: systemPrompt(this.cfg),
        tools: TOOLS,
        messages,
      });
      messages.push({ role: "assistant", content: res.content });
      for (const b of res.content) if (b.type === "text" && b.text.trim()) this.journal.append("thought", { text: b.text });
      const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (calls.length === 0) return;

      const results: Anthropic.ToolResultBlockParam[] = [];
      let held = false;
      for (const c of calls) {
        try {
          const out = await this.runTool(c.name, c.input as Record<string, unknown>);
          if (c.name !== "get_markets" && c.name !== "get_account") this.journal.append("result", { tool: c.name, out });
          results.push({ type: "tool_result", tool_use_id: c.id, content: JSON.stringify(out) });
          if (c.name === "hold") held = true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.journal.append("error", { tool: c.name, message: msg });
          results.push({ type: "tool_result", tool_use_id: c.id, content: msg, is_error: true });
        }
      }
      if (held) return;
      messages.push({ role: "user", content: results });
    }
  }
}
