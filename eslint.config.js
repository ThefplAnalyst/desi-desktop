import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const importBan = (dirs, message) => [
  'error',
  { patterns: dirs.map((d) => ({ group: [`**/${d}`, `**/${d}/**`], message })) },
];

// NFR-SEC: external text reaches the DOM only through textContent / DOM APIs.
const htmlSinks = ['innerHTML', 'outerHTML', 'insertAdjacentHTML'].map((property) => ({
  property,
  message: 'Use textContent or DOM APIs; never inject HTML (CLAUDE.md, NFR-SEC).',
}));

export default defineConfig(
  { ignores: ['dist/', 'local/', 'tmp/', 'coverage/', 'playwright-report/', 'test-results/', 'node_modules/'] },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    files: ['app/**/*.ts'],
    languageOptions: { globals: globals.browser },
    rules: {
      // CLAUDE.md: no engine imports. D6: shared/contracts.ts (which loads Zod) only via `import type`.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'zod', message: 'No Zod in the browser (D6). Use guards.ts.' }],
          patterns: [
            { group: ['**/engine', '**/engine/**'], message: 'App code never imports from engine/ (CLAUDE.md). Use shared/.' },
            {
              group: ['**/shared/contracts*'],
              allowTypeImports: true,
              message: 'Import shared/contracts.ts with `import type` only (D6: keeps Zod out of the bundle).',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        ...htmlSinks,
        { object: 'document', property: 'write', message: 'No document.write (NFR-SEC).' },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['engine/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-restricted-imports': importBan(['app'], 'Engine code never imports from app/ (CLAUDE.md). Use shared/.'),
    },
  },
  {
    files: ['shared/**/*.ts'],
    rules: {
      'no-restricted-imports': importBan(['app', 'engine'], 'shared/ must not depend on app/ or engine/.'),
    },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.ts', '*.config.ts', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
);
