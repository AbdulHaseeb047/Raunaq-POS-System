import { Prisma } from '@prisma/client';

import { ConflictError } from './errors.js';
import { prisma } from './prisma.js';

export type NamedEntityTable = 'customers' | 'products' | 'categories' | 'brands' | 'suppliers';

export type CompactExtraColumn = 'phone' | 'email' | 'sku' | 'barcode';

const TABLE_SQL: Record<NamedEntityTable, Prisma.Sql> = {
  customers: Prisma.raw('customers'),
  products: Prisma.raw('products'),
  categories: Prisma.raw('categories'),
  brands: Prisma.raw('brands'),
  suppliers: Prisma.raw('suppliers'),
};

const FAST_COMPACT_COLUMN: Record<'name' | CompactExtraColumn, Prisma.Sql> = {
  name: Prisma.raw('name_compact'),
  phone: Prisma.raw('phone_compact'),
  email: Prisma.raw('email_compact'),
  sku: Prisma.raw('sku_compact'),
  barcode: Prisma.raw('barcode_compact'),
};

/** Default cap for typeahead-style callers; list endpoints pass `null` (no LIMIT). */
export const DEFAULT_SEARCH_ID_LIMIT = 300;

/** Cached: true when customers.name_compact exists (migration applied). */
let compactColumnsAvailable: boolean | null = null;

/** Strip whitespace for space-insensitive matching ("abc sd" ≡ "abcsd"). */
export function compactText(value: string): string {
  return value.replace(/[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]+/g, '').toLowerCase();
}

/** Whitespace-separated search tokens (empty if nothing usable). */
export function searchTokens(search: string): string[] {
  return search
    .trim()
    .toLowerCase()
    .split(/[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]+/)
    .map((t) => t.replace(/[%_]/g, ''))
    .filter(Boolean);
}

function likeContainsPattern(compactTerm: string): string {
  const safe = compactTerm.replace(/[%_]/g, '');
  return `%${safe}%`;
}

/** True if every search token appears in the haystack (compact, word prefix, or in-word subsequence). */
export function matchesSearchTokens(haystack: string, query: string): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;
  const compactHay = compactText(haystack);
  const fullCompact = compactText(query);
  if (fullCompact && compactHay.includes(fullCompact)) return true;

  const words = haystack
    .toLowerCase()
    .split(/[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]+/)
    .filter(Boolean);

  return tokens.every((t) => tokenMatchesAnyWord(t, words) || compactHay.includes(t));
}

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

function slowCompactExpr(column: 'name' | CompactExtraColumn): Prisma.Sql {
  if (column === 'name') {
    return Prisma.sql`regexp_replace(lower(name), '[[:space:]]+', '', 'g')`;
  }
  const col = Prisma.raw(column);
  return Prisma.sql`regexp_replace(lower(COALESCE(${col}, '')), '[[:space:]]+', '', 'g')`;
}

function matchExpr(column: 'name' | CompactExtraColumn, fast: boolean): Prisma.Sql {
  return fast ? FAST_COMPACT_COLUMN[column] : slowCompactExpr(column);
}

