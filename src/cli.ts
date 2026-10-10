#!/usr/bin/env node
import { Agent } from "./agent.js";
import { loadConfig } from "./config.js";
import { HyperliquidPrices, HyperliquidVenue } from "./hl.js";
import { Journal } from "./journal.js";
import { PaperVenue } from "./paper.js";
import { serveMcp } from "./mcp.js";
import type { Venue } from "./venue.js";

const USAGE = `perpad - autonomous perp-trading agents on Hyperliquid

  perpad run <config.json> [--live --i-understand-real-funds] [--once]
  perpad verify <journal.jsonl>
  perpad mcp [journal.jsonl]

Paper mode is the default: real prices, simulated fills, no orders sent.
Live mode needs HL_PRIVATE_KEY (an API wallet key; set HL_ACCOUNT_ADDRESS to the
master account it trades for) and signs real orders with real USDC.
Both modes need ANTHROPIC_API_KEY.`;

async function run(args: string[]): Promise<void> {
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) throw new Error("missing config path");
  const cfg = loadConfig(file);
  const live = args.includes("--live");
  if (live && !args.includes("--i-understand-real-funds")) {
    throw new Error("--live signs real orders with real funds; add --i-understand-real-funds to confirm");
  }
  let venue: Venue;
  if (live) {
    const key = process.env.HL_PRIVATE_KEY;
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("HL_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key");
    const acct = process.env.HL_ACCOUNT_ADDRESS;
    if (acct && !/^0x[0-9a-fA-F]{40}$/.test(acct)) throw new Error("HL_ACCOUNT_ADDRESS must be a 0x-prefixed 20-byte address");
    venue = new HyperliquidVenue({ privateKey: key as `0x${string}`, accountAddress: acct as `0x${string}` | undefined, testnet: cfg.testnet });
  } else {
    venue = new PaperVenue(new HyperliquidPrices(cfg.testnet), cfg.paper.startingUsd);
  }
  const journal = new Journal(cfg.journalPath);
  const agent = new Agent(cfg, venue, journal);
  console.log(`${cfg.name}: ${venue.mode} mode, journal ${cfg.journalPath}`);
  do {
    try {
      await agent.tick();
    } catch (e) {
      journal.append("error", { message: e instanceof Error ? e.message : String(e) });
      console.error("tick failed:", e instanceof Error ? e.message : e);
    }
    if (args.includes("--once")) return;
    await new Promise((r) => setTimeout(r, cfg.intervalSec * 1000));
  } while (true);
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "run") await run(rest);
  else if (cmd === "verify" && rest[0]) {
    const entries = Journal.read(rest[0]);
    const bad = Journal.verify(entries);
    if (bad === null) console.log(`ok: ${entries.length} entries, hash chain intact`);
    else {
      console.error(`TAMPERED: chain breaks at seq ${bad}`);
      process.exitCode = 1;
    }
  } else if (cmd === "mcp") await serveMcp(rest[0]);
  else console.log(USAGE);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
