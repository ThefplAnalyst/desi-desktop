// Monochrome inline SVG icons (spec 6.6), drawn as simple strokes on a 24 px grid. Original artwork.

const PATHS: Record<string, string> = {
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z',
  news: 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M7 9h7M7 13h7M7 17h4',
  building: 'M3 21h18M5 21V10M19 21V10M9 21v-7M15 21v-7M12 3l9 5H3z',
  cricket: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM8 4.5c2 4.5 2 10.5 0 15M16 4.5c-2 4.5-2 10.5 0 15',
  passport: 'M6 3h12v18H6zM12 8a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM9 17h6',
  currency: 'M12 3v18M16.5 7.5C16 6 14.3 5 12 5 9.5 5 8 6.3 8 8s1.5 2.6 4 3 4 1.4 4 3.2S14.5 19 12 19c-2.4 0-4.2-1.1-4.6-2.8',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3C9.5 5.6 8.2 8.6 8.2 12s1.3 6.4 3.8 9',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM12 7v5l3 2',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 9h4M4 15h4M16 9h4M16 15h4',
  chip: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5z',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  briefcase: 'M3 7h18v13H3zM8 7V4h8v3M3 12h18',
  close: 'M6 6l12 12M18 6L6 18',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14zM20 20l-4-4',
};

const NS = 'http://www.w3.org/2000/svg';

export function icon(name: string, size = 18): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `icon icon-${name}`);
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', PATHS[name] ?? PATHS['star'] ?? '');
  svg.appendChild(path);
  return svg;
}
