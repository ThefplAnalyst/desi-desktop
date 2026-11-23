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
  { ignores: ['dist/', 'tmp/', 'coverage/', 'playwright-report/', 'test-results/', 'node_modules/'] },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    files: ['app/**/*.ts'],
    languageOptions: { globals: globals.browser },
    rules: {
      'no-restricted-imports': importBan(['engine'], 'App code never imports from engine/ (CLAUDE.md). Use shared/.'),
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
