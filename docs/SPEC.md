# Desi Desktop — Unified Build Specification v2

Nov 23, 2026 · @Manoj

## 0. Summary and how to use this document

Desi Desktop v2 is a free, fast, Google-first start page for South Asians living in the US. It is a static site on Cloudflare with a background data engine on GitHub Actions. It costs $0 a month at 100,000+ daily users, and it launches only with content it has the right to show. This document replaces all earlier specs. Claude Code is the builder.

**Inputs merged.** Three architect specs, labeled in the decision log:

- **Spec A**: "Desi Desktop — Build Specification" (30-minute refresh, nine default tiles, vanilla JS, watchdog, PWA).
- **Spec B**: "Desi Desktop — Audience research, requirements, architecture" v1.0 (rights-first, official sources, Austin edition, TypeScript + Vite, pilot gate).
- **Spec C**: "v1.2 Background Content Engine" (source rights lifecycle, hardened networking, retention rules, honest links-first states).

**Owner decisions (fixed, 23 Nov 2026).**

1. **Audience:** all US Desis (Indian, Pakistani, Bangladeshi, Nepali, Sri Lankan), national content only. No city edition in v1.
2. **Content rights: hybrid.** Official and open-data sources are live at launch. Each publisher's headlines switch on only after the owner reviews that source's terms; until then its tile shows honest "Useful links".
3. **Refresh:** the engine wakes every 30 minutes in a public GitHub repo. Each source has its own minimum interval, and the site redeploys only when visible content changes.
4. **Builder:** Claude Code. Where specs conflict, the lead architect picks the best fit; every pick is in section 1.

**Reading order.** Section 1 (decisions) → 2 (audience and tiles) → 3 (requirements) → 4–6 (design) → 7 (build, test, operate) → 8 (Claude Code handoff).

**Guiding principles, in priority order.**

1. **Honest.** Never show content without the right to show it. Never label old data as fresh, links as headlines, or a 30-minute refresh as "live".
2. **Free.** $0 recurring. No paid plan, API or upgrade is ever enabled automatically. The only optional cost is a custom domain.
3. **Simple.** One person runs it. No database, no accounts, no servers, no frontend framework.
4. **Scales by design.** Visitors only download static files. Upstream calls depend on the schedule, never on visitor numbers.
5. **Runs itself, safely.** Automated refresh, checks, alerts and rollback. Anything involving rights, money or credentials waits for the owner.
6. **Apple-style calm.** Search is the focal point. White space, one accent color, five lines per tile, no clutter, no ads.

## 1. Decision log

The three specs agree on the core: static site on Cloudflare, background collection on GitHub Actions, preferences in the browser, Google search first, $0 budget. They disagree on 22 points. Each is settled below; "Owner" means the owner decided, "Architect" means the lead architect picked.

| # | Topic | A says | B says | C says | Decision | Why |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | Audience | All US Desis | Indians first + Austin edition | Broad catalog | All US Desis, national (Owner) | Widest useful audience; no weekly local curation |
| D2 | Content rights | Public RSS headlines | Official sources; others links-only | Formal rights lifecycle; links-first | Hybrid: official/open live; publisher feeds per approval; C's lifecycle (Owner) | Launch with real content, no legal risk |
| D3 | Refresh | Every 30 min | 4 times a day | Every 6 h | Engine wakes every 30 min; each source has its own minimum interval (Owner + Architect) | Fresh where sources allow; polite to slow sources |
| D4 | Repo | Public | Private | Public | Public (follows D3) | 30-min runs exceed private free minutes; no publisher content is ever committed (C) |
| D5 | Frontend | Vanilla JS | Vanilla TypeScript + Vite | React + TypeScript | Vanilla TypeScript + Vite (Architect) | Shared types with the engine catch mistakes; no framework weight; Vite hashes and minifies |
| D6 | Validation | JSON Schema (Ajv) | Ajv | Zod | Zod in the engine; small hand-written guards in the browser (Architect) | One source of truth for types; keeps browser JS under budget |
| D7 | Hosting | Workers static assets | Workers static assets, assets-only | Pages Direct Upload | Workers static assets, assets-only site (Architect) | Unlimited free static requests; no Pages build quota |
| D8 | Stalled scheduler | Watchdog in the site Worker | Owner checks weekly | Owner checks monthly | Separate cron-only watchdog Worker re-enables and dispatches the workflow (Architect) | Fixes the gap B and C name; site stays assets-only |
| D9 | Keepalive | Weekly heartbeat commit | n/a | No fake commits | No fake commits; watchdog re-enables workflows (Architect) | Same effect without noise in history |
| D10 | Default tiles | 9 incl. Deals, Tech | 6 | Large catalog | 9 (3×3), all with honest content on day one (Architect) | Full grid, nothing empty or fake at launch |
| D11 | Rows per tile | 10 | 5, Show more to 10 | Collect 20, show 5/10 | Collect up to 20, show 5, Show more to 10 (B + C) | Calm by default; filter still finds older rows |
| D12 | Grid | 3 or 4 columns | 3/2/1 responsive | 3/2/1 | 3/2/1; optional 4 columns at ≥ 1280 px (Architect) | Owner first asked for 4×N; default stays calm |
| D13 | Filter scope | Title + label | Title only | Title only | AND of all words within one heading or one row title (B + C) | Predictable; no matches across fields |
| D14 | Setup code | v1 Should | none | none | Later (Architect) | Not needed to launch |
| D15 | PWA | Full service worker | Bookmark help | none | Manifest + icons at launch; offline service worker v1.1 (Architect) | Home-screen install now; avoid cache bugs at launch |
| D16 | Freshness | Stale after 3 h | Stale 12 h, drop 48 h | Stale 18 h, drop 7 days | Stale after 3× the source interval; reuse last good max 48 h; drop headlines older than 7 days or license limit (Architect) | Honest at any refresh rate |
| D17 | Network safety | Basic | Strong | Strongest, incl. DNS pinning | B + C controls without DNS pinning (Architect) | Exact-host allowlist on short-lived CI runners covers the risk |
| D18 | Deploy cadence | Every run | Only on change | On change + daily heartbeat | Only on change + one daily heartbeat (C) | Saves deploys; keeps health timestamps truthful |
| D19 | Alerts | GitHub Issues | Workflow emails | Workflow emails | Both: Issues per failing source + workflow failure emails (Architect) | Issues track and auto-close; emails catch crashes |
| D20 | Dependency updates | Auto-merge minor/patch | No unattended upgrades | Pinned SHAs | Dependabot weekly; auto-merge dev-only patches after CI; runtime and Actions updates need the owner; Actions pinned by SHA (Architect) | Safety without monthly toil |
| D21 | Cricket | Live API scores | Curated fixtures + links | Links | Curated fixtures + official links at launch; API adapter built, off until rights confirmed (B) | Honest now, live later |
| D22 | Weather | Browser calls NWS | Engine, Austin only | Engine, fixed city list | Engine fetches NWS for 20 fixed Desi metro areas; user picks one (C) | No per-visitor calls; national coverage |

Also adopted without conflict: B's split between measured facts and hypotheses, B's two-week pilot gate, C's "Useful links — not a live feed" label, C's purge procedure for revoked sources, and A's Customize panel and How it works help.

## 2. Audience research and tile catalog

