// Command line used by .github/workflows/refresh.yml (and `npm run smoke`). Each step is small and
// prints only ids, hashes, reasons and check names — never bodies, tokens or keyed URLs (ENG-13).
//
//   node engine/ops.ts previous [--site <url>] [--cache tmp/state/health.json] --out tmp/previous
//   node engine/ops.ts decide   --bundle tmp/data --previous tmp/previous [--force]
//   node engine/ops.ts stage    --bundle tmp/data --dist dist
//   node engine/ops.ts smoke    --url <url> [--bundle tmp/data] [--report tmp/smoke.txt]
//   node engine/ops.ts alerts   --bundle tmp/data                       (needs GITHUB_TOKEN, GITHUB_REPOSITORY)
//   node engine/ops.ts deploy-alert --target <name> --result ok|failed [--rolled-back] [--report tmp/smoke.txt]
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MetaFileSchema } from '../shared/contracts.ts';
import { githubIssues, planDeployAlert, planSourceAlerts } from './alert.ts';
import { decideDeploy, fetchLive, newerHealth, readHealthFile, smoke, stageData, type SmokeExpect } from './deploy.ts';
import { readPrevious } from './publish.ts';
import { loadConfig } from './registry.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function need(name: string): string {
  const v = arg(name);
  if (!v) throw new Error(`missing ${name}`);
  return v;
}
/** Sets a step output in GitHub Actions; harmless elsewhere. */
function output(key: string, value: string): void {
  const file = process.env['GITHUB_OUTPUT'];
  if (file) appendFileSync(file, `${key}=${value}\n`);
}
function expectFrom(bundle: string): SmokeExpect {
  const content = JSON.parse(readFileSync(join(bundle, 'content.json'), 'utf8')) as { contentHash: string };
  const meta = MetaFileSchema.parse(JSON.parse(readFileSync(join(bundle, 'meta.json'), 'utf8')));
  return { contentHash: content.contentHash, commit: meta.commit };
}
function github() {
  const token = process.env['GITHUB_TOKEN'];
  const repo = process.env['GITHUB_REPOSITORY'];
  if (!token || !repo) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');
  return githubIssues(repo, token, fetch);
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  switch (cmd) {
    case 'previous': {
      const out = resolve(need('--out'));
      // Without --site (deploys switched off) only the cached health is carried over.
      const site = arg('--site');
      const live = site ? await fetchLive(site, fetch) : { content: null, health: null, meta: null };
      const cacheFile = arg('--cache');
      const health = newerHealth(live.health, cacheFile ? readHealthFile(cacheFile) : null);
      mkdirSync(out, { recursive: true });
      if (live.content) writeFileSync(join(out, 'content.json'), JSON.stringify(live.content));
      if (live.meta) writeFileSync(join(out, 'meta.json'), JSON.stringify(live.meta));
      if (health) writeFileSync(join(out, 'health.json'), JSON.stringify(health));
      console.log(`Previous state: content ${live.content ? 'live' : 'none'}, meta ${live.meta ? 'live' : 'none'}, health ${health ? (health === live.health ? 'live' : 'cached') : 'none'}`);
      return;
    }
    case 'decide': {
      const bundle = need('--bundle');
      const prevDir = need('--previous');
      const expect = expectFrom(bundle);
      const prev = readPrevious(prevDir);
      const metaPath = join(prevDir, 'meta.json');
      const metaParsed = existsSync(metaPath) ? MetaFileSchema.safeParse(JSON.parse(readFileSync(metaPath, 'utf8'))) : null;
      const d = decideDeploy({
        contentHash: expect.contentHash,
        commit: expect.commit,
        live: { content: prev.content, meta: metaParsed?.success ? metaParsed.data : null },
        now: Date.now(),
        force: process.argv.includes('--force'),
      });
      output('deploy', String(d.deploy));
      output('reason', d.reason);
      console.log(`Deploy: ${d.deploy ? 'yes' : 'no'} (${d.reason}); content ${expect.contentHash.slice(0, 12)}…, commit ${expect.commit}`);
      return;
    }
    case 'stage': {
      stageData(need('--bundle'), need('--dist'));
      console.log('Data staged into the built site.');
      return;
    }
    case 'smoke': {
      const bundle = arg('--bundle');
      const problems = await smoke(need('--url'), bundle ? expectFrom(bundle) : null, fetch);
      const report = arg('--report');
      if (report) writeFileSync(report, problems.join('\n'));
      if (problems.length) {
        console.error(`Smoke test FAILED:\n  - ${problems.join('\n  - ')}`);
        process.exitCode = 1;
      } else console.log('Smoke test passed.');
      return;
    }
    case 'alerts': {
      const bundle = need('--bundle');
      const health = JSON.parse(readFileSync(join(bundle, 'health.json'), 'utf8')) as { sources: Parameters<typeof planSourceAlerts>[0] };
      const registry = loadConfig('.').registry;
      const gh = github();
      const actions = planSourceAlerts(health.sources, registry, await gh.listOpen(), Date.now());
      await gh.apply(actions);
      console.log(`Source alerts: ${actions.map((a) => `${a.kind}${'number' in a ? ` #${a.number}` : ` "${a.title}"`}`).join(', ') || 'none'}`);
      return;
    }
    case 'deploy-alert': {
      const target = need('--target');
      const failed = need('--result') === 'failed';
      const report = arg('--report');
      const problems = report && existsSync(report) ? readFileSync(report, 'utf8').split('\n').filter(Boolean) : ['see the workflow log'];
      const gh = github();
      const actions = planDeployAlert(target, failed ? { problems, rolledBack: process.argv.includes('--rolled-back') } : null, await gh.listOpen(), Date.now());
      await gh.apply(actions);
      console.log(`Deploy alert (${target}): ${actions.map((a) => a.kind).join(', ') || 'none'}`);
      return;
    }
    default:
      console.error('Usage: node engine/ops.ts previous|decide|stage|smoke|alerts|deploy-alert …');
      process.exitCode = 1;
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  }
}
