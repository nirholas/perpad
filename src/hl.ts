import { ExchangeClient, HttpTransport, InfoClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import type { AccountState, MarketInfo, OrderResult, Venue } from "./venue.js";

/** Perp prices: at most 5 significant figures and at most 6 - szDecimals decimals. Integers are always valid. */
export function roundPrice(px: number, szDecimals: number): string {
  if (Number.isInteger(px)) return String(px);
  const maxDecimals = Math.max(0, 6 - szDecimals);
  const sig = Number(px.toPrecision(5));
  return sig.toFixed(maxDecimals).replace(/\.?0+$/, "");
}

/** Sizes round down so a position never exceeds the margin the risk engine approved. */
export function roundSize(size: number, szDecimals: number): string {
  const f = 10 ** szDecimals;
  return (Math.floor(size * f) / f).toFixed(szDecimals).replace(/\.?0+$/, "") || "0";
}

interface AssetMeta {
  index: number;
  szDecimals: number;
  maxLeverage: number;
}

export interface HyperliquidVenueOptions {
  privateKey: `0x${string}`;
  /** Address holding the account. Defaults to the signing key's address. */
  accountAddress?: `0x${string}`;
  testnet?: boolean;
  /** Max slippage for the marketable IOC limit order, as a fraction. */
  slippage?: number;
}

/** Read-only market data. No key required; powers paper mode with real prices. */
export class HyperliquidPrices {
  private readonly info: InfoClient;
  constructor(testnet = false) {
    this.info = new InfoClient({ transport: new HttpTransport({ isTestnet: testnet }) });
  }
  async markets(coins: string[]): Promise<MarketInfo[]> {
    const [meta, ctxs] = await this.info.metaAndAssetCtxs();
    return meta.universe.flatMap((u, i) => {
      const c = ctxs[i];
      return coins.includes(u.name) && c ? [{ coin: u.name, markPx: Number(c.markPx), maxLeverage: u.maxLeverage, funding: Number(c.funding) }] : [];
    });
  }
}

export class HyperliquidVenue implements Venue {
  readonly mode = "live" as const;
  readonly address: `0x${string}`;
  private readonly info: InfoClient;
  private readonly exchange: ExchangeClient;
  private readonly slippage: number;
  private assets = new Map<string, AssetMeta>();

  constructor(opts: HyperliquidVenueOptions) {
    const transport = new HttpTransport({ isTestnet: opts.testnet ?? false });
    const wallet = privateKeyToAccount(opts.privateKey);
    this.address = opts.accountAddress ?? wallet.address;
    this.info = new InfoClient({ transport });
    this.exchange = new ExchangeClient({ transport, wallet });
    this.slippage = opts.slippage ?? 0.01;
  }

  private async loadMeta(): Promise<[Awaited<ReturnType<InfoClient["metaAndAssetCtxs"]>>[0], Awaited<ReturnType<InfoClient["metaAndAssetCtxs"]>>[1]]> {
    const [meta, ctxs] = await this.info.metaAndAssetCtxs();
    meta.universe.forEach((u, index) => this.assets.set(u.name, { index, szDecimals: u.szDecimals, maxLeverage: u.maxLeverage }));
    return [meta, ctxs];
  }

  async markets(coins: string[]): Promise<MarketInfo[]> {
    const [meta, ctxs] = await this.loadMeta();
    return meta.universe.flatMap((u, i) => {
      const c = ctxs[i];
      return coins.includes(u.name) && c ? [{ coin: u.name, markPx: Number(c.markPx), maxLeverage: u.maxLeverage, funding: Number(c.funding) }] : [];
    });
  }

  async account(): Promise<AccountState> {
    const [state, fills] = await Promise.all([
      this.info.clearinghouseState({ user: this.address }),
      this.info.userFills({ user: this.address }),
    ]);
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    const dailyPnlUsd = fills
      .filter((f) => f.time >= midnight.getTime())
      .reduce((s, f) => s + Number(f.closedPnl) - Number(f.fee), 0);
    return {
      equityUsd: Number(state.marginSummary.accountValue),
      withdrawableUsd: Number(state.withdrawable),
      dailyPnlUsd,
      positions: state.assetPositions.map(({ position: p }) => {
        const size = Number(p.szi);
        return {
          coin: p.coin,
          side: size >= 0 ? ("long" as const) : ("short" as const),
          size: Math.abs(size),
          entryPx: Number(p.entryPx),
          leverage: p.leverage.value,
          marginUsd: Number(p.marginUsed),
          unrealizedPnlUsd: Number(p.unrealizedPnl),
          liquidationPx: p.liquidationPx === null ? null : Number(p.liquidationPx),
        };
      }),
    };
  }

  private async asset(coin: string): Promise<AssetMeta> {
    if (!this.assets.has(coin)) await this.loadMeta();
    const a = this.assets.get(coin);
    if (!a) throw new Error(`unknown market ${coin}`);
    return a;
  }

  private async mid(coin: string): Promise<number> {
    const mids = await this.info.allMids();
    const px = mids[coin];
    if (px === undefined) throw new Error(`no mid price for ${coin}`);
    return Number(px);
  }

  private async submit(coin: string, isBuy: boolean, size: string, reduceOnly: boolean): Promise<{ avgPx: number; size: number; orderId?: number }> {
    const a = await this.asset(coin);
    const mid = await this.mid(coin);
    const px = roundPrice(mid * (isBuy ? 1 + this.slippage : 1 - this.slippage), a.szDecimals);
    const res = await this.exchange.order({
      orders: [{ a: a.index, b: isBuy, p: px, s: size, r: reduceOnly, t: { limit: { tif: "Ioc" } } }],
      grouping: "na",
    });
    const st = res.response.data.statuses[0];
    if (!st) throw new Error("exchange returned no order status");
    if (typeof st === "object" && "error" in st) throw new Error(`order rejected: ${st.error}`);
    if (typeof st === "object" && "filled" in st) {
      return { avgPx: Number(st.filled.avgPx), size: Number(st.filled.totalSz), orderId: st.filled.oid };
    }
    throw new Error("order was not filled (IOC expired); no position was opened");
  }

  async open(coin: string, side: "long" | "short", leverage: number, marginUsd: number): Promise<OrderResult> {
    const a = await this.asset(coin);
    await this.exchange.updateLeverage({ asset: a.index, isCross: false, leverage });
    const mid = await this.mid(coin);
    const size = roundSize((marginUsd * leverage) / mid, a.szDecimals);
    if (Number(size) <= 0) throw new Error("computed size rounds to zero");
    const fill = await this.submit(coin, side === "long", size, false);
    return { coin, side, action: "open", size: fill.size, avgPx: fill.avgPx, orderId: fill.orderId };
  }

  async close(coin: string): Promise<OrderResult> {
    const pos = (await this.account()).positions.find((p) => p.coin === coin);
    if (!pos) throw new Error(`no open ${coin} position`);
    const a = await this.asset(coin);
    const fill = await this.submit(coin, pos.side === "short", roundSize(pos.size, a.szDecimals), true);
    return { coin, side: pos.side, action: "close", size: fill.size, avgPx: fill.avgPx, orderId: fill.orderId };
  }
}
