// Relevance filter (spec 5.4 step 6): the source's own include/exclude word lists on the title.
// No inference from names and no AI ranking.

export interface RelevanceRules {
  include: string[];
  exclude: string[];
}

const norm = (s: string) => s.normalize('NFKC').toLowerCase();

/** Kept when no exclude phrase appears and (include is empty or any include phrase appears). */
export function isRelevant(title: string, rules: RelevanceRules): boolean {
  const t = norm(title);
  if (rules.exclude.some((w) => t.includes(norm(w)))) return false;
  return rules.include.length === 0 || rules.include.some((w) => t.includes(norm(w)));
}
