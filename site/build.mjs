// Static site generator. Reads site/pages/*.html fragments, writes docs/ (served by GitHub Pages from main:/docs).
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "docs");
const BASE = "https://nirholas.github.io/perpad/";
const REPO = "https://github.com/nirholas/perpad";
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const today = new Date().toISOString().slice(0, 10);

const pages = [
  { slug: "index", title: "perpad: autonomous perp-trading agents on Hyperliquid", nav: "Home", desc: "Open-source framework for AI trading agents on Hyperliquid with hard risk limits enforced in code, a tamper-evident public decision journal, paper and live modes, and an MCP server." },
  { slug: "quickstart", title: "Quickstart", nav: "Quickstart", desc: "Install perpad, run an agent in paper mode on real Hyperliquid prices in five minutes, then verify its journal." },
  { slug: "how-it-works", title: "How it works", nav: "How it works", desc: "The tick loop, the tool surface the model sees, and why every order passes through the risk engine." },
  { slug: "risk-engine", title: "Risk engine", nav: "Risk", desc: "Hard limits: allowed markets, max leverage clamped to the exchange cap, margin per trade, open positions and a daily loss kill switch." },
  { slug: "journal", title: "Decision journal", nav: "Journal", desc: "A hash-chained, append-only log of every thought, action and refusal. Edit or delete history and verification fails." },
  { slug: "fees-and-profit", title: "Fee split and profit routing", nav: "Fees", desc: "Integer-exact 30/70 creator-fee split, the $15 sweep minimum, and buyback, compound or payout profit routing." },
  { slug: "mcp", title: "MCP server", nav: "MCP", desc: "A read-only Model Context Protocol server: live markets, dry-run risk checks and journal audits for any MCP client." },
  { slug: "security", title: "Security model", nav: "Security", desc: "Threat model, key handling, what the code refuses to do, and what it cannot protect you from." },
  { slug: "faq", title: "FAQ", nav: "FAQ", desc: "Answers on paper vs live mode, costs, models, leverage, liquidation, and what perpad does not do." },
  { slug: "roadmap", title: "Roadmap", nav: "Roadmap", desc: "What ships today, what is next (Solana fee leg, pump.fun launch, profit payouts) and what is out of scope." },
];

const css = readFileSync(join(root, "site", "style.css"), "utf8");

function jsonLd(p) {
  const url = BASE + (p.slug === "index" ? "" : `${p.slug}.html`);
  if (p.slug === "index") {
    return [
      { "@context": "https://schema.org", "@type": "SoftwareSourceCode", name: "perpad", description: p.desc, codeRepository: REPO, programmingLanguage: "TypeScript", license: "https://opensource.org/licenses/MIT", author: { "@type": "Person", name: "nirholas", url: "https://github.com/nirholas" }, runtimePlatform: "Node.js" },
      { "@context": "https://schema.org", "@type": "WebSite", name: "perpad", url: BASE },
    ];
  }
  return [{ "@context": "https://schema.org", "@type": "TechArticle", headline: p.title, description: p.desc, url, dateModified: today, author: { "@type": "Person", name: "nirholas" }, isPartOf: { "@type": "WebSite", name: "perpad", url: BASE } }];
}

function render(p, body) {
  const url = BASE + (p.slug === "index" ? "" : `${p.slug}.html`);
  const title = p.slug === "index" ? p.title : `${p.title} | perpad`;
  const nav = pages.map((x) => `<a href="${x.slug === "index" ? "./" : x.slug + ".html"}"${x.slug === p.slug ? ' aria-current="page"' : ""}>${x.nav}</a>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${p.desc}">
<link rel="canonical" href="${url}">
<meta name="theme-color" content="#0b0f14">
<meta property="og:type" content="website">
<meta property="og:site_name" content="perpad">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${p.desc}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}og.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${p.desc}">
<meta name="twitter:image" content="${BASE}og.png">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="alternate" type="text/plain" href="${BASE}llms.txt" title="llms.txt">
<link rel="alternate" type="application/json" href="${BASE}.well-known/agent-card.json" title="A2A agent card">
<script type="application/ld+json">${JSON.stringify(jsonLd(p))}</script>
<style>${css}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header><div class="wrap bar"><a class="brand" href="./"><span class="mark" aria-hidden="true"></span>perpad</a><nav aria-label="Primary">${nav}</nav><a class="gh" href="${REPO}">GitHub</a></div></header>
<main id="main" class="wrap">
${body}
</main>
<footer><div class="wrap">MIT licensed. Independent open-source project by <a href="https://github.com/nirholas">nirholas</a>. Not affiliated with Hyperliquid, pump.fun or Anthropic. Not financial advice: leveraged trading can lose all margin. <a href="${BASE}llms.txt">llms.txt</a> · <a href="${BASE}.well-known/agent-card.json">agent card</a> · <a href="${REPO}">source</a></div></footer>
</body>
</html>
`;
}

mkdirSync(join(out, ".well-known"), { recursive: true });
const plain = [];
for (const p of pages) {
  const body = readFileSync(join(root, "site", "pages", `${p.slug}.html`), "utf8");
  writeFileSync(join(out, `${p.slug}.html`), render(p, body));
  plain.push(p);
}

const urls = pages.map((p) => BASE + (p.slug === "index" ? "" : `${p.slug}.html`));
writeFileSync(join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>\n`);
writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${BASE}sitemap.xml\n`);
writeFileSync(join(out, ".nojekyll"), "");

const strip = (h) => h.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/g, (_, c) => "\n```\n" + c.replace(/<[^>]+>/g, "") + "\n```\n").replace(/<h([1-3])[^>]*>/g, (_, n) => "\n" + "#".repeat(+n) + " ").replace(/<\/(p|li|h[1-3]|tr)>/g, "\n").replace(/<li>/g, "- ").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();

