// Build-time budget check (NFR-PERF). Runs after `vite build`; exits non-zero if over budget.
//   Home page JS             <= 45 KB gzip
//   Home HTML + CSS + JS + data <= 120 KB gzip
//   /data/content.json       <= 150 KB uncompressed (checked once the engine writes it, M2)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'dist';
const KB = 1024;
const BUDGET = { homeJsGzip: 45 * KB, homeTotalGzip: 120 * KB, contentRaw: 150 * KB };

const gz = (file: string) => gzipSync(readFileSync(file), { level: 9 }).length;
const kb = (n: number) => `${(n / KB).toFixed(1)} KB`;

const indexPath = join(DIST, 'index.html');
if (!existsSync(indexPath)) {
  console.error('Budget check: dist/index.html not found. Run `vite build` first.');
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');
const assets = [...new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"]+)"/g)].map((m) => m[1] as string))];
const js = assets.filter((a) => a.endsWith('.js'));
const css = assets.filter((a) => a.endsWith('.css'));

const jsGzip = js.reduce((sum, a) => sum + gz(join(DIST, a)), 0);
const cssGzip = css.reduce((sum, a) => sum + gz(join(DIST, a)), 0);
const htmlGzip = gz(indexPath);

const contentPath = join(DIST, 'data', 'content.json');
const hasContent = existsSync(contentPath);
const contentRaw = hasContent ? readFileSync(contentPath).length : 0;
const contentGzip = hasContent ? gz(contentPath) : 0;
const totalGzip = htmlGzip + cssGzip + jsGzip + contentGzip;

const rows: [string, number, number][] = [
  ['Home JS (gzip)', jsGzip, BUDGET.homeJsGzip],
  ['Home HTML+CSS+JS+data (gzip)', totalGzip, BUDGET.homeTotalGzip],
];
if (hasContent) rows.push(['data/content.json (raw)', contentRaw, BUDGET.contentRaw]);

let failed = false;
console.log('Budgets (NFR-PERF):');
for (const [name, actual, limit] of rows) {
  const ok = actual <= limit;
  failed ||= !ok;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(30)} ${kb(actual).padStart(9)} / ${kb(limit)}`);
}
console.log(`  (html ${kb(htmlGzip)}, css ${kb(cssGzip)}, js ${kb(jsGzip)} in ${js.length} file(s)${hasContent ? `, data ${kb(contentGzip)}` : ', no data bundle yet'})`);

if (failed) process.exit(1);
