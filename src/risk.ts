import { z } from "zod";

/** Hard limits a launcher sets once. The agent can never exceed them. */
export const RiskLimitsSchema = z.object({
  markets: z.array(z.string().min(1)).min(1),
  maxLeverage: z.number().int().min(1),
  marginPerTradeUsd: z.number().positive(),
  maxOpenPositions: z.number().int().min(1),
  /** Kill switch: no new positions once realized loss today reaches this. */
  maxDailyLossUsd: z.number().positive().optional(),
});
export type RiskLimits = z.infer<typeof RiskLimitsSchema>;

export interface Proposal {
  coin: string;
  side: "long" | "short";
  leverage: number;
  marginUsd: number;
}

export interface RiskContext {
  openCoins: string[];
  withdrawableUsd: number;
  /** Realized PnL since 00:00 UTC, fees included. Negative is a loss. */
  dailyPnlUsd: number;
  /** Exchange max leverage per coin, read live from Hyperliquid meta. */
  exchangeMaxLeverage: Record<string, number>;
}

export interface Verdict {
  allowed: boolean;
  adjusted: Pick<Proposal, "leverage" | "marginUsd">;
  reasons: string[];
}

/** Hyperliquid rejects orders below this notional value. */
export const MIN_NOTIONAL_USD = 10;

/** A cap above what the exchange allows is clamped to the exchange cap. */
export function effectiveMaxLeverage(limits: RiskLimits, coin: string, exchangeMax: Record<string, number>): number {
  const ex = exchangeMax[coin];
  return ex === undefined ? limits.maxLeverage : Math.min(limits.maxLeverage, ex);
}

export function evaluate(p: Proposal, ctx: RiskContext, limits: RiskLimits): Verdict {
  const reasons: string[] = [];
  const deny = (r: string) => reasons.push(r);

  if (!limits.markets.includes(p.coin)) deny(`${p.coin} is not an allowed market (${limits.markets.join(", ")})`);
  if (ctx.exchangeMaxLeverage[p.coin] === undefined) deny(`${p.coin} is not listed on the exchange`);
  if (ctx.openCoins.includes(p.coin)) deny(`a ${p.coin} position is already open`);
  if (ctx.openCoins.length >= limits.maxOpenPositions) deny(`max open positions (${limits.maxOpenPositions}) reached`);
  if (limits.maxDailyLossUsd !== undefined && ctx.dailyPnlUsd <= -limits.maxDailyLossUsd) {
    deny(`daily loss limit hit (${ctx.dailyPnlUsd.toFixed(2)} USD <= -${limits.maxDailyLossUsd})`);
  }
  if (p.leverage < 1) deny("leverage must be at least 1");
  if (p.marginUsd <= 0) deny("margin must be positive");

  const cap = effectiveMaxLeverage(limits, p.coin, ctx.exchangeMaxLeverage);
  const leverage = Math.max(1, Math.min(Math.floor(p.leverage), cap));
  const marginUsd = Math.min(p.marginUsd, limits.marginPerTradeUsd, ctx.withdrawableUsd);
  if (leverage < Math.floor(p.leverage)) reasons.push(`leverage clamped ${Math.floor(p.leverage)}x -> ${leverage}x`);
  if (marginUsd < p.marginUsd) reasons.push(`margin clamped ${p.marginUsd} -> ${marginUsd.toFixed(2)} USD`);
  if (marginUsd * leverage < MIN_NOTIONAL_USD) deny(`notional ${(marginUsd * leverage).toFixed(2)} USD is below the ${MIN_NOTIONAL_USD} USD exchange minimum`);

  const denied = reasons.filter((r) => !r.includes("clamped"));
  return { allowed: denied.length === 0, adjusted: { leverage, marginUsd }, reasons };
}
