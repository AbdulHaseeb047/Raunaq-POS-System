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

const EXTRA_COMPACT_COLUMN: Record<CompactExtraColumn, Prisma.Sql> = {
  phone: Prisma.raw('phone_compact'),
  email: Prisma.raw('email_compact'),
  sku: Prisma.raw('sku_compact'),
  barcode: Prisma.raw('barcode_compact'),
};

/** Default cap for typeahead-style callers; list endpoints pass `null` (no LIMIT). */
export const DEFAULT_SEARCH_ID_LIMIT = 300;

/** Strip whitespace for space-insensitive matching ("abc sd" ≡ "abcsd"). */
export function compactText(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function likeContainsPattern(compactTerm: string): string {
  // Drop LIKE wildcards from user input so they cannot broaden the match.
  const safe = compactTerm.replace(/[%_]/g, '');
  return `%${safe}%`;
}

/**
 * Returns matching row ids for a space-insensitive contains search, or null when
 * there is no search term (caller should skip id filtering).
 *
 * Uses stored `*_compact` columns + pg_trgm GIN indexes (see migration).
 * Pass `limit: null` for full paginated lists; default 300 for typeahead safety.
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

  const pattern = likeContainsPattern(compactText(term));
  // Non-empty input that sanitized to nothing (e.g. only %/_) → no matches, not "unfiltered".
  if (pattern === '%%') return [];

  const extras = extraColumns.map(
    (col) => Prisma.sql`OR ${EXTRA_COMPACT_COLUMN[col]} LIKE ${pattern}`,
  );

  const limitClause = limit != null && limit > 0 ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM ${TABLE_SQL[table]}
    WHERE tenant_id = ${tenantId}::uuid
      AND deleted_at IS NULL
      AND (
        name_compact LIKE ${pattern}
        ${extras.length > 0 ? Prisma.join(extras, ' ') : Prisma.empty}
      )
    ${limitClause}
  `;

  return rows.map((r) => r.id);
}

/** Block create/update when another active row has the same name ignoring spaces/case. */
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
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM ${TABLE_SQL[table]}
    WHERE tenant_id = ${tenantId}::uuid
      AND deleted_at IS NULL
      AND name_compact = ${compact}
      ${exclude}
    LIMIT 1
  `;

  if (rows.length > 0) {
    throw new ConflictError(`A ${entityLabel} with this name already exists`, 'DUPLICATE_NAME');
  }
}
