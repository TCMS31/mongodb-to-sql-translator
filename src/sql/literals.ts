import { TranslationError } from '../errors';

/**
 * Escape a string for use as a SQL single-quoted literal.
 *
 * SQL's own escape for a quote inside a quoted literal is to double it. This is
 * the only place in the codebase that turns caller-supplied text into SQL, and
 * skipping it is a SQL-injection hole: a value of `x'; DROP TABLE users; --`
 * would otherwise close the literal and append a second statement.
 */
export const escapeStringLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/** Values that may appear on the right-hand side of a comparison. */
export type ScalarValue = string | number | boolean | null;

/** Narrowing guard for the scalar types the translator can render. */
export const isScalar = (value: unknown): value is ScalarValue =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';

/**
 * Render a scalar as a SQL literal.
 *
 * Strings are escaped and quoted; numbers and booleans are emitted bare.
 * `null` is rejected here because SQL has no `= NULL` - the caller is expected
 * to have translated it into `IS NULL` / `IS NOT NULL` first.
 */
export const formatLiteral = (value: unknown): string => {
  if (typeof value === 'string') {
    return escapeStringLiteral(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TranslationError(
        'UNSUPPORTED_VALUE',
        `Cannot translate non-finite number: ${value}`
      );
    }
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (value === null) {
    throw new TranslationError(
      'UNSUPPORTED_VALUE',
      'NULL cannot be used as a comparison operand; use IS NULL / IS NOT NULL.'
    );
  }
  throw new TranslationError(
    'UNSUPPORTED_VALUE',
    `Cannot translate value of type ${Array.isArray(value) ? 'array' : typeof value}: ${JSON.stringify(value)}`
  );
};
