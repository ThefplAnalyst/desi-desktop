# Desi Desktop — Decision log

Append new decisions at the bottom. Never edit or delete past entries; if a decision changes, add a new entry that supersedes the old one by ID.

Format for new entries:

```
## D<number> — <short title> (<YYYY-MM-DD>)
- Context: what forced the decision
- Decision: what was chosen
- Alternatives: what was rejected
- Reason: why
- Decided by: Owner | Architect | Claude Code
- Supersedes: D<number> (if any)
```

---

## Baseline decisions (2026-11-23, from docs/SPEC.md section 1)

Inputs: Spec A (30-min refresh, 9 tiles, vanilla JS), Spec B (rights-first, TypeScript + Vite, pilot gate), Spec C (v1.2 engine: rights lifecycle, hardened networking).

| ID | Topic | Decision | Decided by | Reason |
|---|---|---|---|---|
| D1 | Audience | All US Desis (Indian, Pakistani, Bangladeshi, Nepali, Sri Lankan), national content only; no city edition in v1 | Owner | Widest useful audience; no weekly local curation |
| D2 | Content rights | Hybrid: official/open sources live at launch; publisher feeds enabled one by one after recorded owner review; Spec C rights lifecycle | Owner | Real content at launch without legal risk |
| D3 | Refresh | Engine wakes every 30 min; each source has its own minimum interval | Owner + Architect | Fresh where sources allow; polite to slow sources |
| D4 | Repo | Public GitHub repo; no collected publisher content ever committed | Owner (via D3) | 30-min runs exceed private free Actions minutes |
| D5 | Frontend | Vanilla TypeScript + Vite; no framework | Architect | Shared types with engine; small, fast bundle |
| D6 | Validation | Zod in engine (source of truth); small hand-written guards in browser | Architect | One contract source; browser JS stays under budget |
| D7 | Hosting | Cloudflare Workers Static Assets, assets-only site Worker | Architect | Unlimited free static requests; no Pages build quota |
| D8 | Stalled scheduler | Separate cron-only watchdog Worker checks GitHub API hourly; re-enables and dispatches refresh workflow if disabled or silent > 2 h | Architect | Closes the gap Specs B and C left to the owner |
| D9 | Keepalive | No fake heartbeat commits; watchdog re-enables workflows instead | Architect | Same effect, clean history |
| D10 | Default tiles | 9 tiles (3×3), all with honest day-one content: Shortcuts, India News, US News, Cricket, Visa & Immigration, Currency, South Asia News, Family Time & Weather, Festivals & Holidays | Architect | Full grid, nothing empty or fake |
| D11 | Rows per tile | Collect up to 20; show 5; Show more to 10 | Specs B + C | Calm by default; filter still finds older rows |
| D12 | Grid | 3 / 2 / 1 columns responsive; optional 4 columns at ≥ 1280 px | Architect | Owner's original 4×N request, calm default |
| D13 | Filter scope | AND of all words within one heading or one row title; non-matching rows hidden | Specs B + C | Predictable; no cross-field matches |
| D14 | Setup code (cross-device copy) | Deferred to Later | Architect | Not needed to launch |
| D15 | PWA | Manifest + icons at launch; offline service worker v1.1 | Architect | Home-screen install now; avoid cache bugs at launch |
| D16 | Freshness | Stale after 3× source interval; reuse last good max 48 h; drop headlines older than 7 days or license limit | Architect | Honest at any refresh rate |
| D17 | Network safety | Spec B + C controls (HTTPS, exact-host allowlist, redirect checks, private-IP block, size/time caps, no DTD) without DNS pinning | Architect | Allowlisted hosts on short-lived CI runners cover the risk |
| D18 | Deploy cadence | Deploy only when visible content changes, plus one daily heartbeat | Spec C | Saves deploys; truthful health timestamps |
| D19 | Alerts | GitHub Issues per failing source (auto-close) + workflow failure emails | Architect | Tracking plus crash coverage |
| D20 | Dependency updates | Dependabot weekly; auto-merge dev-only patches after green CI; runtime and Actions updates need owner; Actions pinned by SHA | Architect | Safety without monthly toil |
| D21 | Cricket | Curated fixtures + official links at launch; CricketData adapter built but disabled until rights confirmed | Spec B | Honest now, live later |
| D22 | Weather | Engine fetches NWS for 20 fixed Desi metro areas; user picks one; no per-visitor calls | Spec C | National coverage, no visitor-driven API calls |

