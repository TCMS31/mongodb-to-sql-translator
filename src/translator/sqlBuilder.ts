import { formatFieldPath, assertIdentifier } from '../sql/identifiers';
import { formatLiteral } from '../sql/literals';
import { ConditionNode, QueryPlan } from './ast';

/** Options that affect only how the plan is rendered, never what it means. */
export interface RenderOptions {
  /** Rewrite MongoDB's `_id` to the `id` column most SQL schemas use. */
  removeUnderscoreBeforeId: boolean;
}

const renderCondition = (node: ConditionNode, options: RenderOptions): string => {
  switch (node.kind) {
    case 'comparison':
      return `${formatFieldPath(node.field, options.removeUnderscoreBeforeId)} ${node.operator} ${formatLiteral(node.value)}`;
    case 'nullCheck':
      return `${formatFieldPath(node.field, options.removeUnderscoreBeforeId)} IS ${node.negated ? 'NOT ' : ''}NULL`;
    case 'membership':
      return `${formatFieldPath(node.field, options.removeUnderscoreBeforeId)} IN (${node.values
        .map(formatLiteral)
        .join(', ')})`;
    case 'constant':
      return node.value ? '1 = 1' : '1 = 0';
    case 'group':
      // Groups are always parenthesised so connective precedence never depends
      // on the SQL dialect's own AND/OR binding rules.
      return `(${node.conditions.map((child) => renderCondition(child, options)).join(` ${node.connective} `)})`;
  }
};

/** Render a query plan as a single SQL SELECT statement. */
export const buildStatement = (plan: QueryPlan, options: RenderOptions): string => {
  const columns =
    plan.projection.length > 0
      ? plan.projection
          .map((field) => formatFieldPath(field, options.removeUnderscoreBeforeId))
          .join(', ')
      : '*';
  const from = assertIdentifier(plan.collection, 'collection');
  const where =
    plan.conditions.length > 0
      ? ` WHERE ${plan.conditions.map((node) => renderCondition(node, options)).join(' AND ')}`
      : '';
  return `SELECT ${columns} FROM ${from}${where};`;
};
