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
