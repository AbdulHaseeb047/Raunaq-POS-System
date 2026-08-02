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
  // Align with Postgres [[:space:]] for common cases (incl. NBSP).
  return value.replace(/[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]+/g, '').toLowerCase();
}

function likeContainsPattern(compactTerm: string): string {
  const safe = compactTerm.replace(/[%_]/g, '');
  return `%${safe}%`;
}

/** Expression that works without generated columns. */
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

/**
 * Prefer indexed `*_compact` columns when the migration has been applied;
 * otherwise fall back to regexp_replace so search never hard-fails.
 */
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

/** Test helper — reset cached capability flag. */
export function resetCompactSearchCache(): void {
  compactColumnsAvailable = null;
}

/**
 * Returns matching row ids for a space-insensitive contains search, or null when
 * there is no search term (caller should skip id filtering).
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
  if (pattern === '%%') return [];

  const fast = await hasCompactSearchColumns();
  const extras = extraColumns.map((col) => Prisma.sql`OR ${matchExpr(col, fast)} LIKE ${pattern}`);
  const limitClause = limit != null && limit > 0 ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;

  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM ${TABLE_SQL[table]}
      WHERE tenant_id = ${tenantId}::uuid
        AND deleted_at IS NULL
        AND (
          ${matchExpr('name', fast)} LIKE ${pattern}
          ${extras.length > 0 ? Prisma.join(extras, ' ') : Prisma.empty}
        )
      ${limitClause}
    `;
    return rows.map((r) => r.id);
  } catch (err) {
    // Migration may have been rolled back mid-flight — retry once with slow path.
    if (fast) {
      compactColumnsAvailable = false;
      return findIdsByCompactSearch(table, tenantId, search, extraColumns, limit);
    }
    throw err;
  }
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
