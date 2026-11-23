// Local preview data for http://localhost:8000/desidesktop/local/ (decision D32). Never used for
// staging or production.
//   node scripts/local-data.ts local              → DEVELOPMENT-ONLY sample data (dev fixtures),
//                                                   timestamps shifted to look 25 minutes old
//   node scripts/local-data.ts local tmp/data     → a bundle the engine wrote (npm run content:dry-run)
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { shiftTimes } from './vite-plugins.ts';

const out = process.argv[2];
const from = process.argv[3];
if (!out || out === 'dist') {
  console.error('Usage: node scripts/local-data.ts <local-build-folder> [engine-bundle-folder]  (never dist/)');
  process.exit(1);
}
mkdirSync(join(out, 'data'), { recursive: true });

if (from) {
  for (const name of ['content', 'health', 'sources', 'meta']) copyFileSync(join(from, `${name}.json`), join(out, 'data', `${name}.json`));
  console.log(`Local preview ready in ${out}/ with the engine bundle from ${from}/.`);
} else {
  const read = (name: string) => JSON.parse(readFileSync(join('tests', 'fixtures', `${name}.sample.json`), 'utf8')) as unknown;
  const content = read('content') as { generatedAt: string };
  const delta = Date.now() - 25 * 60_000 - Date.parse(content.generatedAt);
  for (const name of ['content', 'health', 'sources']) writeFileSync(join(out, 'data', `${name}.json`), JSON.stringify(shiftTimes(read(name), delta)));
  console.log(`Local preview ready in ${out}/ with sample data (dev fixtures).`);
}
console.log('Open http://localhost:8000/desidesktop/local/');
