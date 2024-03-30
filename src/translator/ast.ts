import { ScalarValue } from '../sql/literals';

/** Boolean connectives the builder knows how to render. */
export type Connective = 'AND' | 'OR';

/** `field <op> literal`, e.g. `age >= 21`. */
export interface ComparisonNode {
  kind: 'comparison';
  field: string;
  operator: string;
  value: ScalarValue;
}

/** `field IS NULL` / `field IS NOT NULL`. SQL cannot compare to NULL with `=`. */
export interface NullCheckNode {
  kind: 'nullCheck';
  field: string;
  negated: boolean;
}

/** `field IN (a, b, c)`. */
export interface MembershipNode {
  kind: 'membership';
  field: string;
  values: ScalarValue[];
}

/** A parenthesised group of conditions joined by a single connective. */
export interface GroupNode {
  kind: 'group';
  connective: Connective;
  conditions: ConditionNode[];
}

/**
 * A condition with a fixed truth value, used where MongoDB semantics are
 * decidable without touching the data - `{$in: []}` matches nothing, so it
 * becomes `1 = 0` rather than the invalid `IN ()`.
 */
export interface ConstantNode {
  kind: 'constant';
  value: boolean;
}

export type ConditionNode =
  ComparisonNode | NullCheckNode | MembershipNode | GroupNode | ConstantNode;

/** The whole `find` call, decoupled from both MongoDB syntax and SQL syntax. */
export interface QueryPlan {
  collection: string;
  projection: string[];
  /** Top-level conditions, implicitly ANDed. Empty means "no WHERE clause". */
  conditions: ConditionNode[];
}