writeFileSync(join(out, "llms.txt"), `# perpad

> ${pkg.description}

perpad is a TypeScript library and CLI. An LLM agent reads live Hyperliquid prices and its account, then opens or closes isolated-margin BTC/ETH perps. Every order passes a risk engine that enforces hard limits in code. Every thought and action is written to a hash-chained public journal. Paper mode (real prices, simulated fills) is the default; live mode needs an explicit flag.

## Docs
${pages.map((p) => `- [${p.title}](${BASE}${p.slug === "index" ? "" : p.slug + ".html"}): ${p.desc}`).join("\n")}

## Optional
- [Full docs in one file](${BASE}llms-full.txt)
- [Source and issues](${REPO})
- [A2A agent card](${BASE}.well-known/agent-card.json)
- [MCP server metadata](${BASE}.well-known/mcp.json)
`);
writeFileSync(join(out, "llms-full.txt"), `# perpad: full documentation\n\n` + pages.map((p) => `\n---\n\n# ${p.title}\n\nURL: ${BASE}${p.slug === "index" ? "" : p.slug + ".html"}\n\n${strip(readFileSync(join(root, "site", "pages", `${p.slug}.html`), "utf8"))}\n`).join(""));

writeFileSync(join(out, ".well-known", "agent-card.json"), JSON.stringify({
  protocolVersion: "0.3.0",
  name: "perpad",
  description: "Open-source framework for autonomous perp-trading agents on Hyperliquid. This card describes the project and its read-only MCP server; it does not operate a hosted trading agent.",
  url: REPO,
  documentationUrl: BASE,
  version: pkg.version,
  provider: { organization: "nirholas", url: "https://github.com/nirholas" },
  capabilities: { streaming: false, pushNotifications: false },
  defaultInputModes: ["application/json"],
  defaultOutputModes: ["application/json"],
  skills: [
    { id: "get-markets", name: "Live Hyperliquid markets", description: "Mark price, max leverage and funding for requested coins.", tags: ["hyperliquid", "perps", "market-data"] },
    { id: "check-risk", name: "Dry-run risk check", description: "Evaluate a trade proposal against risk limits using live exchange leverage caps. Sends no orders.", tags: ["risk", "leverage", "trading"] },
    { id: "audit-journal", name: "Audit decision journal", description: "Read an agent journal and verify its hash chain.", tags: ["audit", "transparency"] },
  ],
}, null, 2) + "\n");

writeFileSync(join(out, ".well-known", "mcp.json"), JSON.stringify({
  name: "io.github.nirholas/perpad",
  description: "Read-only MCP server: live Hyperliquid markets, dry-run risk checks, hash-chained journal audits. Never signs or sends orders.",
  version: pkg.version,
  repository: { url: REPO, source: "github" },
  transport: { type: "stdio", command: "npx", args: ["-y", "github:nirholas/perpad", "mcp"] },
  tools: ["get_markets", "check_risk", "read_journal"],
}, null, 2) + "\n");

const mark = `<g transform="translate(0,0)"><rect width="64" height="64" rx="14" fill="#0b0f14"/><path d="M12 44 L24 30 L33 37 L52 16" fill="none" stroke="#3ddc97" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="52" cy="16" r="5" fill="#3ddc97"/></g>`;
writeFileSync(join(out, "favicon.svg"), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${mark}</svg>\n`);

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#0b0f14"/>
<path d="M0 520 L180 430 L300 470 L470 330 L620 380 L800 220 L960 290 L1200 90" fill="none" stroke="#3ddc97" stroke-opacity="0.35" stroke-width="6"/>
<g transform="translate(80,90) scale(2)">${mark}</g>
<text x="80" y="330" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="104" fill="#f2f5f8">perpad</text>
<text x="80" y="410" font-family="DejaVu Sans, sans-serif" font-size="40" fill="#b7c2cf">Autonomous perp-trading agents on Hyperliquid.</text>
<text x="80" y="465" font-family="DejaVu Sans, sans-serif" font-size="40" fill="#b7c2cf">Hard risk limits. Public, tamper-evident journal.</text>
<text x="80" y="570" font-family="DejaVu Sans Mono, monospace" font-size="30" fill="#3ddc97">github.com/nirholas/perpad</text>
</svg>`;
writeFileSync(join(out, "og.png"), new Resvg(ogSvg, { font: { loadSystemFonts: true } }).render().asPng());
console.log(`built ${pages.length} pages + discovery files into docs/`);
