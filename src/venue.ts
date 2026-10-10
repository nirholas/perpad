export interface Position {
  coin: string;
  side: "long" | "short";
  size: number;
  entryPx: number;
  leverage: number;
  marginUsd: number;
  unrealizedPnlUsd: number;
  liquidationPx: number | null;
}

export interface AccountState {
  equityUsd: number;
  withdrawableUsd: number;
  positions: Position[];
  /** Realized PnL since 00:00 UTC, fees included. */
  dailyPnlUsd: number;
}

export interface MarketInfo {
  coin: string;
  markPx: number;
  maxLeverage: number;
  /** Hourly funding rate as a fraction. */
  funding: number;
}

export interface OrderResult {
  coin: string;
  side: "long" | "short";
  action: "open" | "close";
  size: number;
  avgPx: number;
  orderId?: number;
}

/** A trading venue. Real Hyperliquid and the paper simulator both implement this. */
export interface Venue {
  readonly mode: "live" | "paper";
  markets(coins: string[]): Promise<MarketInfo[]>;
  account(): Promise<AccountState>;
  open(coin: string, side: "long" | "short", leverage: number, marginUsd: number): Promise<OrderResult>;
  close(coin: string): Promise<OrderResult>;
}
