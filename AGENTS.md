# AGENTS.md

Guidance for AI coding agents working in this repo. Humans: see README.md and CONTRIBUTING.md.

## What this is
TypeScript (ESM, strict) library + CLI for LLM-driven perp trading on Hyperliquid. Single package, `src/` -> `dist/`.

## Commands
- `npm install` then `npm test` (vitest; `tests/hl.test.ts` makes one real read-only call to api.hyperliquid.xyz)
- `npm run typecheck`, `npm run build`
- `npm run site:build` regenerates `docs/` from `site/pages/*.html`. Never edit `docs/*.html` by hand.

## Layout
- `src/risk.ts` pure risk gate. `src/fees.ts` bigint money math. `src/journal.ts` hash chain.
- `src/venue.ts` interface; `src/hl.ts` live; `src/paper.ts` simulated. `src/agent.ts` tool loop. `src/mcp.ts` read-only MCP.

## Invariants (do not break)
1. Every order path goes through `evaluate()`. No tool may bypass it.
2. The model gets no tool for transfers, withdrawals, cross margin or changing limits.
3. The MCP server never holds a key and never sends orders.
4. Money is bigint micro-units in `fees.ts`. No floats for accounting.
5. Journal entries are append-only and hash-chained. Opening a corrupt journal for writing must throw.
6. Live mode requires `--live` and `--i-understand-real-funds`.
7. Never log or journal secrets. Never commit `.env`.

## Conventions
Bug fixes start with a failing test. No mocks of Hyperliquid in tests that claim to verify exchange behavior; the LLM client may be scripted. Keep docs in `site/pages` in sync with behavior.

## Discovery
`docs/llms.txt`, `docs/llms-full.txt`, `docs/.well-known/agent-card.json`, `docs/.well-known/mcp.json`.
