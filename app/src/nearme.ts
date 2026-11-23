// Desi Near Me (spec 6.5): ten fixed map searches for the chosen metro. No location permission, no network.
import type { Metro } from '../../shared/contracts.ts';

export const NEAR_ME_SEARCHES = [
  'Indian grocery',
  'Halal grocery',
  'Hindu temple',
  'Mosque',
  'Gurdwara',
  'Indian restaurant',
  'Pakistani restaurant',
  'Bangladeshi restaurant',
  'Nepali restaurant',
  'Sri Lankan restaurant',
] as const;

export function nearMeLinks(m: Metro): { title: string; url: string }[] {
  return NEAR_ME_SEARCHES.map((q) => ({
    title: q,
    url: `https://www.google.com/maps/search/${encodeURIComponent(`${q} ${m.searchName}`).replace(/%20/g, '+')}`,
  }));
}
