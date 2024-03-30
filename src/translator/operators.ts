import { TranslationError } from '../errors';
import { isScalar, ScalarValue } from '../sql/literals';
import { ConditionNode, Connective } from './ast';

/**
 * Builds the AST node for one MongoDB field-level operator.
 *
 * This is the extension seam of the project: supporting a new operator means
 * writing one handler and calling `registerOperator`, with no change to the
 * parser, the filter walker or the SQL builder.
 */
export interface OperatorHandler {
  /** The MongoDB operator this handler claims, including the `$`. */
  readonly name: string;
  /** Translate `{ <field>: { <name>: <operand> } }` into a condition node. */
  build(field: string, operand: unknown): ConditionNode;
}

/** MongoDB logical operators and the SQL connective each maps to. */
export const LOGICAL_OPERATORS: Readonly<Record<string, Connective>> = Object.freeze({
  $and: 'AND',
  $or: 'OR',
});

const registry = new Map<string, OperatorHandler>();

/** Register (or replace) the handler for a MongoDB operator. */
export const registerOperator = (handler: OperatorHandler): void => {
  registry.set(handler.name, handler);
};

/** Look up a handler, or `undefined` if the operator is not supported. */
export const getOperator = (name: string): OperatorHandler | undefined => registry.get(name);

/** Every supported field-level operator, sorted for stable error messages. */
export const supportedOperators = (): string[] => [...registry.keys()].sort();

const requireScalar = (field: string, name: string, operand: unknown): ScalarValue => {
  if (!isScalar(operand)) {
    throw new TranslationError(
      'UNSUPPORTED_VALUE',
      `Operator ${name} on field "${field}" expects a string, number, boolean or null, ` +
        `received ${Array.isArray(operand) ? 'an array' : typeof operand}.`
    );
  }
  return operand;
};

/**
 * Equality and inequality need their own handler because MongoDB's `null` means
 * "IS NULL" in SQL terms, while every other value is a plain comparison.
 */
const buildEquality = (name: string, sqlOperator: string, negated: boolean): OperatorHandler => ({
  name,
  build(field, operand) {
    const value = requireScalar(field, name, operand);
    if (value === null) {
      return { kind: 'nullCheck', field, negated };
    }
    return { kind: 'comparison', field, operator: sqlOperator, value };
  },
});

/** Ordering comparisons reject `null`: SQL comparisons against NULL are never true. */
const buildOrdering = (name: string, sqlOperator: string): OperatorHandler => ({
  name,
  build(field, operand) {
    const value = requireScalar(field, name, operand);
    if (value === null) {
      throw new TranslationError(
        'UNSUPPORTED_VALUE',
        `Operator ${name} on field "${field}" cannot be applied to null.`
      );
    }
    return { kind: 'comparison', field, operator: sqlOperator, value };
  },
});

const membershipHandler: OperatorHandler = {
  name: '$in',
  build(field, operand) {
    if (!Array.isArray(operand)) {
      throw new TranslationError(
        'UNSUPPORTED_VALUE',
        `Operator $in on field "${field}" expects an array, received ${typeof operand}.`
      );
    }
    // `IN ()` is a syntax error in every mainstream engine, and MongoDB's
    // `$in: []` matches no documents, so emit an always-false condition.
    if (operand.length === 0) {
      return { kind: 'constant', value: false };
    }
    const values = operand.map((item) => requireScalar(field, '$in', item));
    if (values.some((item) => item === null)) {
      throw new TranslationError(
        'UNSUPPORTED_VALUE',
        `Operator $in on field "${field}" cannot contain null; SQL IN never matches NULL.`
      );
    }
    return { kind: 'membership', field, values };
  },
};

registerOperator(buildEquality('$eq', '=', false));
registerOperator(buildEquality('$ne', '!=', true));
registerOperator(buildOrdering('$gt', '>'));
registerOperator(buildOrdering('$gte', '>='));
registerOperator(buildOrdering('$lt', '<'));
registerOperator(buildOrdering('$lte', '<='));
registerOperator(membershipHandler);
