// App entry. M0 only proves the build pipeline and the shared-contract wiring;
// search, grid, tiles and preferences arrive in M1 (spec 7.1).
import type { Preferences } from '../../shared/contracts.ts';

const PREFS_VERSION: Preferences['version'] = 1;

document.documentElement.dataset['js'] = 'on';
document.documentElement.dataset['prefsVersion'] = String(PREFS_VERSION);
