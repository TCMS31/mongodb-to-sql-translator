import { parseQuery } from './parser/queryParser';
import { QueryPlan } from './translator/ast';
import { translateFilter } from './translator/filter';
import { buildStatement } from './translator/sqlBuilder';

/**
 * Orchestrates the three stages of a translation:
 *
 *   1. parse   - MongoDB shell syntax -> `ParsedQuery`
 *   2. analyse - filter document      -> condition AST (`QueryPlan`)
 *   3. render  - condition AST        -> SQL text
 *
 * Keeping the stages separate means the AST is the only thing the SQL layer
 * sees, so dialect changes stay inside `sqlBuilder` and syntax changes stay
 * inside `parser`.
 */
class MongoDBToSQLTranslator {
  /** Stages 1 and 2: turn shell syntax into a dialect-independent plan. */
  public plan(input: string): QueryPlan {
    const { collection, filter, projection } = parseQuery(input);
    return { collection, projection, conditions: translateFilter(filter) };
  }

  /** All three stages: produce the SQL statement for a MongoDB query string. */
  public produceSQL(input: string, removeUnderscoreBeforeID = false): string {
    return buildStatement(this.plan(input), { removeUnderscoreBeforeId: removeUnderscoreBeforeID });
  }
}

export default MongoDBToSQLTranslator;
