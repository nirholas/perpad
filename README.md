<div align="center">

# perpad

**Autonomous perp-trading agents on Hyperliquid, with limits the model cannot override.**

[![License: MIT](https://img.shields.io/badge/license-MIT-3ddc97.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-3ddc97.svg)](package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](tsconfig.json)
[![MCP](https://img.shields.io/badge/MCP-server-8a63d2.svg)](https://nirholas.github.io/perpad/mcp.html)
[![llms.txt](https://img.shields.io/badge/llms.txt-yes-blue.svg)](https://nirholas.github.io/perpad/llms.txt)

[Docs](https://nirholas.github.io/perpad/) · [Quickstart](https://nirholas.github.io/perpad/quickstart.html) · [Risk engine](https://nirholas.github.io/perpad/risk-engine.html) · [Roadmap](https://nirholas.github.io/perpad/roadmap.html)

</div>

An LLM agent reads live BTC and ETH prices from Hyperliquid, checks its account, then opens or closes isolated-margin perps. Every order passes a deterministic risk engine. Every thought, action and refusal is written to a hash-chained journal anyone can verify.

```text
        ┌────────────┐  5 tools   ┌──────────────┐  clamp / deny  ┌────────────┐
 tick → │  Claude    │ ─────────▶ │ risk engine  │ ─────────────▶ │   venue    │ → Hyperliquid
        │  (agent)   │ ◀───────── │ (pure code)  │                │ live/paper │
        └─────┬──────┘  verdicts  └──────────────┘                └────────────┘
              └──────────── every step ──▶ hash-chained journal (JSONL)
```

## Why

Most trading-agent demos give a model an exchange key and hope. perpad inverts that. The model has five tools and no way to withdraw, transfer, change limits or use cross margin. The only path to an order runs through code that reads live exchange limits. If the model asks for 100x on a 40x market it gets 40x or a refusal, and the refusal is journaled.

## Quickstart (paper mode, no exchange key)

```bash
git clone https://github.com/nirholas/perpad && cd perpad
npm install && npm run build
export ANTHROPIC_API_KEY=sk-ant-...
node dist/cli.js run examples/btc-eth.json --once
node dist/cli.js verify journal/tidewatcher.jsonl
```

Paper mode uses real Hyperliquid prices with simulated fills, the 0.045% taker fee and isolated liquidation. Going live needs `HL_PRIVATE_KEY` (a Hyperliquid **API wallet**, which can trade but not withdraw), `HL_ACCOUNT_ADDRESS`, and both `--live --i-understand-real-funds`. Try `"testnet": true` first.

## Features

| | |
|---|---|
| **Hard limits** | Allowed markets, max leverage clamped to the live exchange cap (BTC 40x, ETH 25x today), margin per trade, open positions, daily-loss kill switch |
| **Journal** | SHA-256 chained JSONL. `perpad verify` pinpoints the first edited or missing entry |
| **Venues** | `HyperliquidVenue` (real, `@nktkas/hyperliquid`) and `PaperVenue` behind one interface |
| **MCP server** | Read-only: `get_markets`, `check_risk`, `read_journal`. Holds no key |
| **Fee math** | Integer micro-unit 30/70 split, $15 sweep minimum, buyback / compound / payout routing |
| **Agent discovery** | `llms.txt`, `llms-full.txt`, A2A agent card, MCP metadata, `AGENTS.md` |

## Library

```ts
import { Agent, Journal, PaperVenue, HyperliquidPrices } from "perpad";

const venue = new PaperVenue(new HyperliquidPrices(), 1000);
await new Agent(config, venue, new Journal("journal/a.jsonl")).tick();
```

```ts
import { evaluate } from "perpad";
evaluate(
  { coin: "BTC", side: "long", leverage: 100, marginUsd: 900 },
  { openCoins: [], withdrawableUsd: 1000, dailyPnlUsd: 0, exchangeMaxLeverage: { BTC: 40 } },
  { markets: ["BTC"], maxLeverage: 50, marginPerTradeUsd: 100, maxOpenPositions: 1 },
); // { allowed: true, adjusted: { leverage: 40, marginUsd: 100 } }
```

## MCP

```json
{ "mcpServers": { "perpad": { "command": "npx", "args": ["-y", "github:nirholas/perpad", "mcp", "journal/agent.jsonl"] } } }
```

## Status and roadmap

v0.1 ships the trading core, journal, paper and live venues, MCP server and fee math, covered by 21 tests including a live Hyperliquid read. The Solana leg (claim pump.fun creator fees, swap, bridge, deposit to Hyperliquid), coin launch flow, buybacks and journal anchoring are on the [roadmap](https://nirholas.github.io/perpad/roadmap.html). They are not shipped and nothing here pretends otherwise.

## Security and risk

Leveraged perps can lose all margin quickly. This is software, not financial advice, and makes no profit claims. Read the [security model](https://nirholas.github.io/perpad/security.html) and [SECURITY.md](SECURITY.md). Independent project, not affiliated with Hyperliquid, pump.fun or Anthropic.

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Questions and ideas go to [Discussions](https://github.com/nirholas/perpad/discussions).

## Development

```bash
npm test            # 21 tests, includes a live read-only Hyperliquid call
npm run typecheck
npm run site:build  # regenerates docs/ (GitHub Pages)
```

MIT © nirholas
