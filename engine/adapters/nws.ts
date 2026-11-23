// National Weather Service adapter (ENG-04, decision D22): one forecast request per metro, using the
// grid ids cached in config/metros.json. Produces the bundle's `weather` map, not rows.
import { z } from 'zod';
import type { ContentBundle, WeatherPeriod } from '../../shared/contracts.ts';
import { safeFetch } from '../http.ts';
import { plainText, toIso } from '../normalize.ts';
import type { Adapter } from './types.ts';

const PERIODS = 4;
const Forecast = z.object({
  properties: z.object({
    updateTime: z.string().optional(),
    generatedAt: z.string().optional(),
    periods: z.array(
      z.object({
        name: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        temperature: z.number().nullable(),
        temperatureUnit: z.enum(['F', 'C']),
        shortForecast: z.string(),
      }),
    ),
  }),
});

const utc = (s: string | undefined): string | null => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? null : toIso(t);
};

/** The next few forecast periods, in UTC, temperatures in °F. Null if the JSON is not a forecast. */
export function forecastPeriods(json: unknown, now: number): { periods: WeatherPeriod[]; issuedAt: string } | null {
  const r = Forecast.safeParse(json);
  if (!r.success) return null;
  const issuedAt = utc(r.data.properties.updateTime) ?? utc(r.data.properties.generatedAt);
  if (!issuedAt) return null;
  const periods: WeatherPeriod[] = [];
  for (const p of r.data.properties.periods) {
    const startsAt = utc(p.startTime);
    const endsAt = utc(p.endTime);
    if (!startsAt || !endsAt || Date.parse(endsAt) <= now || p.temperature === null) continue;
    const tempF = p.temperatureUnit === 'F' ? p.temperature : Math.round((p.temperature * 9) / 5 + 32);
    periods.push({ name: plainText(p.name, 40), tempF, summary: plainText(p.shortForecast, 120), startsAt, endsAt });
    if (periods.length === PERIODS) break;
  }
  return { periods, issuedAt };
}

export const nwsAdapter: Adapter = async (ctx) => {
  const weather: ContentBundle['weather'] = {};
  let failures = 0;
  let lastCode = 'no-metros';
  for (const m of ctx.metros) {
    if (!m.nwsGridId) continue;
    const [office, xy] = m.nwsGridId.split('/');
    const r = await safeFetch(
      {
        url: `https://api.weather.gov/gridpoints/${office}/${xy}/forecast`,
        allowedHosts: ctx.source.allowedHosts,
        accept: ['application/geo+json', 'application/json'],
      },
      ctx.http,
    );
    if (r.kind !== 'ok') {
      failures++;
      lastCode = r.kind === 'error' ? r.code : 'not-modified';
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(r.body);
    } catch {
      failures++;
      lastCode = 'malformed-json';
      continue;
    }
    const f = forecastPeriods(json, ctx.now);
    if (!f || f.periods.length === 0) {
      failures++;
      lastCode = 'unexpected-json';
      continue;
    }
    weather[m.id] = { ...f, url: `https://forecast.weather.gov/MapClick.php?lat=${m.lat}&lon=${m.lon}` };
  }
  // One metro failing must not hide the others; only a total failure is an error.
  if (Object.keys(weather).length === 0) return { kind: 'error', code: failures ? lastCode : 'no-metros' };
  return { kind: 'ok', items: [], etag: null, lastModified: null, weather };
};
