/** Strip whitespace for space-insensitive matching ("abc sd" ≡ "abcsd"). */
export function compactText(value: string): string {
  return value.replace(/[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]+/g, '').toLowerCase();
}

export function searchTokens(search: string): string[] {
  return search
    .trim()
    .toLowerCase()
    .split(/[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]+/)
    .map((t) => t.replace(/[%_]/g, ''))
    .filter(Boolean);
}

/** True if every search token appears in the haystack (compact, word prefix, or in-word subsequence). */
export function matchesSearchTokens(haystack: string, query: string): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  const compactHay = compactText(haystack);
  const fullCompact = compactText(query);
  // "abc sd" ↔ "abcsd"
  if (fullCompact && compactHay.includes(fullCompact)) return true;

  const words = haystack
    .toLowerCase()
    .split(/[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]+/)
    .filter(Boolean);

  return tokens.every((t) => tokenMatchesAnyWord(t, words) || compactHay.includes(t));
}

/** mil→million, fay→faayaz (prefix, substring, or ordered letters within one word). */
function tokenMatchesAnyWord(token: string, words: string[]): boolean {
  for (const word of words) {
    const w = compactText(word);
    if (w.includes(token) || w.startsWith(token)) return true;
    let i = 0;
    for (const ch of w) {
      if (ch === token[i]) i++;
      if (i >= token.length) return true;
    }
  }
  return false;
}

/** Match query against one or more fields (tokens may span fields). */
export function entityMatchesSearch(
  fields: Array<string | null | undefined>,
  query: string,
): boolean {
  const q = query.trim();
  if (!q) return true;
  const parts = fields.filter((v): v is string => Boolean(v && v.trim()));
  return parts.length > 0 && matchesSearchTokens(parts.join(' '), q);
}

export function productMatchesSearch(
  product: { name: string; sku?: string | null; barcode?: string | null },
  query: string,
): boolean {
  return entityMatchesSearch([product.name, product.sku, product.barcode], query);
}

export function customerMatchesSearch(
  customer: { name: string; phone?: string | null; email?: string | null },
  query: string,
): boolean {
  return entityMatchesSearch([customer.name, customer.phone, customer.email], query);
}
