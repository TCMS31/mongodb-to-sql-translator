import { TranslationError } from '../errors';

/**
 * A field path we are willing to emit into SQL unquoted.
 *
 * Only bare ASCII identifiers, optionally dotted for MongoDB nested paths
 * (`address.city`). Anything else - spaces, quotes, semicolons, `$` operators
 * that leaked through - is rejected rather than interpolated, which keeps
 * attacker-controlled field names out of the generated statement.
 */
const IDENTIFIER_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/** Validate a collection or field name and return it unchanged. */
export const assertIdentifier = (value: string, kind: 'collection' | 'field'): string => {
  if (!IDENTIFIER_PATH.test(value)) {
    throw new TranslationError(
      'INVALID_IDENTIFIER',
      `Unsupported ${kind} name: ${JSON.stringify(value)}. ` +
        'Expected letters, digits and underscores, optionally dot-separated.'
    );
  }
  return value;
};

/**
 * Render a field path for the SELECT/WHERE clauses.
 *
 * `removeUnderscoreBeforeId` rewrites MongoDB's `_id` to the `id` column name
 * most relational schemas use. The rewrite is applied per dotted segment, so
 * `author._id` becomes `author.id`, and a column genuinely called `_id_backup`
 * is left alone because only exact `_id` segments match.
 */
export const formatFieldPath = (path: string, removeUnderscoreBeforeId: boolean): string => {
  assertIdentifier(path, 'field');
  if (!removeUnderscoreBeforeId) {
    return path;
  }
  return path
    .split('.')
    .map((segment) => (segment === '_id' ? 'id' : segment))
    .join('.');
};
