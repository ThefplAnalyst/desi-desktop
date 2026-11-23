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
