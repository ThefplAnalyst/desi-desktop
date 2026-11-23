// `npm run build:local`: copies the DEVELOPMENT-ONLY sample data into a local preview build,
// with timestamps shifted so it looks 25 minutes old. Never used for staging or production.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { shiftTimes } from './vite-plugins.ts';

const out = process.argv[2];
if (!out || out === 'dist') {
  console.error('Usage: node scripts/local-data.ts <local-build-folder> (never dist/)');
  process.exit(1);
}

const read = (name: string) => JSON.parse(readFileSync(join('tests', 'fixtures', `${name}.sample.json`), 'utf8')) as unknown;
const content = read('content') as { generatedAt: string };
const delta = Date.now() - 25 * 60_000 - Date.parse(content.generatedAt);

mkdirSync(join(out, 'data'), { recursive: true });
for (const name of ['content', 'health', 'sources']) {
  writeFileSync(join(out, 'data', `${name}.json`), JSON.stringify(shiftTimes(read(name), delta)));
}
console.log(`Local preview ready in ${out}/ with sample data (dev fixtures).`);
console.log('Open http://localhost:8000/desidesktop/local/');
