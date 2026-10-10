# Security policy

## Reporting a vulnerability
Use GitHub's private vulnerability reporting: **Security tab > Report a vulnerability**. Do not open public issues for exploitable bugs. Expect an acknowledgement within 72 hours.

## In scope
Bypasses of the risk engine, ways for model output to cause a transfer/withdrawal/limit change, key or secret leakage into logs or the journal, journal-chain forgery, and MCP server paths that could send orders.

## Out of scope
Market losses within configured limits, Hyperliquid or Anthropic service issues, and misuse of a key you chose to expose.

## Operating safely
Use a Hyperliquid API wallet (cannot withdraw), fund it with only what you can lose, start on testnet and in paper mode, and keep keys in the environment only.
