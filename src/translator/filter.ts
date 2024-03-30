import { TranslationError } from '../errors';
import { assertIdentifier } from '../sql/identifiers';
import { ConditionNode } from './ast';
import { getOperator, LOGICAL_OPERATORS, supportedOperators } from './operators';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const unsupportedOperator = (name: string): TranslationError =>
  new TranslationError(
    'UNSUPPORTED_OPERATOR',
    `Unsupported MongoDB operator "${name}". Supported: ` +
      `${[...Object.keys(LOGICAL_OPERATORS), ...supportedOperators()].sort().join(', ')}.`
  );

/** Collapse a branch's conditions into exactly one node, ANDing if needed. */
const asSingleCondition = (conditions: ConditionNode[], context: string): ConditionNode => {
  if (conditions.length === 0) {
    throw new TranslationError('MALFORMED_QUERY', `Empty condition inside ${context}.`);
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return { kind: 'group', connective: 'AND', conditions };
};

const translateLogical = (name: string, operand: unknown): ConditionNode => {
  if (!Array.isArray(operand) || operand.length === 0) {
    throw new TranslationError(
      'MALFORMED_QUERY',
      `Operator ${name} expects a non-empty array of sub-queries.`
    );
  }
  const conditions = operand.map((branch) =>
    asSingleCondition(translateFilter(branch, name), name)
  );
  // A one-branch $and/$or is just that branch; wrapping it would emit a
  // redundant pair of parentheses around an already-grouped condition.
  if (conditions.length === 1) {
    return conditions[0];
  }
  return { kind: 'group', connective: LOGICAL_OPERATORS[name], conditions };
};

const translateFieldValue = (field: string, value: unknown): ConditionNode[] => {
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      throw new TranslationError(
        'MALFORMED_QUERY',
        `Field "${field}" has an empty operator object.`
      );
    }
    if (!keys.every((key) => key.startsWith('$'))) {
      // `{a: {b: 1}}` in MongoDB means "a equals this exact sub-document",
      // which has no faithful single-column SQL equivalent.
      throw new TranslationError(
        'UNSUPPORTED_VALUE',
        `Field "${field}" is matched against a sub-document, which has no SQL equivalent.`
      );
    }
    // MongoDB ANDs multiple operators on one field: {age: {$gt: 1, $lt: 5}}.
    return keys.map((key) => {
      const handler = getOperator(key);
      if (!handler) {
        throw unsupportedOperator(key);
      }
      return handler.build(field, value[key]);
    });
  }

  if (Array.isArray(value)) {
    throw new TranslationError(
      'UNSUPPORTED_VALUE',
      `Field "${field}" is matched against an array. MongoDB array matching has no ` +
        'direct SQL equivalent; use $in for "any of these values".'
    );
  }

  const equality = getOperator('$eq');
  /* istanbul ignore next -- $eq is registered at module load. */
  if (!equality) {
    throw unsupportedOperator('$eq');
  }
  return [equality.build(field, value)];
};

/**
 * Translate a MongoDB filter document into a flat list of conditions that the
 * caller will join with AND.
 *
 * Every key is accounted for. The previous implementation kept only the first
 * condition of each `$or`/`$and` branch, which silently widened the query.
 */
export const translateFilter = (filter: unknown, context = 'the query filter'): ConditionNode[] => {
  if (filter === undefined || filter === null) {
    return [];
  }
  if (!isPlainObject(filter)) {
    throw new TranslationError(
      'MALFORMED_QUERY',
      `Expected ${context} to be an object, received ${Array.isArray(filter) ? 'an array' : typeof filter}.`
    );
  }

  const conditions: ConditionNode[] = [];
  for (const [key, value] of Object.entries(filter)) {
    if (key.startsWith('$')) {
      if (!(key in LOGICAL_OPERATORS)) {
        throw unsupportedOperator(key);
      }
      conditions.push(translateLogical(key, value));
      continue;
    }
    assertIdentifier(key, 'field');
    conditions.push(...translateFieldValue(key, value));
  }
  return conditions;
};
