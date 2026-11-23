import { describe, expect, it } from 'vitest';
import { filterDashboard, matchRanges, terms } from '../../app/src/filter.ts';

const tiles = [
  {
    id: 'india-news' as const,
    title: 'India Updates',
    items: [
      { title: 'India visa rules change' },
      { title: 'Row about India' },
      { title: 'Row about visa' },
      { title: 'Fourth' },
      { title: 'Fifth' },
      { title: 'Sixth' },
      { title: 'Seventh: new VISA for India' },
    ],
  },
  { id: 'festivals' as const, title: 'Festivals & Holidays', items: [{ title: 'Diwali' }, { title: 'Eid al-Fitr' }] },
  { id: 'cricket' as const, title: 'Cricket', items: [{ title: 'India v Pakistan' }] },
];

describe('T-05 FR-07 filter', () => {
  it('T-05 FR-07 empty query returns every tile with all rows', () => {
    const r = filterDashboard(tiles, '   ');
    expect(r.map((t) => t.tileId)).toEqual(['india-news', 'festivals', 'cricket']);
    expect(r[0]?.items).toHaveLength(7);
  });

  it('T-05 FR-07 "india visa" matches only rows containing both words, in any order', () => {
    const r = filterDashboard(tiles, 'india visa');
    expect(r.map((t) => t.tileId)).toEqual(['india-news']);
    expect(r[0]?.items.map((i) => i.title)).toEqual(['India visa rules change', 'Seventh: new VISA for India']);
  });

  it('T-05 FR-07 filter ignores words split across rows', () => {
    const r = filterDashboard([{ id: 'visa', title: 'Visas', items: [{ title: 'India' }, { title: 'visa' }] }], 'india visa');
    expect(r).toEqual([]);
  });

  it('T-05 FR-07 filter ignores words split across heading and row', () => {
    const r = filterDashboard([{ id: 'india-news', title: 'India Updates', items: [{ title: 'New visa rules' }] }], 'india visa');
    expect(r).toEqual([]);
  });

  it('T-05 FR-07 matches beyond row 5 are found', () => {
    const r = filterDashboard(tiles, 'seventh');
    expect(r[0]?.items.map((i) => i.title)).toEqual(['Seventh: new VISA for India']);
  });

  it('T-05 FR-07 a title-only match returns the tile with no rows', () => {
    const r = filterDashboard(tiles, 'festivals');
    expect(r).toEqual([{ tileId: 'festivals', headingMatch: true, items: [] }]);
  });

  it('T-05 FR-07 matching is case-insensitive and NFKC-normalized', () => {
    const r = filterDashboard([{ id: 'visa', title: 'X', items: [{ title: 'Ｈ－１Ｂ ＶＩＳＡ news' }] }], 'h-1b visa');
    expect(r[0]?.items).toHaveLength(1);
    expect(terms('  ＩＮＤＩＡ   Visa ')).toEqual(['india', 'visa']);
  });

  it('T-05 FR-07 nothing matches returns no tiles', () => {
    expect(filterDashboard(tiles, 'zzz')).toEqual([]);
  });

  it('T-05 FR-07 highlight ranges cover each matched word', () => {
    expect(matchRanges('India visa india', ['india'])).toEqual([
      [0, 5],
      [11, 16],
    ]);
    expect(matchRanges('abc', [])).toEqual([]);
  });
});
