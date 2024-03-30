import JSON5 from 'json5';
import { TranslationError } from '../errors';
import { assertIdentifier } from '../sql/identifiers';

/** The MongoDB shell call, decomposed but not yet translated. */
export interface ParsedQuery {
  collection: string;
  filter: unknown;
  projection: string[];
}

const CALL_HEAD = /^db\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/;

/**
 * Find the index of the `)` matching the `(` at `openIndex`.
 *
 * Written by hand rather than with a regex because argument objects contain
 * parentheses inside string literals, and a regex cannot count nesting.
 */
const findMatchingParen = (source: string, openIndex: number): number => {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === '\\') {
        i += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
    } else if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  throw new TranslationError('MALFORMED_QUERY', 'Unbalanced parentheses in the query.');
};

/** Turn a projection document into the list of columns to select. */
const parseProjection = (raw: unknown): string[] => {
  if (raw === undefined || raw === null) {
    return [];
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TranslationError('INVALID_PROJECTION', 'The projection argument must be an object.');
  }
  const columns: string[] = [];
  for (const [field, flag] of Object.entries(raw as Record<string, unknown>)) {
    assertIdentifier(field, 'field');
    if (flag === 1 || flag === true) {
      columns.push(field);
    } else if (flag !== 0 && flag !== false) {
      throw new TranslationError(
        'INVALID_PROJECTION',
        `Projection value for "${field}" must be 0 or 1, received ${JSON.stringify(flag)}.`
      );
    }
  }
  return columns;
};

/**
 * Parse a `db.<collection>.find(<filter>, <projection>)` shell statement.
 *
 * Arguments are parsed with JSON5 because the MongoDB shell accepts unquoted
 * keys and single-quoted strings, which strict JSON rejects.
 */
export const parseQuery = (input: string): ParsedQuery => {
  const trimmed = input.trim().replace(/;$/, '').trim();
  if (trimmed.length === 0) {
    throw new TranslationError('EMPTY_INPUT', 'The query is empty.');
  }

  const head = CALL_HEAD.exec(trimmed);
  if (!head) {
    throw new TranslationError(
      'MALFORMED_QUERY',
      'Expected a query of the form db.<collection>.find(<filter>, <projection>).'
    );
  }

  const [matched, collection, method] = head;
  if (method !== 'find') {
    throw new TranslationError(
      'UNSUPPORTED_METHOD',
      `Only find() is supported; received ${method}().`
    );
  }

  const openIndex = matched.length - 1;
  const closeIndex = findMatchingParen(trimmed, openIndex);
  const trailing = trimmed.slice(closeIndex + 1).trim();
  if (trailing.length > 0) {
    const chained = /^\.\s*([A-Za-z_$][A-Za-z0-9_$]*)/.exec(trailing);
    throw new TranslationError(
      'UNSUPPORTED_METHOD',
      chained
        ? `Cursor method .${chained[1]}() is not supported; only a bare find() call can be translated.`
        : `Unexpected trailing input after find(): ${JSON.stringify(trailing)}.`
    );
  }

  const argsSource = trimmed.slice(openIndex + 1, closeIndex).trim();
  let args: unknown[];
  try {
    args = JSON5.parse<unknown[]>(`[${argsSource}]`);
  } catch (error) {
    throw new TranslationError(
      'MALFORMED_QUERY',
      `Could not parse find() arguments: ${(error as Error).message}`
    );
  }

  if (args.length > 2) {
    throw new TranslationError(
      'MALFORMED_QUERY',
      `find() accepts at most 2 arguments, received ${args.length}.`
    );
  }

  return {
    collection: assertIdentifier(collection, 'collection'),
    filter: args[0],
    projection: parseProjection(args[1]),
  };
};
