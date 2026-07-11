import { Decimal } from '@prisma/client/runtime/library';

const DATE_FIELD_PATTERN = /(?:At|_at)$|Date$/;

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function isDecimalField(camelKey: string): boolean {
  return /(?:amount|price|quantity|balance|total|rate|cost|value|threshold|percent|number)/i.test(
    camelKey,
  );
}

function coerceValue(camelKey: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (DATE_FIELD_PATTERN.test(camelKey) || camelKey === 'createdAt' || camelKey === 'updatedAt') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date;
    }
    if (isDecimalField(camelKey)) {
      return new Decimal(value);
    }
  }
  return value;
}

/** JSONB payload (snake_case) → Prisma create/update data (camelCase). */
export function payloadToRow(
  payload: Record<string, unknown>,
  options?: { omit?: string[] },
): Record<string, unknown> {
  const omit = new Set(options?.omit ?? []);
  const row: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    const camelKey = snakeToCamel(key);
    if (omit.has(camelKey)) continue;
    row[camelKey] = coerceValue(camelKey, value);
  }

  return row;
}
