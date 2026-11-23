// Engine entry point (spec 5.4). Built in M2; this stub only proves the Node-side
// TypeScript setup runs with Node's built-in type stripping (no build step).
import type { ContentBundle } from '../shared/contracts.ts';

const SCHEMA_VERSION: ContentBundle['schemaVersion'] = 2;

console.error(`Desi Desktop engine (bundle schema v${SCHEMA_VERSION}) is not built yet; see milestone M2.`);
process.exitCode = 1;
