import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// CLAUDE.md: engine code never imports from app/; app code never imports from engine/.
// ESLint enforces this while editing; this test is the backstop that CI always runs.

const ROOT = resolve(import.meta.dirname, '..', '..');
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

function tsFiles(dir: string): string[] {
  const abs = join(ROOT, dir);
  return readdirSync(abs, { recursive: true, encoding: 'utf8' })
    .map((f) => join(abs, f))
    .filter((f) => /\.(ts|tsx|js|mjs)$/.test(f) && statSync(f).isFile());
}

function importsInto(fromDir: string, forbiddenDir: string): string[] {
  const forbidden = join(ROOT, forbiddenDir) + sep;
  const hits: string[] = [];
  for (const file of tsFiles(fromDir)) {
    for (const m of readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3] ?? '';
      if (!spec.startsWith('.')) continue;
      const target = resolve(dirname(file), spec);
      if ((target + sep).startsWith(forbidden)) hits.push(`${relative(ROOT, file)} -> ${spec}`);
    }
  }
  return hits;
}

describe('CLAUDE.md module boundaries', () => {
  it('CLAUDE.md boundary: app code never imports from engine/', () => {
    expect(importsInto('app', 'engine')).toEqual([]);
  });

  it('CLAUDE.md boundary: engine code never imports from app/', () => {
    expect(importsInto('engine', 'app')).toEqual([]);
  });

  it('CLAUDE.md boundary: shared/ imports neither app/ nor engine/', () => {
    expect([...importsInto('shared', 'app'), ...importsInto('shared', 'engine')]).toEqual([]);
  });

  it('D38 boundary: the watchdog Worker is self-contained (no app/, engine/ or shared/ code)', () => {
    expect([...importsInto('watchdog', 'app'), ...importsInto('watchdog', 'engine'), ...importsInto('watchdog', 'shared')]).toEqual([]);
  });
});
