import { convertToSQL } from '../src/index';

/**
 * The reference table for this translator.
 *
 * Every row is a MongoDB query and the exact SQL it must produce. Correctness
 * is the product here, so the table is the specification: if a change alters a
 * row, that is a deliberate semantic decision, not an implementation detail.
 */
interface Row {
  readonly name: string;
  readonly mongo: string;
  readonly sql: string;
  readonly removeUnderscoreBeforeId?: boolean;
}

const TABLE: readonly Row[] = [
  // --- projection and the _id rewrite -------------------------------------
  {
    name: 'projection with _id rewritten',
    mongo: 'db.user.find({_id: 23113},{name: 1, age: 1});',
    sql: 'SELECT name, age FROM user WHERE id = 23113;',
    removeUnderscoreBeforeId: true,
  },
  {
    name: 'projection with _id preserved',
    mongo: 'db.user.find({_id: 23113},{name: 1, age: 1});',
    sql: 'SELECT name, age FROM user WHERE _id = 23113;',
  },
  {
    name: '_id appears in the projection too',
    mongo: 'db.user.find({age: {$gte: 21}},{name: 1, _id: 1});',
    sql: 'SELECT name, id FROM user WHERE age >= 21;',
    removeUnderscoreBeforeId: true,
  },
  {
    name: 'excluded projection keys are dropped',
    mongo: 'db.u.find({}, {a: 1, b: 0, c: 1});',
    sql: 'SELECT a, c FROM u;',
  },
  {
    name: 'empty projection selects everything',
    mongo: 'db.u.find({a: 1},{});',
    sql: 'SELECT * FROM u WHERE a = 1;',
  },

  // --- comparison operators ------------------------------------------------
  { name: '$eq implicit', mongo: 'db.u.find({a: 7});', sql: 'SELECT * FROM u WHERE a = 7;' },
  { name: '$eq explicit', mongo: 'db.u.find({a: {$eq: 7}});', sql: 'SELECT * FROM u WHERE a = 7;' },
  {
    name: '$ne',
    mongo: "db.product.find({name: {$ne: 'laptop'}},{price: 1});",
    sql: "SELECT price FROM product WHERE name != 'laptop';",
  },
  { name: '$gt', mongo: 'db.u.find({a: {$gt: 1}});', sql: 'SELECT * FROM u WHERE a > 1;' },
  { name: '$gte', mongo: 'db.u.find({a: {$gte: 1}});', sql: 'SELECT * FROM u WHERE a >= 1;' },
  { name: '$lt', mongo: 'db.u.find({a: {$lt: 1}});', sql: 'SELECT * FROM u WHERE a < 1;' },
  { name: '$lte', mongo: 'db.u.find({a: {$lte: 1}});', sql: 'SELECT * FROM u WHERE a <= 1;' },
  {
    name: 'two operators on one field are ANDed, as MongoDB does',
    mongo: 'db.u.find({age: {$gt: 1, $lt: 5}});',
    sql: 'SELECT * FROM u WHERE age > 1 AND age < 5;',
  },

  // --- $in -----------------------------------------------------------------
  {
    name: '$in with numbers',
    mongo: 'db.user.find({age: {$in: [25, 30]}},{name: 1});',
    sql: 'SELECT name FROM user WHERE age IN (25, 30);',
  },
  {
    name: '$in with strings',
    mongo: "db.u.find({a: {$in: ['x','y']}});",
    sql: "SELECT * FROM u WHERE a IN ('x', 'y');",
  },
  {
    name: '$in with an empty array matches nothing, and is not the invalid IN ()',
    mongo: 'db.u.find({a: {$in: []}});',
    sql: 'SELECT * FROM u WHERE 1 = 0;',
  },

  // --- logical operators, nesting and precedence ---------------------------
  {
    name: '$and',
    mongo:
      "db.order.find({$and: [{status: 'placed'}, {total: {$gt: 100}}]},{_id: 0, customer: 1});",
    sql: "SELECT customer FROM order WHERE (status = 'placed' AND total > 100);",
    removeUnderscoreBeforeId: true,
  },
  {
    name: '$or',
    mongo:
      "db.post.find({$or: [{title: 'news'}, {content: 'announcement'}]},{title: 1, author: 1});",
    sql: "SELECT title, author FROM post WHERE (title = 'news' OR content = 'announcement');",
  },
  {
    name: '$or nested inside $and keeps its parentheses',
    mongo: 'db.u.find({$or: [{a: 1}, {$and: [{b: 2}, {c: 3}]}]});',
    sql: 'SELECT * FROM u WHERE (a = 1 OR (b = 2 AND c = 3));',
  },
  {
    name: 'a top-level field ANDs with a $or group rather than absorbing it',
    mongo: 'db.u.find({a: 1, $or: [{b: 2}, {c: 3}]});',
    sql: 'SELECT * FROM u WHERE a = 1 AND (b = 2 OR c = 3);',
  },
  {
    name: 'REGRESSION: every condition in a multi-field $or branch survives',
    mongo: 'db.u.find({$or: [{a: 1, b: 2}, {c: 3}]});',
    sql: 'SELECT * FROM u WHERE ((a = 1 AND b = 2) OR c = 3);',
  },
  {
    name: 'REGRESSION: a single multi-field $and branch keeps both conditions',
    mongo: 'db.u.find({$and: [{a: 1, b: 2}]});',
    sql: 'SELECT * FROM u WHERE (a = 1 AND b = 2);',
  },
  {
    name: 'two sibling groups stay independently parenthesised',
    mongo: 'db.u.find({$or: [{$and: [{a: 1}, {b: 2}]}, {$and: [{c: 3}, {d: 4}]}]});',
    sql: 'SELECT * FROM u WHERE ((a = 1 AND b = 2) OR (c = 3 AND d = 4));',
  },

  // --- null, booleans and numbers ------------------------------------------
  {
    name: 'null becomes IS NULL, never = NULL',
    mongo: 'db.u.find({name: null});',
    sql: 'SELECT * FROM u WHERE name IS NULL;',
  },
  {
    name: '$ne null becomes IS NOT NULL',
    mongo: 'db.u.find({name: {$ne: null}});',
    sql: 'SELECT * FROM u WHERE name IS NOT NULL;',
  },
  {
    name: 'true renders as a SQL boolean',
    mongo: 'db.u.find({active: true});',
    sql: 'SELECT * FROM u WHERE active = TRUE;',
  },
  {
    name: 'false renders as a SQL boolean',
    mongo: 'db.u.find({active: false});',
    sql: 'SELECT * FROM u WHERE active = FALSE;',
  },
  {
    name: 'floats keep their precision',
    mongo: 'db.u.find({a: 1.5});',
    sql: 'SELECT * FROM u WHERE a = 1.5;',
  },
  {
    name: 'negative numbers are not quoted',
    mongo: 'db.u.find({a: -3});',
    sql: 'SELECT * FROM u WHERE a = -3;',
  },
  {
    name: 'a numeric string stays a string literal',
    mongo: "db.u.find({a: '7'});",
    sql: "SELECT * FROM u WHERE a = '7';",
  },

  // --- string literal escaping (see also security.test.ts) -----------------
  {
    name: 'an apostrophe is doubled, not left to break the literal',
    mongo: `db.u.find({name: "O'Brien"});`,
    sql: "SELECT * FROM u WHERE name = 'O''Brien';",
  },
  {
    name: 'a parenthesis inside a string does not confuse the parser',
    mongo: "db.u.find({a: 'x)y'});",
    sql: "SELECT * FROM u WHERE a = 'x)y';",
  },
  {
    name: 'a comma inside a string does not split the arguments',
    mongo: "db.u.find({a: 'x, y'});",
    sql: "SELECT * FROM u WHERE a = 'x, y';",
  },

  // --- nested field paths ---------------------------------------------------
  {
    name: 'a dotted path is emitted verbatim',
    mongo: "db.user.find({'address.city': 'NY'});",
    sql: "SELECT * FROM user WHERE address.city = 'NY';",
  },
  {
    name: 'the _id rewrite applies per path segment',
    mongo: "db.u.find({'author._id': 3},{'author._id': 1});",
    sql: 'SELECT author.id FROM u WHERE author.id = 3;',
    removeUnderscoreBeforeId: true,
  },

  // --- empty filters and whitespace ----------------------------------------
  {
    name: 'an empty filter produces no WHERE clause',
    mongo: 'db.user.find({});',
    sql: 'SELECT * FROM user;',
  },
  {
    name: 'a missing filter produces no WHERE clause',
    mongo: 'db.user.find();',
    sql: 'SELECT * FROM user;',
  },
  {
    name: 'the trailing semicolon is optional',
    mongo: "db.task.find({title: 'john'})",
    sql: "SELECT * FROM task WHERE title = 'john';",
  },
  {
    name: 'surrounding and internal whitespace is tolerated',
    mongo: '  db.user.find(\n  { a: 1 },\n  { b: 1 }\n)  ;  ',
    sql: 'SELECT b FROM user WHERE a = 1;',
  },
];

describe('MongoDB to SQL translation table', () => {
  test.each(TABLE.map((row) => [row.name, row] as const))('%s', (_name, row) => {
    expect(convertToSQL(row.mongo, row.removeUnderscoreBeforeId ?? false)).toBe(row.sql);
  });

  test('the table itself has no duplicate cases', () => {
    const keys = TABLE.map((row) => `${row.mongo}|${row.removeUnderscoreBeforeId ?? false}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
