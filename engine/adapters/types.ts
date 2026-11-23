// Adapter contract (ENG-04): one function per source kind. Adapters never touch the network
// directly; network adapters go through http.ts via `ctx.http`.
import type { ContentBundle, SourceHealth } from '../../shared/contracts.ts';
import type { HttpDeps } from '../http.ts';
import type { RawItem } from '../normalize.ts';
import type { Metros, Source } from '../registry.ts';

export interface AdapterContext {
  source: Source;
  now: number;
  root: string; // repository root, for curated files
  http: HttpDeps;
  previous: SourceHealth | undefined; // for conditional requests
  /** Dev preview only: allow curated files the owner has not verified yet. */
  allowUnverified: boolean;
  /** The 20 metro areas (for the NWS adapter). */
  metros: Metros['metros'];
}

export type AdapterResult =
  | { kind: 'ok'; items: RawItem[]; etag: string | null; lastModified: string | null; baseUrl?: string; weather?: ContentBundle['weather'] }
  | { kind: 'not-modified' }
  | { kind: 'error'; code: string };

export type Adapter = (ctx: AdapterContext) => Promise<AdapterResult>;