export async function hasCompactSearchColumns(): Promise<boolean> {
  if (compactColumnsAvailable != null) return compactColumnsAvailable;
  try {
    const rows = await prisma.$queryRaw<Array<{ ok: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'customers'
          AND column_name = 'name_compact'
      ) AS ok
    `;
    compactColumnsAvailable = Boolean(rows[0]?.ok);
  } catch {
    compactColumnsAvailable = false;
  }
  return compactColumnsAvailable;
}

export function resetCompactSearchCache(): void {
  compactColumnsAvailable = null;
}

/**
 * Returns matching row ids for space-insensitive / multi-token search, or null when
 * there is no search term (caller should skip id filtering).
 *
 * Broad SQL candidate fetch (any token hits), then JS AND+subsequence filter so
 * "mil fay" matches "million faayaz supreme".
 */
export async function findIdsByCompactSearch(
  table: NamedEntityTable,
  tenantId: string,
  search: string,
  extraColumns: CompactExtraColumn[] = [],
  limit: number | null = DEFAULT_SEARCH_ID_LIMIT,
): Promise<string[] | null> {
  const term = search.trim();
  if (!term) return null;

  const tokens = searchTokens(term);
  const fullCompact = compactText(term);
  if (tokens.length === 0 && !fullCompact) return [];

  const effectiveTokens = tokens.length > 0 ? tokens : [fullCompact];
  const fast = await hasCompactSearchColumns();
  const nameExpr = matchExpr('name', fast);

  // Broad OR: any token in name/extras (candidates), then precise filter in JS.
  const looseParts: Prisma.Sql[] = [];
  for (const t of effectiveTokens) {
    const pat = likeContainsPattern(t);
    looseParts.push(Prisma.sql`${nameExpr} LIKE ${pat}`);
    looseParts.push(Prisma.sql`lower(name) LIKE ${pat}`);
    for (const col of extraColumns) {
      looseParts.push(Prisma.sql`${matchExpr(col, fast)} LIKE ${pat}`);
    }
  }
  if (fullCompact) {
    looseParts.push(Prisma.sql`${nameExpr} LIKE ${likeContainsPattern(fullCompact)}`);
  }

  const candidateLimit = limit == null ? 5000 : Math.max(limit * 3, 200);
  const predicate =
    looseParts.length === 1 ? looseParts[0]! : Prisma.sql`(${Prisma.join(looseParts, ' OR ')})`;

  const selectCols: Prisma.Sql[] = [Prisma.sql`id`, Prisma.sql`name`];
  if (extraColumns.includes('sku')) selectCols.push(Prisma.sql`sku`);
  if (extraColumns.includes('barcode')) selectCols.push(Prisma.sql`barcode`);
  if (extraColumns.includes('phone')) selectCols.push(Prisma.sql`phone`);
  if (extraColumns.includes('email')) selectCols.push(Prisma.sql`email`);

  try {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        sku?: string | null;
        barcode?: string | null;
        phone?: string | null;
        email?: string | null;
      }>
    >`
      SELECT ${Prisma.join(selectCols, ', ')} FROM ${TABLE_SQL[table]}
      WHERE tenant_id = ${tenantId}::uuid
        AND deleted_at IS NULL
        AND ${predicate}
      LIMIT ${candidateLimit}
    `;

    // Join fields so tokens can span columns (e.g. name + phone: "john 0300").
    const matched = rows.filter((r) => {
      const fields = [r.name, r.sku, r.barcode, r.phone, r.email].filter((v): v is string =>
        Boolean(v && String(v).trim()),
      );
      return fields.length > 0 && matchesSearchTokens(fields.join(' '), term);
    });
    const ids = matched.map((r) => r.id);
    if (limit != null && limit > 0) return ids.slice(0, limit);
    return ids;
  } catch (err) {
    if (fast) {
      compactColumnsAvailable = false;
      return findIdsByCompactSearch(table, tenantId, search, extraColumns, limit);
    }
    throw err;
  }
}

export async function assertUniqueCompactName(
  table: NamedEntityTable,
  tenantId: string,
  name: string,
  entityLabel: string,
  excludeId?: string,
): Promise<void> {
  const compact = compactText(name.trim());
  if (!compact) return;

  const exclude = excludeId ? Prisma.sql`AND id <> ${excludeId}::uuid` : Prisma.empty;
  const fast = await hasCompactSearchColumns();

  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM ${TABLE_SQL[table]}
      WHERE tenant_id = ${tenantId}::uuid
        AND deleted_at IS NULL
        AND ${matchExpr('name', fast)} = ${compact}
        ${exclude}
      LIMIT 1
    `;

    if (rows.length > 0) {
      throw new ConflictError(`A ${entityLabel} with this name already exists`, 'DUPLICATE_NAME');
    }
  } catch (err) {
    if (err instanceof ConflictError) throw err;
    if (fast) {
      compactColumnsAvailable = false;
      await assertUniqueCompactName(table, tenantId, name, entityLabel, excludeId);
      return;
    }
    throw err;
  }
}