---

## Decisions made during build

<!-- Claude Code: add new entries below using the format at the top of this file. -->

## D23 — Node version (2026-11-23)
- Context: Spec 4.3 says to pin the active Node LTS; the dev machine had Node 22.19 (maintenance LTS).
- Decision: Pin Node 24 LTS in .nvmrc and CI; owner installs Node 24 locally.
- Alternatives: Pin Node 22 to match the machine.
- Reason: Matches the spec; 24 is the active LTS in Nov 2026.
- Decided by: Owner

## D24 — Pre-approved runtime dependencies (2026-11-23)
- Context: CLAUDE.md requires owner approval for each runtime dependency.
- Decision: zod and fast-xml-parser (engine) and adhan (browser) are approved because the spec names them. Any other runtime dependency still needs the owner. Dev-only tooling does not need approval.
- Alternatives: Ask separately for each dependency.
- Reason: Already part of the agreed spec.
- Decided by: Owner

## D25 — Curated content authorship (2026-11-23)
- Context: M2 needs cricket fixtures, festivals and consulate links; wrong dates break the Honest principle.
- Decision: Claude Code drafts curated content from official sources, cites a source for each entry and marks the files unverified; the owner verifies before the first staging deploy.
- Alternatives: Owner writes all curated content.
- Reason: Faster start, with a human check before anything is public.
- Decided by: Owner

## D26 — Repository and PR flow (2026-11-23)
- Context: The project folder had no git repo, and the GitHub CLI was not installed.
- Decision: The owner creates the public GitHub repo `desi-desktop` and installs and logs in to `gh`; Claude Code then pushes milestone branches and opens PRs.
- Alternatives: Local git only until later; Claude Code creates the repo through gh.
- Reason: Creating account resources is the owner's job (CLAUDE.md).
- Decided by: Owner

## D27 — Node version correction (2026-11-23)
- Context: D23 pinned Node 24 on the belief it was the active LTS. In Nov 2026 the active LTS is Node 26 (winget OpenJS.NodeJS.LTS = 26.13.1); Node 24 is in maintenance.
- Decision: Pin Node 26 LTS (26.13.1 at setup) in .nvmrc and CI. Installed on the dev machine, replacing Node 22.
- Alternatives: Keep Node 24 per D23.
- Reason: Spec 4.3 asks for the active LTS; owner installed Node 26.
- Decided by: Owner
- Supersedes: D23

## D28 — M0 tooling choices (2026-11-23)
- Context: The spec names the stack (6.1, 4.3) but leaves some tooling details open.
- Decision:
  - Lint with ESLint 10 + typescript-eslint (strict). Lint rules enforce the CLAUDE.md app/engine/shared import boundaries and ban innerHTML/outerHTML/insertAdjacentHTML/document.write/eval in app code (NFR-SEC). A Vitest test re-checks the boundaries.
  - Two TypeScript configs: root `tsconfig.json` (engine, shared, tests, scripts; Node types) and `app/tsconfig.json` (browser; no Node types).
  - Node-side TypeScript (engine, scripts) runs with Node 26's built-in type stripping, so no tsx or ts-node dependency. Code therefore uses erasable syntax only (`erasableSyntaxOnly`).
  - The budget check lives in `scripts/check-budgets.ts` (a folder not listed in spec 6.1) and runs as part of `npm run build`.
  - `shared/contracts.ts` holds the spec 6.2 types only for now; Zod schemas are added in M2 when the engine first validates. The app imports types only, so Zod never enters the browser bundle.
  - Vite 8 `build.rolldownOptions` (the new name for `rollupOptions`); module-preload polyfill off.
- Alternatives: Biome instead of ESLint; tsx to run TypeScript; one shared tsconfig.
- Reason: Fewest dependencies, mechanical enforcement of hard rules, and the app can't use Node APIs by accident.
- Decided by: Claude Code

