import MongoDBToSQLTranslator from './MongoDBToSQLTranslator';

export { TranslationError } from './errors';
export type { TranslationErrorCode } from './errors';
export { registerOperator, getOperator, supportedOperators } from './translator/operators';
export type { OperatorHandler } from './translator/operators';
export type { ConditionNode, QueryPlan } from './translator/ast';
export { default as MongoDBToSQLTranslator } from './MongoDBToSQLTranslator';

/**
 * Translate a MongoDB `find` query into an equivalent SQL SELECT statement.
 *
 * @param input - A `db.<collection>.find(<filter>, <projection>)` statement.
 * @param removeUnderscoreBeforeID - Rewrite `_id` to `id` in the output.
 * @returns The SQL statement, terminated with a semicolon.
 * @throws {TranslationError} If the query cannot be translated faithfully.
 */
export const convertToSQL = (input: string, removeUnderscoreBeforeID = false): string => {
  if (typeof input !== 'string') {
    throw new TypeError('convertToSQL expects the MongoDB query as a string.');
  }
  return new MongoDBToSQLTranslator().produceSQL(input, removeUnderscoreBeforeID);
};
