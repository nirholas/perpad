import { z } from "zod";

/** Money is carried as integer micro-units (1 USD = 1_000_000) to avoid float drift. */
export const MICRO = 1_000_000n;

export const toMicro = (usd: number): bigint => BigInt(Math.round(usd * 1e6));
export const fromMicro = (m: bigint): number => Number(m) / 1e6;

export interface FeeSplit {
  platform: bigint;
  agent: bigint;
}

/** Split swept creator fees. Default 30% to the platform, 70% stays with the agent. */
export function splitFees(total: bigint, platformBps = 3000n): FeeSplit {
  if (total < 0n) throw new RangeError("total must be non-negative");
  if (platformBps < 0n || platformBps > 10_000n) throw new RangeError("platformBps must be 0..10000");
  const platform = (total * platformBps) / 10_000n;
  return { platform, agent: total - platform };
}

export interface SweepPlan {
  /** True when the pending amount is large enough to convert and bridge now. */
  sweep: boolean;
  amount: bigint;
  carry: bigint;
}

/** Amounts under the minimum wait for the next sweep to top them up. */
export function planSweep(pending: bigint, minimum: bigint = 15n * MICRO): SweepPlan {
  return pending >= minimum ? { sweep: true, amount: pending, carry: 0n } : { sweep: false, amount: 0n, carry: pending };
}

export const ProfitPolicySchema = z
  .object({
    buybackBps: z.number().int().min(0).max(10_000),
    compoundBps: z.number().int().min(0).max(10_000),
    payoutBps: z.number().int().min(0).max(10_000),
  })
  .refine((p) => p.buybackBps + p.compoundBps + p.payoutBps === 10_000, { message: "bps must sum to 10000" });
export type ProfitPolicy = z.infer<typeof ProfitPolicySchema>;

export interface ProfitRouting {
  buyback: bigint;
  compound: bigint;
  payout: bigint;
}

/** Route booked profit. Rounding dust always lands in `compound` so nothing is lost. */
export function routeProfit(profit: bigint, policy: ProfitPolicy): ProfitRouting {
  if (profit <= 0n) return { buyback: 0n, compound: 0n, payout: 0n };
  const buyback = (profit * BigInt(policy.buybackBps)) / 10_000n;
  const payout = (profit * BigInt(policy.payoutBps)) / 10_000n;
  return { buyback, payout, compound: profit - buyback - payout };
}