The v1 default grid covers what the evidence shows US Desis care about: home-country news, cricket, visas, money sent home and family across time zones. Every default tile has real, rights-clean content on launch day.

### 2.1 Measured facts

- **Audience size.** About 5.2 million people in the US identified as Indian in 2023 ([Pew](https://www.pewresearch.org/short-reads/2025/05/01/key-facts-about-asians-in-the-us/)); about 680,000 as Pakistani ([Pew](https://www.pewresearch.org/race-and-ethnicity/fact-sheet/asian-americans-pakistanis-in-the-u-s/)). Bangladeshi, Nepali and Sri Lankan communities are smaller but distinct.
- **Strong ties to home.** 81% of Indian Americans ate Indian food in the past month, and identity with India is rising among the US-born ([Carnegie 2024](https://carnegieendowment.org/research/2025/06/indian-americans-social-survey-data)). 54% follow news about India online ([Carnegie 2020](https://carnegieendowment.org/research/2021/02/how-do-indian-americans-view-india-results-from-the-2020-indian-american-attitudes-survey)).
- **Cricket.** IPL was India's #1 search of 2025 ([Google](https://blog.google/intl/en-in/products/explore-communicate/indias-year-in-search-2025-the-a-to-z-of-trending-searches/)). The 2024 T20 World Cup drew 190,000 US first-round attendees ([ICC](https://www.icc-cricket.com/media-releases/icc-men-s-t20-world-cup-draws-unprecedented-interest-for-cricket-in-the-united-states)).
- **Money home.** India received $150.7 billion in remittances in 2025, the most of any country ([World Bank via Policy Edge](https://www.policyedge.in/p/india-remains-worlds-largest-remittance-recipient-with-us1507-billion-in-2025)); RBI estimates 27.7% of India's inflows come from the US ([RBI](https://www.rbi.org.in/scripts/BS_ViewBulletin.aspx?Id=23260)).
- **Visas.** Indians hold 91% of the US EB-2 green card backlog ([USCIS data via NewKerala](https://www.newkerala.com/news/a/indians-hold-91-pc-us-eb-2-green-card-782.htm)).
- **Weather.** 68% of US adults often get local weather news ([Pew](https://www.pewresearch.org/journalism/2024/05/07/local-news-topics/)).
- **Faith is mixed.** About 48% of Indian Americans are Hindu ([Pew](https://www.pewresearch.org/race-and-ethnicity/2024/08/06/indian-americans-a-survey-data-snapshot/)); Pakistani and Bangladeshi Americans are mostly Muslim. Faith tiles are always opt-in.

### 2.2 Hypotheses the pilot must test

These are reasonable but unmeasured for US Desis: how often they want India vs US news; whether Movies, Deals or Tech tiles get daily use; whether a family time-zone clock earns a default slot; and whether people actually set Desi Desktop as a start page. No public source ranks US Desi search interests directly (B, section 1). Section 7.6 defines the pilot that tests them.

### 2.3 Tile catalog

Launch modes: **Live** = automated rights-clean source; **Curated** = original content written and maintained in the repo; **Links** = "Useful links — not a live feed" until a source is approved; **Local** = computed or stored in the browser, no engine.

| Tile (id) | Default | Launch mode | Launch content | Upgrades when approved |
| --- | --- | --- | --- | --- |
| My Shortcuts (`shortcuts`) | On | Local | Gmail, WhatsApp Web, LinkedIn, GitHub, USCIS case status; user adds up to 12 | n/a |
| India News (`india-news`) | On | Live | Press Information Bureau (PIB) RSS; titled "India Updates" while only official sources are on | Publisher RSS headlines (The Hindu, NDTV and others) |
| US News (`us-news`) | On | Live | Federal Register API, allowlisted agencies; titled "US Updates" while official-only | Publisher RSS headlines |
| Cricket (`cricket`) | On | Curated | Upcoming India, Pakistan, Bangladesh, Sri Lanka, Nepal and USA fixtures in US time, plus official match-center links | CricketData scores (adapter off by default) |
| Visa & Immigration (`visa`) | On | Live | USCIS news RSS filtered to visa topics; current and next Visa Bulletin links; embassy and consulate links for all five countries | Immigration news publishers |
| Currency (`currency`) | On | Live | USD to INR, PKR, BDT, NPR, LKR central-bank reference rates with daily change; links to transfer providers (no rate comparison) | Provider transfer quotes |
| South Asia News (`south-asia`) | On | Links | Pakistan, Bangladesh, Nepal, Sri Lanka publisher directory links | Dawn, The Daily Star, Kathmandu Post, Daily Mirror RSS |
| Family Time & Weather (`time-weather`) | On | Local + Live | Clocks for the user's US time and India, Pakistan, Bangladesh, Nepal, Sri Lanka; NWS forecast for one of 20 Desi metro areas | n/a |
| Festivals & Holidays (`festivals`) | On | Curated | Next 10 festivals and holidays across faiths and countries, with dates | n/a |
| Movies & OTT (`movies`) | Off | Links | Streaming and studio directory links | Entertainment RSS |
| Tech & AI (`tech`) | Off | Links | Official developer and product blog links | Hacker News, tech RSS |
| Deals (`deals`) | Off | Off until feed exists | Hidden from catalog until the owner's KanjoosLala feed is live | Owner feed (owner holds the rights) |
| Desi Near Me (`near-me`) | Off | Local | Map searches for Desi groceries, temples, mosques, gurdwaras, halal, restaurants in the chosen metro | n/a |
| Prayer Times (`prayer`) | Off | Local | Computed in the browser for the chosen metro (`adhan`, MIT) | n/a |
| Jobs & Careers (`jobs`) | Off | Links | Official career and visa-friendly job-search links | Approved job feeds |
| Later | — | — | Travel fares, Markets & Gold, Rashifal & Panchang, Food & Recipes, Education | Need free licensed sources first |

Tile titles describe what is really inside. A Links tile never shows timestamps or "updated" labels that imply a feed.

## 3. Requirements

v1 is one home page plus Help, About & Sources, and Privacy pages, backed by the data engine. Every requirement below is Must unless marked Should (may slip to v1.1). Tests in section 7.2 cite these IDs.

### 3.1 Out of scope for v1

Accounts and login, cross-device sync, native app-store apps, browser extensions, ads and payments, server-side user data, city editions, languages other than English (content may contain other scripts), AI-written or AI-summarized content, scraping, and paid data feeds.

### 3.2 Functional requirements

| ID | Requirement | Acceptance |
| --- | --- | --- |
| FR-01 Search | A large Google search box is the first element on the page and has focus on desktop load. It is a real `<form method="get" action="https://www.google.com/search">` that works without JavaScript. | Enter sends the trimmed query as one `q` value and opens Google in the same tab. Empty or whitespace-only input does nothing. Back returns to a working page. |
| FR-02 Grid | Tiles show in a responsive grid: 3 columns at ≥ 1024 px, 2 at 640–1023 px, 1 below 640 px. Should: an optional 4-column setting applies at ≥ 1280 px. | No horizontal scrolling from 320 px wide and at 200% zoom. Order is row by row at all sizes. |
| FR-03 Tile | Each tile has an icon, title, mode label, up to 5 visible rows, Show more (to 10), and a footer with source freshness. Each row is one link with muted source and age. | Live rows open the original source. Links tiles show "Useful links — not a live feed" and no timestamps. |
| FR-04 Freshness | Tiles show per-source age ("Updated 25 min ago"). The browser recomputes stale state from timestamps. | A tile whose data passes its stale limit shows "May be out of date" even if the engine is down. Expired rows disappear in the browser. |
| FR-05 Customize | A Customize panel lists tiles on the page (in order) and the rest of the catalog, with Add/Hide switches, Move up/Move down buttons, drag to reorder (desktop progressive enhancement), the metro-area picker, the columns setting and Reset. | Changes apply at once and survive reload. A moved tile keeps focus and announces its new position. Reset asks to confirm. Reordering is disabled while a filter is active. |
| FR-06 Remove from grid | A × on each tile hides it. | Hidden tile stays hidden after reload and can be re-added. A layout with zero tiles shows an "Add tiles" prompt. |
| FR-07 Filter | A filter box splits the query into words. A heading or row matches only if that one heading or row title contains every word (any order, case-insensitive, Unicode-normalized). | "india visa": tiles show if their title or at least one row title has both words; inside a shown tile only matching rows appear, searched across all collected rows (up to 20). A title-only match shows "No matching items". Nothing matches: one page-level empty state. Escape clears when the box has focus. |
| FR-08 Preferences | Tile choices, order, metro, columns and shortcuts are saved in `localStorage`, with no login and no cookies. | Survives restart. Storage blocked or corrupt: defaults load, changes work for the visit, and a quiet note says "Changes are saved for this visit." |
| FR-09 Shortcuts | Users add, rename, reorder and remove up to 12 shortcuts. | Only `https:` URLs (and `http:` with a warning) are accepted. No shortcut data leaves the browser. |
| FR-10 Metro area | Users pick one of 20 US metro areas (or none). It drives Weather, Prayer Times and Near Me. | Default is none; no browser location permission is ever requested. |
| FR-11 Help | A first-visit tip (one line, dismissible) and a Help page explain adding, hiding and moving tiles, the filter, where settings are saved, and how to open Desi Desktop on startup in Chrome, Edge, Safari and Firefox, and on iPhone and Android home screens. | Tip appears once per browser. Help is reachable from the top bar at every width. |
| FR-12 Home-screen install | The site has a web app manifest and icons so it installs on iOS and Android home screens. Should (v1.1): an offline service worker. | Installs and opens full screen on iOS Safari and Android Chrome. |
| FR-13 About & Sources | Lists every enabled source, its mode, attribution and terms link, plus Privacy and Contact. | Linked from the footer. Generated from the source registry, so it is always current. |
| FR-14 Resilience | Search, shortcuts, help, filter and customization work if all data fails to load. | With `/data/*` blocked, the page still renders the grid with "Nothing to show right now" tiles. |

### 3.3 Data engine requirements

| ID | Requirement |
| --- | --- |
| ENG-01 | Every tile declares a mode: `live`, `curated`, `links` or `local`. No tile is ever filled with invented data. |
| ENG-02 | A versioned source registry maps each source to tiles, endpoint, adapter, allowed hosts, attribution, rights status, refresh interval and retention. |
| ENG-03 | Collection runs on a schedule, independent of visitors. No browser request can trigger collection. Upstream requests depend only on sources × schedule. |
| ENG-04 | Adapters: RSS 2.0, Atom, provider-specific JSON (Federal Register, Frankfurter, NWS, CricketData) and curated JSON. Local tiles make no engine requests. |
| ENG-05 | Every record is normalized to plain text, safe https URL, UTC times, attribution; deduplicated; filtered by tile relevance rules; capped at 20 per tile. |
| ENG-06 | One failing source affects only its own rows. Last good rows are reused only within freshness and rights limits, then the tile falls back to links. |
| ENG-07 | Each row keeps source, original URL, publication time (never replaced by fetch time), first-seen time and expiry when known. |
| ENG-08 | Public health data shows each source's and tile's state and last success. A recent engine run never implies every source is fresh. |
| ENG-09 | A source can be enabled only when its rights status is `approved` with a recorded review. Public RSS availability is not permission. Revoked or expired approval removes its rows immediately, including fallback rows. |
| ENG-10 | Publishing is atomic: only a complete, schema-valid bundle replaces production. |
| ENG-11 | The owner can enable or disable a source, change limits, rerun, and roll back by editing config or using workflow controls; no admin website. |
| ENG-12 | All parsing, filtering, retention, failure and publishing rules have fixture-based tests. Tests never depend on live third-party availability. |
| ENG-13 | No visitor data (queries, locations, shortcuts, identities) ever enters the engine. |

### 3.4 Non-functional requirements

| ID | Requirement |
| --- | --- |
| NFR-COST | $0 a month under current free-tier terms. No automatic upgrades; never enter payment details. Optional domain is the only cost. |
| NFR-SCALE | Every visitor request is a static file. 100,000 daily visitors need no design change. |
| NFR-PERF | Home page JS ≤ 45 KB gzip; HTML+CSS+JS+data ≤ 120 KB gzip; data file ≤ 150 KB uncompressed. LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 on a throttled mobile run. No web fonts, images or ad scripts. |
| NFR-A11Y | WCAG 2.2 AA: keyboard-only use, visible focus, 44 px touch targets, screen-reader names and announcements, 4.5:1 contrast, reduced motion, light and dark mode. |
| NFR-SEC | Strict CSP (no inline or third-party scripts), feed text rendered only via `textContent`, https-only outbound links, `form-action` limited to Google, no secrets in the browser bundle. |
| NFR-PRIV | No cookies, no analytics that identify people, no server-side user data. Optional Cloudflare Web Analytics (cookieless, aggregate) only after the owner turns it on. |
| NFR-HONEST | The UI never says "live" for data refreshed on a schedule, never shows links as headlines, and shows per-source age. |
| NFR-MAINT | Routine owner time under 1 hour a month; the owner is alerted only when something needs a decision. |
| NFR-UI | Apple-inspired, original design: system font, one blue accent, generous space, 5 rows per tile, at most 2 actions in the top bar, no pop-ups except the first-visit tip. |

## 4. High-level architecture

The site is static files on Cloudflare. A scheduled engine on GitHub Actions collects approved data, builds one validated bundle and deploys it only when visible content changes. A tiny separate Worker watches the scheduler. Nothing a visitor does calls a metered service.

### 4.1 Components

1. **Web app (browser).** Vanilla TypeScript built by Vite into a few hashed files. Reads `/data/content.json` and `/data/health.json`, renders tiles, runs the filter, stores preferences in `localStorage`, computes clocks and prayer times locally.
2. **Site Worker `desi-desktop` (Cloudflare Workers Static Assets, assets-only).** No script runs for visitors; [requests to static assets are free and unlimited](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/). Free address `desi-desktop.<account>.workers.dev`; an owned domain can be attached later.
3. **Data engine (Node.js + TypeScript in GitHub Actions).** Wakes every 30 minutes, fetches only sources that are due, normalizes, validates and publishes (section 5).
4. **Watchdog Worker `desi-desktop-watchdog` (cron only, no routes).** Hourly: if the refresh workflow is disabled or has not run for 2 hours (checked through the GitHub API), it re-enables it and dispatches a run. Separate from the site so the site stays assets-only.
5. **GitHub repository (public).** Code, config, curated content, tests, workflows. Never contains collected publisher content. Issues are the owner's alert inbox.

### 4.2 Request flow

1. Visitor loads `/` → Cloudflare edge returns `index.html` (revalidated) and hashed JS/CSS (cached for a year).
2. The app renders the search box and tile skeletons from local preferences immediately, then loads `/data/content.json` (edge-cached 5 minutes) and fills tiles.
3. Search submits straight to Google. Filter, clocks and prayer times run in the browser. Visitors never cause a call to any upstream source.

### 4.3 Tech stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript (strict) everywhere | Shared contracts in `shared/` used by engine and app |
| Frontend | Vite (vanilla template), semantic HTML, CSS custom properties | No framework; multipage build: `/`, `/help/`, `/about/`, `/privacy/` |
| Engine | Node.js active LTS (pin exact version in `.nvmrc`), native `fetch`, `fast-xml-parser` with entity processing off, Zod | Runs only in CI |
| Local tiles | `Intl.DateTimeFormat` for clocks; `adhan` (MIT) for prayer times | No network |
| Hosting | Cloudflare Workers Static Assets, Wrangler deploys from CI | Workers Free plan |
| Watchdog | Cloudflare Worker with one cron trigger | Free plan allows 5 cron triggers ([limits](https://developers.cloudflare.com/workers/platform/limits/)) |
| CI/CD and scheduler | GitHub Actions, public repo, standard Linux runners | [Free for public repos](https://docs.github.com/en/actions/reference/usage-limits-billing-and-administration); actions pinned by commit SHA |
| Tests | Vitest, Playwright (Chromium, Firefox, WebKit), axe-core, Lighthouse CI | All run in Actions |
| Package manager | npm with committed `package-lock.json`, `npm ci` only |  |

### 4.4 Free-tier budget

| Resource | Free limit | Planned use |
| --- | --- | --- |
| Static asset requests | Unlimited | \~1.2 million/day at 100,000 visitors (B's model) |
| Worker script requests | [100,000/day](https://developers.cloudflare.com/workers/platform/limits/) | \~24/day (watchdog only) |
| Static files per version | 20,000, max 25 MiB each | \~30 |
| GitHub Actions | Free in public repos | 48 refresh runs/day × \~2 min, plus CI |
| Deploys | Not metered on Workers Free as far as published docs show; verify at setup | Only on content change (est. 15–30/day) + 1 daily heartbeat |
| Upstream calls | Each provider's fair-use terms | \~270/day total across all sources (section 5.6), independent of visitors |

### 4.5 Scaling path

| Trigger | Action |
| --- | --- |
| 0–100,000+ daily visitors | Nothing. Static delivery scales on the edge. |
| Any free quota at 70% for two weeks | Lengthen source intervals or cut sources before considering spend (B). |
| Live cricket wanted | Owner approves CricketData rights and possibly its $5.99/month plan; the adapter already exists. |
| Cross-device sync wanted | Add passwordless email sign-in + Cloudflare D1. Separate decision. |
| App-store presence wanted | Wrap the web app (Android Trusted Web Activity; iOS shell). Store fees apply. |

### 4.6 Architecture diagram

&#91;embedded content: Desi Desktop v2 architecture · all components on free tiers\]

Visitors load only static files and go straight to Google for search. The engine is the only component that calls outside sources, and the watchdog revives it if GitHub stops scheduling it.

## 5. Data engine

The engine is the only thing that talks to outside sources. It wakes every 30 minutes, fetches whichever approved sources are due, turns everything into one validated bundle, and deploys it only if something a visitor would see has changed. Rights are checked in config before any request is made.

### 5.1 Source rights lifecycle

`draft` → `verified` (endpoint works, parser tested) → `reviewed` (owner read the terms and recorded the decision) → `approved` → enabled. Only `approved` + `enabled: true` sources are fetched or published. Any later change to `revoked` or a passed `reviewDueAt` removes the source's rows from the next bundle, including fallback rows, and triggers the purge procedure (5.8). Technical success never approves a source.

The owner records a review in `config/sources.json` by setting `rights.status`, `rights.reviewedBy`, `rights.reviewedAt`, `rights.reviewDueAt` (default 12 months), `rights.termsUrl`, `rights.commercialUse`, and `rights.allowedFields` (for v1: `title`, `url`, `publishedAt`). Official government sources still get a one-time recorded review at setup.

### 5.2 Source registry entry

```json
{
  "id": "uscis-news",
  "publisher": "USCIS",
  "adapter": "rss",
  "endpoint": "https://www.uscis.gov/news/rss-feed/59144",
  "allowedHosts": ["www.uscis.gov"],
  "tiles": ["visa"],
  "relevance": { "include": ["visa", "h-1b", "green card", "citizenship", "daca", "tps", "fee", "form i-"], "exclude": [] },
  "minIntervalMinutes": 60,
  "maxItems": 20,
  "maxRetentionHours": 168,
  "attribution": "USCIS",
  "enabled": true,
  "rights": { "status": "approved", "basis": "US government work", "termsUrl": "https://www.uscis.gov/website-policies", "commercialUse": true, "allowedFields": ["title", "url", "publishedAt"], "reviewedBy": "owner", "reviewedAt": "YYYY-MM-DD", "reviewDueAt": "YYYY-MM-DD" },
  "fallbackLinks": [{ "title": "USCIS newsroom", "url": "https://www.uscis.gov/newsroom" }]
}
```

Curated sources use `"adapter": "curated"`, `"endpoint": null`, and point to a file in `content/curated/`. Their rights basis is "original content".

### 5.3 Schedule

- `refresh.yml` runs on cron `*/30 * * * *` (UTC) and on manual dispatch; GitHub may delay scheduled runs, so 30 minutes is a target, not a promise.
- A source is due when `now ≥ lastAttemptAt + minIntervalMinutes`. Manual runs respect intervals unless the owner passes `force=true`.
- One concurrency group `publish`, `cancel-in-progress: false`; job timeout 10 minutes. A run always builds from the latest `main`.

### 5.4 One run, step by step

1. **Validate config.** Zod-check `config/catalog.json`, `config/sources.json`, `config/metros.json` and every curated file. Enabled-but-unapproved sources fail the run.
2. **Load previous state.** Download the live `/data/content.json` and `/data/health.json` (size-capped, schema-checked, treated as untrusted). Use them only for rows from sources that are still approved; never derive fetch targets from them. A first run starts empty.
3. **Fetch due sources** (5.5 network rules): at most 3 at a time, 10 s per request, 30 s per source, 1 MiB body cap, 1 retry on network/429/5xx honoring `Retry-After` within budget. Send `If-None-Match`/`If-Modified-Since` from the previous health state; a 304 reuses that source's previous rows.
4. **Parse** with the source's adapter; reject malformed or truncated input and HTML error pages posing as feeds.
5. **Normalize** each row: plain text title ≤ 180 chars (decode entities once, strip tags and control characters), https URL ≤ 2,048 chars with fragments and known tracking parameters removed, `publishedAt` parsed strictly (null if missing; never replaced by fetch time), `firstSeenAt` carried from the previous bundle, id = GUID or SHA-256(sourceId + canonical URL) truncated to 16 hex chars.
6. **Filter for relevance** using the source's include/exclude rules; no inference from names, no AI ranking.
7. **Deduplicate**: same id within a source; same canonical URL across sources (keep all attributions). Similar titles with different URLs are not merged.
8. **Assemble tiles**: drop expired rows and rows past retention; sort by `publishedAt` desc (nulls last) then id; alternate sources so one outlet cannot fill a tile; cap at 20.
9. **Fall back per source**: failed source → reuse its previous rows while within freshness limits (5.6); afterwards its tile shows fallback links. Sources that return a valid empty feed are "empty", not "failed".
10. **Write the bundle** to a temp folder: `content.json`, `health.json`, `meta.json`, `sources.json` (public attribution list for the About page). Validate the whole bundle, including cross-references.
11. **Compare**: hash the visitor-visible parts (rows, tile states, fallback links), ignoring timestamps of attempts. If unchanged and a heartbeat deploy already happened today, stop here.
12. **Build and deploy** the site with the new data in one `wrangler deploy`, then run the production smoke test (7.2 T-13). On failure, roll back to the previous version and open an Issue.
13. **Alert**: open or update an Issue `Source failing: <id>` after 3 consecutive hours of failure; close it automatically on recovery. Workflow crashes email the owner through GitHub notifications.

### 5.5 Network rules

HTTPS only. Exact-host allowlist per source, checked on the first request and every redirect (max 3). Reject URLs with credentials, non-standard ports, or hosts resolving to private, loopback or link-local addresses. XML parser with DTDs and external entities disabled. Accept only the expected content types. Identify as `User-Agent: DesiDesktopBot/1.0 (+https://<site>/about/; <owner contact email>)`, which NWS requires. Never log response bodies, tokens or full URLs with keys.

### 5.6 Sources at launch

| Source | Adapter | Tile | Interval | Calls/day | Launch status |
| --- | --- | --- | --- | --- | --- |
| PIB press releases RSS ([RSS page](https://www.pib.gov.in/ViewRss.aspx?lang=1&reg=1), [copyright policy](https://www.pib.gov.in/content/186_2_Copyright-Policy.aspx?lang=1&reg=5)) | rss | india-news | 30 min | 48 | Official; owner records review at setup |
| Federal Register API `/api/v1/documents.json`, agencies: USCIS, State, Homeland Security, Labor, Treasury | federal-register | us-news, visa | 60 min | 24 | US government data; review at setup |
| USCIS news RSS (endpoint verified by Spec C) | rss | visa | 60 min | 24 | Official; review at setup |
| State Department Visa Bulletin (URL builder + HEAD check) | visa-bulletin | visa | 24 h | 2 | Official links |
| Frankfurter v2 rates, base USD, quotes INR, PKR, BDT, NPR, LKR ([docs](https://frankfurter.dev/)) | fx | currency | 6 h | 8 | Free, no key; verify PKR, BDT, NPR, LKR coverage at build |
| National Weather Service `/points` (cached in `config/metros.json`) + forecast ([docs](https://www.weather.gov/documentation/services-web-api)) | nws | time-weather | 3 h | 160 | Open data; User-Agent with contact required |
| Curated: cricket fixtures, festivals, consulates, directory links | curated | cricket, festivals, visa, links tiles | Each run | 0 | Original content in repo |
| Pending review: The Hindu, NDTV, Times of India, NPR, BBC, Dawn, The Daily Star, Kathmandu Post, Daily Mirror, Hacker News, CricketData | rss / provider | news, cricket, tech, movies | 30–60 min | 0 until approved | `draft`, disabled |

Total at launch: about 270 upstream calls a day, regardless of visitor count.

### 5.7 Freshness and retention

- **Fresh** until 3× the source's interval since last success; then **stale** ("May be out of date"). After 48 hours without success the source's rows are dropped and the tile shows fallback links.
- Headline rows older than 7 days (by `publishedAt`, else `firstSeenAt`) are dropped, or sooner if the source's `maxRetentionHours` says so.
- Rows with `expiresAt` (fixtures, festivals, forecasts) disappear at that time, in the engine and again in the browser.
- A 304 response confirms the source but never resets a row's age.
- No collected publisher content is ever committed to git or stored outside the deployed bundle.

### 5.8 Purge procedure (rights revoked)

1. Set the source to `revoked` and `enabled: false`; commit.
2. Run the engine with `force=true`; the new bundle contains no rows from that source.
3. Delete older Worker versions that contain the rows, if the rights holder requires it.
4. Purge the Cloudflare cache for `/data/*` and confirm the rows are gone from the live site.

## 6. Low-level design

Names, paths and contracts in this section are binding. Changing one requires updating this document and `docs/DECISIONS.md`.

### 6.1 Repository layout

```
desi-desktop/
  CLAUDE.md                     # Claude Code instructions (section 8.1)
  docs/SPEC.md  docs/DECISIONS.md  docs/RUNBOOK.md
  shared/                       # TypeScript contracts used by app and engine
    contracts.ts                # Zod schemas + inferred types (6.2)
  app/                          # Vite root (browser only)
    index.html  help/index.html  about/index.html  privacy/index.html
    src/main.ts  prefs.ts  data.ts  grid.ts  tile.ts  filter.ts  customize.ts
        help.ts  search.ts  clocks.ts  prayer.ts  nearme.ts  guards.ts  icons.ts
    src/styles/app.css
    public/manifest.webmanifest  public/icons/  public/_headers
  engine/                       # Node only, never bundled into app
    run.ts  registry.ts  scheduler.ts  http.ts  normalize.ts  relevance.ts
    dedupe.ts  assemble.ts  publish.ts  health.ts  alert.ts
    adapters/rss.ts  atom.ts  federal-register.ts  fx.ts  nws.ts  visa-bulletin.ts  curated.ts  cricketdata.ts
  config/catalog.json  sources.json  metros.json
  content/curated/cricket-fixtures.json  festivals.json  consulates.json  links/*.json
  watchdog/src/index.ts  watchdog/wrangler.jsonc
  tests/unit/  tests/engine/  tests/fixtures/  tests/e2e/
  wrangler.jsonc                # site Worker, assets-only
  .github/workflows/ci.yml  refresh.yml  .github/dependabot.yml
  .nvmrc  package.json  package-lock.json  tsconfig.json  vite.config.ts
```

### 6.2 Data contracts (`shared/contracts.ts`)

```ts
export type TileId = 'shortcuts' | 'india-news' | 'us-news' | 'cricket' | 'visa' | 'currency'
  | 'south-asia' | 'time-weather' | 'festivals' | 'movies' | 'tech' | 'deals' | 'near-me' | 'prayer' | 'jobs';
export type TileMode = 'live' | 'curated' | 'links' | 'local';

export interface Item {
  id: string;                 // 16 hex chars
  title: string;              // plain text, 1-180 chars
  url: string;                // https, <= 2048 chars
  sourceId: string;
  publishedAt: string | null; // ISO 8601 UTC from the source, never fetch time
  firstSeenAt: string;
  expiresAt: string | null;
  value?: string;             // metrics, e.g. "90.42"
  change?: number;            // percent, metrics only
  startsAt?: string;          // fixtures, festivals
}

export interface TileData {
  mode: TileMode;
  title: string;              // e.g. "India Updates" while official-only
  state: 'fresh' | 'partial' | 'stale' | 'links' | 'empty';
  items: Item[];              // <= 20
  fallbackLinks: { title: string; url: string }[];
}

export interface ContentBundle {
  schemaVersion: 2;
  generatedAt: string;
  contentHash: string;
  tiles: Partial<Record<TileId, TileData>>;
  weather: Record<string /* metroId */, { periods: { name: string; tempF: number; summary: string; startsAt: string; endsAt: string }[]; issuedAt: string; url: string }>;
}

export interface SourceHealth {
  id: string; state: 'ok' | 'stale' | 'failing' | 'disabled';
  lastAttemptAt: string | null; lastSuccessAt: string | null;
  consecutiveFailures: number; etag: string | null; lastModified: string | null;
  staleAfterMinutes: number; errorCode: string | null; // sanitized code only
}

export interface Preferences {
  version: 1;
  tiles: TileId[];            // shown tiles, in order; [] is a valid choice
  metroId: string | null;
  columns: 3 | 4;
  shortcuts: { id: string; title: string; url: string }[]; // <= 12
  tipDismissed: boolean;
}
```

Public files under `/data/`: `content.json` (bundle), `health.json` (`{ generatedAt, sources: SourceHealth[] }`), `meta.json` (`{ generatedAt, engineVersion, commit }`), `sources.json` (id, publisher, attribution, termsUrl, mode; for the About page). The browser rejects any bundle whose `schemaVersion` it does not know and keeps showing fallback content.

### 6.3 Filter (`app/src/filter.ts`)

```ts
const norm = (s: string) => s.normalize('NFKC').toLowerCase();
export const terms = (q: string) => norm(q.trim()).split(/\s+/).filter(Boolean);
const hasAll = (text: string, ts: string[]) => { const t = norm(text); return ts.every(w => t.includes(w)); };

export interface FilterResult { tileId: TileId; headingMatch: boolean; items: Item[] }

/** Pure. Tiles in display order; returns only tiles to show. */
export function filterDashboard(tiles: { id: TileId; title: string; items: Item[] }[], query: string): FilterResult[] {
  const ts = terms(query);
  if (ts.length === 0) return tiles.map(t => ({ tileId: t.id, headingMatch: false, items: t.items }));
  return tiles.flatMap(t => {
    const items = t.items.filter(i => hasAll(i.title, ts));
    const headingMatch = hasAll(t.title, ts);
    return items.length || headingMatch ? [{ tileId: t.id, headingMatch, items }] : [];
  });
}
```

The renderer shows up to 10 matching rows per tile with "Show more" for the rest, highlights matches with `<mark>` elements created by DOM APIs, and announces "N items in M tiles" through an `aria-live="polite"` region. Input is debounced 80 ms.

### 6.4 Preferences (`app/src/prefs.ts`)

- Key `desiDesktop:prefs:v1`. All reads and writes inside `try/catch`.
- `load()`: parse; on error, missing or future `version`, return `defaults()`. Drop unknown and duplicate tile ids; drop shortcuts with non-http(s) URLs. An empty `tiles` array is respected.
- `save()`: on failure keep the in-memory copy and show "Changes are saved for this visit."
- `defaults()`: the nine default tiles in catalog order, `metroId: null`, `columns: 3`, five starter shortcuts, `tipDismissed: false`.
- Only `prefs.ts` touches `localStorage`.

### 6.5 Local tiles

- **Family Time:** user's local time plus Asia/Kolkata, Asia/Karachi, Asia/Dhaka, Asia/Kathmandu, Asia/Colombo via `Intl.DateTimeFormat`; updates each minute while the page is visible. Weather rows come from `content.weather[metroId]`; with no metro, the tile shows "Choose your area in Customize".
- **Prayer Times:** `adhan` with the metro's coordinates and time zone; method selectable (default ISNA). Highlights the next prayer.
- **Desi Near Me:** 10 fixed searches, each `https://www.google.com/maps/search/<query>+<metro name>`.
- `config/metros.json`: 20 metros with large Desi populations (New York, Bay Area, Chicago, Dallas–Fort Worth, Houston, Washington DC, Atlanta, Seattle, Los Angeles, Boston, New Jersey Central, Philadelphia, Detroit, Austin, Phoenix, Charlotte, Raleigh, Minneapolis, Denver, Orlando), each with name, lat, lon, time zone and cached NWS grid id.

### 6.6 UI specification

| Token | Light | Dark |
| --- | --- | --- |
| `--bg` | #f5f5f7 | #000000 |
| `--card` | #ffffff | #1c1c1e |
| `--ink` | #1d1d1f | #f5f5f7 |
| `--muted` | #6e6e73 | #a1a1a6 |
| `--line` | #e5e5ea | #2c2c2e |
| `--accent` | #0071e3 | #2997ff |

- **Type:** system stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`), body 16 px, tile title 17 px semibold, rows 15 px, meta 13 px. Spacing on an 8 px grid; cards 18 px radius; max content width 1120 px.
- **Top bar** (52 px, translucent): wordmark left; Customize and Help right. Nothing else.
- **Hero:** greeting by time of day, date in muted text, search pill 56 px tall and up to 680 px wide with the accent Search button.
- **Below search:** one line with the filter box; first-visit tip only until dismissed.
- **Tile:** icon, title, mode label in muted text ("Updated 25 min ago", "Useful links — not a live feed", or nothing for local), × on hover (always on touch), 5 rows with hairline separators, Show more.
- **Footer:** About & Sources · Privacy · Help, 13 px muted.
- **States:** grey skeleton bars while loading (no spinners); "May be out of date"; "Nothing to show right now"; links mode. Panels animate 200–300 ms; no animation with reduced motion.
- **Icons:** monochrome inline SVG, 18 px. No emoji, images or web fonts.
- **Without JavaScript:** search form, Help, About and the curated links still work; a note says customization needs JavaScript.

### 6.7 Security and caching headers (`app/public/_headers`)

```
/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action https://www.google.com
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  Permissions-Policy: geolocation=(), camera=(), microphone=()
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/data/*
  Cache-Control: public, max-age=300
```

HTML gets `Cache-Control: no-cache`. Outbound links use `rel="noopener noreferrer"`.

### 6.8 Cloudflare configuration

Site (`wrangler.jsonc`): `{ "name": "desi-desktop", "compatibility_date": "<set at build>", "assets": { "directory": "./dist", "not_found_handling": "404-page" } }` — no `main`, so no script ever runs for visitors.

Watchdog (`watchdog/wrangler.jsonc`): `name: "desi-desktop-watchdog"`, `main: "src/index.ts"`, `triggers.crons: ["23 * * * *"]`, no routes, `workers_dev: false`. Secrets: `GH_TOKEN` (fine-grained, this repo only, Actions read and write), `GH_REPO`, `SITE_URL`.

```ts
export default {
  async scheduled(_e: ScheduledEvent, env: Env) {
    const gh = (path: string, method = 'GET', body?: unknown) => fetch(`https://api.github.com/repos/${env.GH_REPO}${path}`, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'desi-desktop-watchdog' } });
    const wf = await gh('/actions/workflows/refresh.yml').then(r => r.json()).catch(() => null);
    const runs = await gh('/actions/workflows/refresh.yml/runs?per_page=1').then(r => r.json()).catch(() => null);
    const last = runs?.workflow_runs?.[0]?.created_at;
    const ageMin = last ? (Date.now() - Date.parse(last)) / 60000 : Infinity;
    if (wf?.state === 'active' && ageMin < 120) return;
    if (wf?.state !== 'active') await gh('/actions/workflows/refresh.yml/enable', 'PUT');
    await gh('/actions/workflows/refresh.yml/dispatches', 'POST', { ref: 'main' });
  }
};
```

The watchdog asks GitHub directly when the refresh workflow last ran, because the site's data files change only on deploy and cannot show whether the engine is running. If GitHub disabled the workflow (for example after 60 days without repository activity), the watchdog re-enables it.

## 7. Development, test and operations plan

Build in seven milestones; each ends green in CI with its tests named after requirement IDs. The product launches publicly only after a two-week pilot passes its gate.

### 7.1 Milestones

| # | Milestone | Scope | Exit criteria |
| --- | --- | --- | --- |
| M0 | Skeleton | Repo layout (6.1), strict TypeScript, Vite multipage, Vitest, Playwright, CI on pull requests, `CLAUDE.md`, `docs/DECISIONS.md` | `npm run check` passes in CI; empty page builds |
| M1 | App on fixtures | Search, grid, tiles (all four modes), freshness labels, Customize, filter, prefs, Help, About, Privacy, 404, from `tests/fixtures/content.sample.json` (marked development-only) | T-01 to T-08 pass on Chromium, Firefox, WebKit; axe clean; budgets met |
| M2 | Engine core | Registry and rights gate, scheduler, safe HTTP, normalize, relevance, dedupe, assemble, health, bundle writer; curated adapter | T-09 to T-14 pass offline; `npm run content:dry-run` writes a valid bundle from curated content only |
| M3 | Launch adapters | rss, atom, federal-register, visa-bulletin, fx, nws; cricketdata built but disabled | Fixture tests pass for each; a manual live dry-run against the six launch sources produces valid rows |
| M4 | Deploy and automation | Site Worker, `refresh.yml`, change detection, heartbeat, rollback, Issue alerts, watchdog Worker, Dependabot | Staging URL live; 48 hours of unattended refreshes; T-15 to T-19 pass, including a simulated failing source and a disabled workflow being revived |
| M5 | Mobile and polish | Manifest and icons, phone layouts, touch drag, Family Time, Prayer Times, Near Me, dark mode, empty states | T-20 passes; installs on iPhone and Android; manual keyboard and screen-reader walkthrough done |
| M6 | Pilot and launch | Production URL, two-week pilot (7.6), fixes | Pilot gate met; launch checklist (8.3) complete |

### 7.2 Test matrix

| ID | Covers | Scenario and pass condition |
| --- | --- | --- |
| T-01 | FR-01 | Search "India visa & OCI" produces one encoded `q`; blank input stays; works with JS disabled |
| T-02 | FR-02 | 320, 768, 1280, 1440 px and 200% zoom: correct columns, no horizontal scroll, row-major order |
| T-03 | FR-03, FR-04, NFR-HONEST | Fresh, partial, stale, links and empty tiles render their exact labels; a fake clock makes data stale in the browser; expired rows vanish |
| T-04 | FR-05, FR-06 | Add, hide, move up/down, drag, reset with confirm, × removal; all survive reload; reorder disabled while filtering |
| T-05 | FR-07 | "india visa" matches only rows containing both words; words split across two rows or heading + row do not match; matches beyond row 5 shown; title-only match shows "No matching items"; NFKC and mixed case; Escape clears |
| T-06 | FR-08 | Empty, corrupt, future-version and storage-blocked preferences all load defaults; session note shown when saving fails |
| T-07 | FR-09, FR-10 | Shortcut URL validation and 12 limit; metro choice drives weather, prayer and near-me; no geolocation prompt |
| T-08 | FR-11, FR-13, FR-14 | Tip once; Help reachable at all widths; About lists every enabled source; with `/data/*` blocked the page still works |
| T-09 | ENG-02, ENG-09 | Registry rejects enabled unapproved sources; revoked or overdue review removes rows, including fallback rows |
| T-10 | ENG-05 | Normalization: HTML stripped, entities decoded once, tracking parameters removed, invalid dates become null, publishedAt never replaced by fetch time |
| T-11 | ENG-04, NFR-SEC | Malformed and truncated XML, DTD and external entities, oversized body, HTML error page, redirect to another host, private IP, credentials in URL: all rejected safely |
| T-12 | ENG-06 | Timeout, 429 with Retry-After, 5xx: one bounded retry; failing source keeps rows only inside freshness limits; healthy tiles unaffected |
| T-13 | ENG-07, ENG-08 | 304 reuses rows without resetting age; health shows per-source state; a successful run with one stale source reports that source stale |
| T-14 | ENG-05, ENG-10 | Deterministic output and hash for identical input; cap of 20; cross-source dedupe by URL only; invalid bundle never written |
| T-15 | ENG-10 | Unchanged content skips deploy except one daily heartbeat; changed content deploys once |
| T-16 | ENG-11 | Disabling a source in config and re-running removes it; manual force respects rights |
| T-17 | ENG-13, NFR-PRIV | No secrets, raw bodies or user data in logs, `/data/*` or the browser bundle |
| T-18 | NFR-MAINT | Failing source opens an Issue after 3 hours and closes it on recovery; bad deploy is rolled back by the smoke test |
| T-19 | Watchdog | A disabled or silent workflow is re-enabled and dispatched; an active, recent workflow is left alone |
| T-20 | NFR-PERF, NFR-A11Y | Bundle and data size budgets; Lighthouse mobile ≥ 90 performance, ≥ 95 accessibility; zero serious axe findings |

Tests use fixtures, an injected clock and an injected `fetch`. No test calls a real publisher. A separate opt-in `npm run content:probe` checks live endpoints and records technical availability only.

### 7.3 Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Vite dev server with fixture data |
| `npm run check` | Typecheck, lint, unit and engine tests |
| `npm run test:e2e` | Playwright + axe on three browsers |
| `npm run build` | Production build into `dist/` with budget check |
| `npm run sources:validate` | Registry and curated content validation |
| `npm run content:dry-run` | Full engine run into `tmp/`, no deploy |
| `npm run content:probe` | Opt-in live endpoint check |
| `npm run smoke -- --url <url>` | Smoke test a deployed site |

### 7.4 Workflows

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yml` | Pull request, push to `main` | `npm ci`, check, e2e (Chromium on PRs; all three browsers on `main`), build with budgets. On `main`: deploy to staging, smoke, then production. Forks never get secrets. |
| `refresh.yml` | Cron `*/30 * * * *`, manual (with optional `force`), watchdog | Engine run → bundle → change check → build → deploy → smoke → alerts. Concurrency `publish`, no cancel, 10-minute timeout, least-privilege permissions. |
| Dependabot | Weekly | npm and Actions updates; dev-only patch updates auto-merge after green CI; everything else waits for the owner. |

Secrets: `CLOUDFLARE_API_TOKEN` (Workers deploy only, this account), `CLOUDFLARE_ACCOUNT_ID`, `OWNER_CONTACT_EMAIL` (for the User-Agent). Later: `CRICKETDATA_KEY`. Watchdog secrets live in Cloudflare, not GitHub.

### 7.5 Running itself

| Event | Automatic response | Owner hears |
| --- | --- | --- |
| One source fails | Keeps rows within freshness limits, then links; other tiles unaffected | Issue after 3 hours; auto-closed on recovery |
| Scheduler delayed, stopped or disabled | Watchdog re-enables and dispatches within an hour | Only if the watchdog itself fails (workflow email) |
| Bad deploy | Smoke test fails, `wrangler rollback` to previous version | Issue with the failing check |
| Invalid bundle | Not deployed; production untouched | Workflow failure email |
| Free-tier change or quota pressure | Health and smoke checks fail visibly | Issue; act per 4.5 |
| Rights revoked | Owner runs the purge procedure (5.8) | n/a |
| Curated content runs out (fixtures, festivals) | Expired rows drop; tile shows links | Monthly Issue "Curated content check" from `refresh.yml` on the 1st |

**Owner routine:** monthly 15 minutes (close the curated-content Issue after adding fixtures and festivals, glance at `health.json`, review pending Dependabot PRs); yearly review of each approved source's terms (reviews expire after 12 months by default).

### 7.6 Pilot (from Spec B)

Run two weeks with 12–20 consenting US Desi users, at least five outside tech and at least three non-Indian. Collect only an exit survey: which tiles they used on several days, which they hid, and whether they set it as a start page. No query or behavior logging. **Gate:** at least one third used it on three or more distinct days in week two and can name a recurring use. If the gate fails, improve existing tiles before adding new ones.

## 8. Claude Code handoff

Put this document at `docs/SPEC.md`, the block in 8.1 at the repo root as `CLAUDE.md`, then start Claude Code with the prompt in 8.2. Claude Code builds one milestone per session and stops at every point that needs the owner.

### 8.1 `CLAUDE.md`

```markdown
# Desi Desktop — instructions for Claude Code

Spec: docs/SPEC.md is the source of truth. Decisions: docs/DECISIONS.md (append, never rewrite).

## Hard rules
- $0 only. Never create paid resources, enter payment details, or enable a paid plan.
- Never enable a source unless config/sources.json shows rights.status "approved" recorded by the owner.
- Never scrape, never copy article text or images, never generate or summarize headlines with AI.
- Never commit collected publisher content, secrets, or .env files.
- Browser code: vanilla TypeScript, no framework, no third-party scripts, no innerHTML with external text.
- Engine code never imports from app/; app code never imports from engine/. Shared types live in shared/.
- Tests never call real publishers; use fixtures, injected clock and injected fetch.

## Workflow
- Work one milestone (spec 7.1) at a time on a branch; open a PR; CI must be green before merge.
- Name every test after the requirement or test ID it proves, e.g. "T-05 FR-07 filter ignores words split across rows".
- Run `npm run check` and `npm run test:e2e` before saying anything works.
- When the spec is impossible or ambiguous, choose the option closest to its principles (spec section 0), record it in docs/DECISIONS.md with date and reason, and continue.

## Stop and ask the owner before
- Creating or changing any Cloudflare or GitHub account setting, token or secret.
- First deploy to staging and every first deploy to production.
- Changing any source's rights fields.
- Adding a runtime dependency.

## Reporting
Report only what was actually run: commands, pass/fail counts, bundle sizes, deployed URLs. Say "not deployed" or "links only" plainly when true.
```

### 8.2 Kickoff prompt

```markdown
Read CLAUDE.md and docs/SPEC.md fully. Then:
1. Summarize the milestones (spec 7.1) and list any questions that block M0 or M1.
2. Implement M0, open a PR, and report CI results.
3. Continue milestone by milestone. At each milestone end, report: what was built, which T-IDs pass, budgets measured, and what needs the owner.
4. Before M4, give me the exact owner setup steps (spec 8.3) you need completed.
```

### 8.3 Owner setup and launch checklist

- [ ] Create a public GitHub repo `desi-desktop`; enable Issues and workflow-failure email notifications.
- [ ] Create a free Cloudflare account; create a Workers deploy token scoped to that account; add it and the account ID as GitHub secrets.
- [ ] Choose a contact email for the bot User-Agent and the Contact page.
- [ ] Create a fine-grained GitHub token (this repo only, Actions read and write) and add it to the watchdog Worker's secrets.
- [ ] Record a rights review in `config/sources.json` for each launch source: PIB, Federal Register, USCIS, State Department Visa Bulletin, Frankfurter, NWS.
- [ ] Approve the first staging deploy, then the first production deploy.
- [ ] Run the pilot (7.6) and confirm its gate.
- [ ] Optional: attach an already-owned domain in Cloudflare and verify HTTPS.

### 8.4 Open items for the owner

- [ ] Which publisher feeds to review first for India News, US News and South Asia News (each needs a terms review before it can switch on).
- [ ] Whether to pursue CricketData rights for live scores.
- [ ] When the KanjoosLala deals feed will be ready (its schema: title, retailer, USD price, checkedAt, expiresAt, url, affiliate flag).
- [ ] Monetization later: Google Programmable Search with AdSense, labeled affiliate deals, remittance referrals. Nothing in v1 blocks any of these.

### 8.5 Sources

- Research: [Pew — Asians in the US](https://www.pewresearch.org/short-reads/2025/05/01/key-facts-about-asians-in-the-us/) · [Pew — Pakistanis in the US](https://www.pewresearch.org/race-and-ethnicity/fact-sheet/asian-americans-pakistanis-in-the-u-s/) · [Pew — Indian Americans snapshot](https://www.pewresearch.org/race-and-ethnicity/2024/08/06/indian-americans-a-survey-data-snapshot/) · [Pew — local news topics](https://www.pewresearch.org/journalism/2024/05/07/local-news-topics/) · [Carnegie 2024 IAAS](https://carnegieendowment.org/research/2025/06/indian-americans-social-survey-data) · [Google India Year in Search 2025](https://blog.google/intl/en-in/products/explore-communicate/indias-year-in-search-2025-the-a-to-z-of-trending-searches/) · [ICC US attendance](https://www.icc-cricket.com/media-releases/icc-men-s-t20-world-cup-draws-unprecedented-interest-for-cricket-in-the-united-states) · [RBI remittance survey](https://www.rbi.org.in/scripts/BS_ViewBulletin.aspx?Id=23260) · [World Bank 2025 remittances via Policy Edge](https://www.policyedge.in/p/india-remains-worlds-largest-remittance-recipient-with-us1507-billion-in-2025)
- Sources and APIs: [PIB RSS](https://www.pib.gov.in/ViewRss.aspx?lang=1&reg=1) · [PIB copyright policy](https://www.pib.gov.in/content/186_2_Copyright-Policy.aspx?lang=1&reg=5) · [USCIS news RSS](https://www.uscis.gov/news/rss-feed/59144) · [Visa Bulletin](https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html) · [NWS API](https://www.weather.gov/documentation/services-web-api) · [Frankfurter](https://frankfurter.dev/) · [CricketData pricing](https://cricketdata.org/pricing/)
- Platform: [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) · [Static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) · [GitHub Actions billing](https://docs.github.com/en/actions/reference/usage-limits-billing-and-administration) · [WCAG 2.2](https://www.w3.org/TR/WCAG22/) · [Core Web Vitals](https://web.dev/articles/vitals)