## D29 — Accessible link colour (2026-11-23)
- Context: Spec 6.6 accent #0071e3 as text on --bg #f5f5f7 is 4.31:1, below the 4.5:1 that NFR-A11Y requires (found by axe).
- Decision: Add token `--link` (#0066cc light, #2997ff dark) for links and text buttons; keep `--accent` #0071e3 for filled buttons, icons and focus rings (white on #0071e3 is 4.7:1).
- Alternatives: Darken --accent everywhere; ignore the failure.
- Reason: Accessibility (NFR-A11Y) outranks an exact colour match; the look stays the same blue.
- Decided by: Claude Code
- Supersedes: spec 6.6 accent usage for text only

## D30 — M1 app choices (2026-11-23)
- Context: Spec details left open while building the app on fixtures.
- Decision:
  - Labels: partial tiles read "Updated N min ago · Some sources unavailable"; curated tiles have no header label and a footer "Curated by Desi Desktop"; stale reads "May be out of date"; links read "Useful links — not a live feed"; missing data reads "Nothing to show right now".
  - Freshness in the browser: a tile's "Updated" age is its oldest source's last success; any stale source makes the tile stale; rows from a source with no success in 48 h are dropped (tile falls back to links); headline rows older than 7 days are dropped.
  - Family Time shows six clocks as a compact block above the weather rows (clocks are not filterable rows), so the forecast is visible without "Show more".
  - Prayer Times is hidden from the catalog until M5 (needs `adhan`); Deals stays hidden until its feed exists.
  - `config/metros.json` adds a `searchName` per metro (e.g. "Edison, NJ" for New Jersey Central) for Near Me map searches; NWS grid ids are filled in M3.
  - Shared types `PublicSource`, `CatalogEntry`, `Metro` added to `shared/contracts.ts` (additions only; spec 6.2 names unchanged).
  - About & Sources is generated at build time from `config/sources.json` (enabled + approved only), so it works without JavaScript; until the registry exists (M2) it says "No sources are switched on yet."
  - Contact is GitHub Issues on the public repo, so no personal email is published.
  - Curated links in the no-JavaScript page arrive with curated content in M2.
  - Shortcut editing lives in the Customize panel; Reset uses an inline confirm, not a browser pop-up (NFR-UI).
  - Sample data (`tests/fixtures/*.sample.json`) uses placeholder titles marked "(dev fixture)" and example.org links. `npm run dev` serves it with timestamps shifted to look 25 minutes old; e2e tests serve it through Playwright routes with a fixed clock. It is never part of a build.
  - E2E: synthetic drag-and-drop is skipped on Firefox (Playwright crashes); WebKit's skip-link check focuses the link directly because WebKit leaves links out of the Tab order by default.
- Reason: Closest to the spec's principles (honest, simple, calm) with full test coverage.
- Decided by: Claude Code

## D31 — Firefox axe scan of the filtered page (2026-11-23)
- Context: On `main` CI (Linux) and locally, Playwright's Firefox crashed ("Page crashed") in ~30% of runs when axe scanned the grid after the filter re-rendered it. Probes ruled out the `:has()` selector, `<mark>` highlights, the live-region text and input values; home and Customize scans never crashed, and the filter tests (T-05) pass on Firefox without axe. The app logs no errors.
- Decision: Skip only the filtered-page axe scan on Firefox; it still runs on Chromium and WebKit. Firefox keeps every other axe scan and all filter tests. Also replaced `main:has(.grid.cols-4)` with a `.wide` class set by script (simpler, wider support).
- Alternatives: Retry until green (hides a real failure); drop Firefox axe entirely.
- Reason: Keep CI honest and green without losing coverage of the page itself.
- Decided by: Claude Code

## D32 — Local preview on the owner's web server (2026-11-23)
- Context: The owner tests on a local Python web server whose document root contains this project, at http://localhost:8000/desidesktop/.
- Decision: `npm run build:local` builds into git-ignored `local/` with Vite base `/desidesktop/local/` and copies the development-only sample data (timestamps shifted to look 25 minutes old) into `local/data/`. Internal links are relative and data fetches use `import.meta.env.BASE_URL`, so one codebase works at the site root (production) and under a subfolder. The 404 page keeps absolute links because the host serves it at any depth.
- Alternatives: Build into the project root (clutters the repo); only `npm run dev`.
- Reason: Lets the owner test in their own browser with no extra setup; production output is unchanged.
- Decided by: Claude Code

## D33 — M2 engine choices (2026-11-23)
- Context: Details the spec leaves open while building the engine core.
- Decision:
  - Registry (`config/sources.json`) holds the 8 launch sources, all `enabled: false`, `rights.status: "draft"`; the owner records each review. PIB and Frankfurter endpoints are `null` until verified in M3. Publisher feeds pending review are added in M3, once their endpoints are verified.
  - Link directories live in `content/curated/consulates.json` and `content/curated/links/<tile>.json`. They are hand-picked links, not publisher content, so tiles show them whatever a source's rights status (spec: "until then its tile shows honest Useful links"). Each URL was checked once on 2026-11-23; sites that block bots (403) are noted in the file.
  - Every curated file has `review.status`; the curated adapter refuses "unverified" files (health error `curated-unverified`). `--preview-curated` (used by `npm run content:dry-run`) lets a dev preview include unapproved curated sources and unverified files; such bundles carry `meta.preview: true` and M4 deploys will refuse them.
  - `festivals.json` is drafted from general knowledge; lunar or regional dates are flagged `estimated` and shown as "(expected)". `cricket-fixtures.json` is empty until the owner adds fixtures from official schedules.
  - Cross-source dedupe keeps the first row in registry order (the Item contract carries one `sourceId`).
  - Tiles whose rows have `startsAt` (fixtures, festivals) sort soonest first and are not interleaved; news tiles sort newest first and alternate sources.
  - A tile is "stale" when any source contributing rows has no success for 3× its interval (from timestamps, D16), "partial" when a publishable source is failing, else "fresh".
  - `india-news` / `us-news` use the catalog's `officialTitle` ("India Updates" / "US Updates") while every publishable source of the tile is official.
  - T-11 cases that need an XML parser (malformed/truncated XML, DTDs, external entities) are built with the RSS/Atom adapters in M3.
  - Zod 4 schemas live in `shared/contracts.ts` with compile-time proofs that they match the spec 6.2 interfaces; ESLint allows only `import type` from it in app/.
  - `npm run build:local:engine` previews the engine's own bundle on the owner's local server.
- Reason: Honest by default (nothing publishes without owner approval and verification), simple, and fully testable offline.
- Decided by: Claude Code

## D34 — M3 launch adapters and live findings (2026-11-23)
- Context: First real requests to the launch sources (one per source, honest User-Agent naming the public repo as contact; no personal details sent).
- Findings (`npm run content:probe`, technical availability only):
  - USCIS RSS, Federal Register API, NWS (20 metros), Frankfurter v1 and ExchangeRate-API open access answer and parse into valid rows.
  - **PIB** and **travel.state.gov** answer the bot with 403 (CDN bot blocking). We do not disguise the bot as a browser (principle 1, spec 5.5).
  - **Frankfurter** (ECB reference rates) covers only INR of USD→INR/PKR/BDT/NPR/LKR; Frankfurter v2 does not exist.
- Decision:
  - PIB keeps its adapter and endpoint but stays on links; the owner may ask PIB to allow DesiDesktopBot.
  - Visa Bulletin: the adapter builds the current month's link (fiscal-year folder pattern) without a request; the next month's link is omitted because it cannot be checked. Owner clicks the link once to confirm the pattern.
  - Currency: add `exchangerate-api` (draft) covering all five currencies (not a central-bank rate, attribution required, no daily change). The owner approves Frankfurter (INR, official, with change) or ExchangeRate-API (all five), not both.
  - Federal Register: two registry entries — `federal-register` (USCIS, State, DHS, Labor, Treasury → US Updates) and `federal-register-immigration` (USCIS only, no keyword filter → Visa tile). A keyword filter over USCIS+State+DHS kept 0 of 20 real titles.
  - Date-only sources: Federal Register publication dates become 05:00 UTC (midnight US Eastern) and ECB rate dates become 00:00 UTC — the earliest true moment, never the fetch time.
  - RSS pubDate with 2-digit years ("Mon, 23 Nov 26 …", seen at USCIS) is read as 20xx.
  - NWS grid ids for all 20 metros are cached in `config/metros.json` (time zones matched NWS for every metro). The NWS adapter produces the bundle's `weather` map; one failing metro does not hide the others; failed runs reuse previous forecasts within 24 h, dropping ended periods.
  - XML: DTDs/entity declarations refused before parsing, validator rejects malformed/truncated XML, entity processing off (decoded once in normalize.ts), HTML pages rejected.
  - `npm run content:probe` fetches sources whatever their rights status, to verify endpoints and parsers (the "verified" step of spec 5.1). It saves counts and error codes to `tmp/probe.json` only — no titles, rows or bodies — and never publishes.
  - CricketData adapter built and tested; registered as draft and off (D21); not probed (needs a key).
- Reason: Honest identification and rights-first publishing, with each tile still useful at launch.
- Decided by: Claude Code

## D35 — Currency source: Frankfurter (ECB) approved; ExchangeRate-API held (2026-11-23)
- Context: The owner must choose one currency provider (D34). The owner first picked ExchangeRate-API and read its terms. Those terms allow commercial use but say "this license does not permit re-distribution of our data … not in any product or service that offers programmatic or automatic access to exchange rate data". The site publishes its rates in a public `/data/content.json`, so this needs written guidance first.
- Decision: Approve and enable `frankfurter` (ECB euro reference rates via api.frankfurter.dev/v1, INR only). Review recorded by the owner: reviewedAt 2026-11-23, reviewDueAt 2027-11-23. Attribution reads "Rates: European Central Bank, via Frankfurter. For information only." This meets the ECB's condition that rates "appear accurately and the ECB must be cited as the source", and its note that the rates are "for information purposes only". `exchangerate-api` stays draft and disabled. The owner may email support@exchangerate-api.com for written permission. If it is granted, switch to it for all five currencies and disable Frankfurter.
- Alternatives: Approve ExchangeRate-API anyway (rejected: redistribution clause). Use links only (rejected: ECB data is clean and covers the largest audience currency).
- Reason: Rights-first. ECB terms allow free reuse with citation. Frankfurter allows commercial use with no key and no quotas. commercialUse is recorded as true: Frankfurter says so explicitly, and the ECB grants "free use", with conditions that cover even sold documents.
- Follow-up: v1 is deprecated in favour of v2 but "will continue to work". Move to `/v2/providers/ecb/rates` later.
- Decided by: Owner (approval); Claude Code (terms summary, config)

## D36 — US government sources approved (2026-11-23)
- Context: Launch sources in spec 5.6 need a one-time recorded review, even official ones (spec 5.1).
- Decision: The owner approved and enabled `federal-register`, `federal-register-immigration`, `uscis-news`, `visa-bulletin` and `nws`. Basis: US federal government work, public domain (17 U.S.C. 105); headline, link and date only, with the agency credited. reviewedAt 2026-11-23, reviewDueAt 2027-11-23. The owner opened the Visa Bulletin link built for November 2026, which confirms the fiscal-year folder pattern (D34). No bulletin text is stored.
- Alternatives: Keep them on links until a later review (rejected: they are the rights-cleanest sources available).
- Reason: Official, public-domain sources give the Visa, US Updates and Time & Weather tiles real content at launch.
- Decided by: Owner

## D37 — Festivals verified; festival upkeep to become automatic (2026-11-23)
- Context: The owner checked the 18 drafted festival dates and said "Festivals OK". The owner also wants the list to maintain itself: "check every month for changes and update automatically".
- Decision: `content/curated/festivals.json` is marked verified by the owner (2026-11-23). The `festivals` source is approved and enabled (original content), with the review due 2027-11-23. Next step: replace the hand-kept date list with owner-verified **rules**, from which the engine computes the coming 12 months on every run:
  - fixed days (for example 26 Jan);
  - Nth-weekday US federal holidays (OPM rules);
  - solar festivals (Sankranti, Vaisakhi, the April new years);
  - Islamic dates from the built-in Umm al-Qura calendar (`Intl`, no dependency), shown as "(expected)" because South Asian moon sighting can differ by a day;
  - Holi from a computed full-moon date, also "(expected)".
  - A monthly scheduled check opens an Issue only when a rule cannot produce a date or a computed date moves. No AI writes or changes festival content, and no website is scraped.
- Alternatives: A paid holiday API (rejected: $0 rule; most do not cover India and Nepal). Monthly manual edits (rejected: the owner wants no routine chore).
- Reason: Runs itself (principle 5) while staying honest: dates come from rules the owner verified once, and lunar dates are labelled as expected.
- Decided by: Owner (goal, verification); Claude Code (approach)

## D38 — M4 deploy and automation design (2026-11-23)
- Context: M4 (spec 7.1) adds the site Worker, refresh.yml, change detection, heartbeat, rollback, alerts, the watchdog and Dependabot. Some spec details conflict with each other or with the free tiers.
- Decision:
  - **One deploy path.** Only `refresh.yml` deploys. On a green push to `main`, `ci.yml` dispatches `refresh.yml` instead of deploying itself (spec 7.4 said CI deploys). `decideDeploy` also deploys when `meta.commit` differs from the current commit ("code-changed"), so a merge reaches the site even if the dispatch is missed. Result: one concurrency group, one smoke test, one rollback.
  - **Deploy switch.** `DEPLOY_TARGET` in `refresh.yml` is `none`, `staging` or `production`. It ships as `none`, and each first deploy needs the owner's approval (CLAUDE.md), after which Claude Code changes the line in a PR.
  - **Engine health between runs.** The live `/data/health.json` changes only on deploy, so scheduling from it alone would fetch every source every 30 minutes (NWS alone about 960 calls a day instead of 160). Health is also saved to the Actions cache after good runs, and the newer of the two copies is used. Health holds timestamps and validators only, never publisher content, so spec 5.7 ("no collected content stored outside the deployed bundle") still holds.
  - **Conditional requests only with rows in hand.** `If-None-Match` / `If-Modified-Since` are sent only when the previous bundle still has that source's rows, so a 304 can never empty a tile after a skipped or rolled-back deploy.
  - **Rollback.** `wrangler rollback --yes` goes back to the previous version. The smoke test checks pages, the CSP header, the data schema, and that the bundle hash and commit match what was just deployed. It retries for about a minute to allow edge propagation. A deploy failure opens or updates `Deploy failed: <target>`, and the next good deploy closes it.
  - **Alerts.** `Source failing: <id>` opens after 3 hours of failure, estimated from `lastSuccessAt`, the interval and the failure count (health has no "failing since" field, and the contract is unchanged), and closes on recovery. Issue text has ids, error codes and times only.
  - **Watchdog** (`watchdog/`). It is self-contained (lint and a test forbid imports from app/, engine/ and shared/), has no workers.dev URL, and runs cron `23 * * * *`. `GH_REPO` is a plain variable; `GH_TOKEN` is a Worker secret that the owner sets. The spec also listed `SITE_URL`, which is dropped because it is unused.
  - **Tooling.** `wrangler` 4.156.2 is a dev dependency (build-time only, nothing reaches visitors), and Wrangler telemetry is off in CI. Dependabot runs weekly with a 7-day cooldown. Auto-merge covers only patch updates of dev dependencies and needs the "Allow auto-merge" repository setting (an owner step).
  - **Deferred.** The monthly "Curated content check" Issue (spec 7.5) is replaced by the self-maintaining festival rules (D37), which will alert only when a rule needs attention. It will be built with those rules.
- Alternatives: Deploy from both CI and refresh (rejected: two paths race and need two rollbacks). Commit health to git (rejected: noisy history every 30 minutes). Store previous content in the cache (rejected: spec 5.7).
- Reason: Runs itself safely on free tiers (principle 5); every first deploy still waits for the owner.
- Decided by: Claude Code

## D40 — 4 columns by default and compact tiles (2026-11-23)
- Context: After viewing the site locally, the owner said too much space is wasted and asked for 4×N, compact cards and less space between items.
- Decision:
  - **4 columns by default at ≥ 1280 px** (`defaults().columns` is 4). Below 1280 px nothing changes (3 / 2 / 1). "3 columns" stays in Customize, and a saved 3 is kept. This overrides the D12 default ("default stays calm") and FR-02's "optional" wording.
  - **Compact spacing.** The hero and grid gaps are smaller, tile padding is 10/14 px, and title, label and footer margins are tighter.
  - **Rows are 32 px with a mouse or trackpad (`pointer: fine`)**, with 4 px vertical padding, and so are the hide (×) and "more" buttons. Touch screens keep 44 px targets. This narrows NFR-A11Y's 44 px rule to touch input. 32 px still passes WCAG 2.2 AA target size (2.5.8, 24 px minimum).
  - Font sizes are unchanged (spec 6.6).
- Alternatives: A separate "compact" setting (rejected: the owner wants it as the default). Shrinking rows on touch too (rejected: harder to tap on phones).
- Reason: Shows more at a glance on desktop, the main use (a homepage tab), and keeps phones comfortable.
- Decided by: Owner (goal); Claude Code (values)

## D41 — Equal-size tiles; rows that do not fit go behind Show more (2026-11-23)
- Context: The owner asked: "Let every box be same size. Where is data, let them have Show more."
- Decision:
  - **Equal cells.** From 640 px wide, every tile is one fixed-height grid cell (`--tile-h`): 360 px with a mouse or trackpad, 420 px on touch screens. Below 640 px (one column) tiles still size to their content.
  - **Fit, then Show more.** `app/src/fit.ts` runs after each render and on resize. A collapsed tile shows as many of its first 5 rows as fit, and the rest go behind "Show more". FR-03's "5 visible rows" becomes "up to 5".
  - **Expanded or filtered tiles grow by whole cells** until all their rows (up to 10, or all filter matches) fit, so the grid stays even.
  - Headlines are clamped to 2 lines, and the source/age line to 1 line with an ellipsis. The full text stays in the link (screen readers and the filter use it), and the original article has the rest.
- Alternatives: One height for every tile that is as tall as the fullest tile (tried at 464 px; rejected: most tiles were half empty). Scrolling inside tiles (rejected: scroll inside scroll, and hidden rows give no cue).
- Reason: An even grid that is easy to scan, without hiding that more exists (principle 2, honest UI).
- Decided by: Owner (goal); Claude Code (mechanism)

## D42 — Logo, favicon and manifest (2026-11-24)
- Context: The owner asked for a logo and a favicon.
- Decision: An original mark: a lit diya (oil lamp) in white and amber on the accent-blue rounded square. It is drawn as inline SVG next to the wordmark on every page (`aria-hidden`; the link name stays "Desi Desktop"). The favicon is `favicon.svg`, plus a 32 px `favicon.ico` for older browsers. The site also gets the M5 home-screen pieces early: `icons/apple-touch-icon.png` (180), `icons/icon-192.png`, `icons/icon-512.png` and `manifest.webmanifest`. The PNGs were rendered once from the SVG and committed. Spec 6.6's "no images" applies to content tiles; these are site chrome served from 'self', which the CSP already allows.
- Alternatives: A text-only favicon letter (rejected: hard to read at 16 px). A traced or AI-generated image (rejected: an original vector is smaller and clearly ours).
- Reason: Gives the site a recognisable tab and home-screen identity at about 17 KB total, with no third-party assets.
- Decided by: Owner (request); Claude Code (design)

## D44 — Divider between Google search and the tile filter (2026-11-24)
- Context: The owner found the Google search box and the "Filter tiles" box too close together and asked for a horizontal line and a gap.
- Decision: The tools area gets a 1 px hairline above it (`--line`) with 20 px of space below the line and 8 px above it. The filter box keeps its 44 px height (NFR-A11Y touch targets). It already reads as secondary next to the 56 px search pill.
- Reason: Two similar inputs stacked closely invite typing into the wrong one.
- Decided by: Owner (request); Claude Code (values)
