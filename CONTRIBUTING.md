# Contributing

Thanks for helping. Short version: open an issue or discussion for anything large, then a PR.

1. `npm install && npm test && npm run typecheck`
2. Bug fix: add a failing test first, then the fix, in the same PR.
3. New behavior: add tests and update the matching `site/pages/*.html`, then `npm run site:build` and commit `docs/`.
4. Commit messages: `type(scope): what changed and why`, e.g. `fix(risk): deny opens once the daily loss cap is hit`.
5. Do not weaken the invariants listed in [AGENTS.md](AGENTS.md). PRs that add a path around the risk engine will be declined.

Good first issues are labeled. Ideas: stop-loss/take-profit tools, more venues behind the `Venue` interface, journal anchoring, a journal viewer.
