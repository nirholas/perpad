import type { AccountState, MarketInfo, OrderResult, Position, Venue } from "./venue.js";

export interface PriceSource {
  markets(coins: string[]): Promise<MarketInfo[]>;
}

/** Taker fee Hyperliquid charges at the base tier, as a fraction of notional. */
const TAKER_FEE = 0.00045;

/**
 * Simulated venue. Prices are real (read from a live PriceSource); fills, fees and
 * liquidations are modelled locally. No orders ever leave the machine.
 */
export class PaperVenue implements Venue {
  readonly mode = "paper" as const;
  private cash: number;
  private pnlToday = 0;
  private open_ = new Map<string, Position>();

  constructor(private readonly prices: PriceSource, startingUsd: number) {
    this.cash = startingUsd;
  }

  markets(coins: string[]) {
    return this.prices.markets(coins);
  }

  private async px(coin: string): Promise<MarketInfo> {
    const m = (await this.prices.markets([coin]))[0];
    if (!m) throw new Error(`unknown market ${coin}`);
    return m;
  }

  private markToMarket(p: Position, px: number): Position {
    const dir = p.side === "long" ? 1 : -1;
    return { ...p, unrealizedPnlUsd: dir * (px - p.entryPx) * p.size };
  }

  async account(): Promise<AccountState> {
    const positions: Position[] = [];
    for (const p of this.open_.values()) {
      const m = await this.px(p.coin);
      const marked = this.markToMarket(p, m.markPx);
      if (p.liquidationPx !== null && (p.side === "long" ? m.markPx <= p.liquidationPx : m.markPx >= p.liquidationPx)) {
        this.open_.delete(p.coin);
        this.pnlToday -= p.marginUsd;
        continue;
      }
      positions.push(marked);
    }
    const margin = positions.reduce((s, p) => s + p.marginUsd, 0);
    const upnl = positions.reduce((s, p) => s + p.unrealizedPnlUsd, 0);
    return { equityUsd: this.cash + margin + upnl, withdrawableUsd: Math.max(0, this.cash), positions, dailyPnlUsd: this.pnlToday };
  }

  async open(coin: string, side: "long" | "short", leverage: number, marginUsd: number): Promise<OrderResult> {
    if (this.open_.has(coin)) throw new Error(`${coin} position already open`);
    if (marginUsd > this.cash) throw new Error("insufficient paper balance");
    const m = await this.px(coin);
    const size = (marginUsd * leverage) / m.markPx;
    const fee = size * m.markPx * TAKER_FEE;
    const dir = side === "long" ? 1 : -1;
    const maintenance = 1 / (2 * m.maxLeverage);
    const liquidationPx = m.markPx * (1 - dir * Math.max(0, 1 / leverage - maintenance));
    this.cash -= marginUsd + fee;
    this.pnlToday -= fee;
    this.open_.set(coin, { coin, side, size, entryPx: m.markPx, leverage, marginUsd, unrealizedPnlUsd: 0, liquidationPx });
    return { coin, side, action: "open", size, avgPx: m.markPx };
  }

  async close(coin: string): Promise<OrderResult> {
    const p = this.open_.get(coin);
    if (!p) throw new Error(`no open ${coin} position`);
    const m = await this.px(coin);
    const dir = p.side === "long" ? 1 : -1;
    const realized = dir * (m.markPx - p.entryPx) * p.size;
    const fee = p.size * m.markPx * TAKER_FEE;
    this.cash += p.marginUsd + realized - fee;
    this.pnlToday += realized - fee;
    this.open_.delete(coin);
    return { coin, side: p.side, action: "close", size: p.size, avgPx: m.markPx };
  }
}
