# MongoDB → SQL translator

`db.user.find({age: {$gte: 21}}, {name: 1})` in, `SELECT name FROM user WHERE age >= 21;` out. A
TypeScript library with a small CLI on top: no MongoDB driver, no SQL driver, no network — the whole
product is one pure string-to-string function. The only property that matters for a translator is
whether the SQL means what the MongoDB meant, so it is fail-closed: anything it cannot translate
faithfully raises a `TranslationError` rather than best-effort SQL that returns the wrong rows.

## Try it

```bash
npm install && npm run build
node dist/cli.js --id 'db.user.find({age: {$gte: 21}}, {name: 1, _id: 1})'
# SELECT name, id FROM user WHERE age >= 21;
```

`--id` rewrites MongoDB's `_id` to the `id` column name most relational schemas use. Exit code is
`0` on a translation and `1` on a refusal; omit the positional argument and the query is read from
stdin. `npm run dev -- "db.user.find({title: 'john'})"` skips the build.

```typescript
import { convertToSQL, TranslationError } from 'mongodb-to-sql-translator';
convertToSQL('db.user.find({_id: 23113}, {name: 1})', true); // → SELECT name FROM user WHERE id = 23113;
// second argument = the --id rewrite; a TranslationError (with .code) is thrown, never partial SQL
```

## What it translates

This table is the specification, not a sample. `__tests__/translation-table.test.ts` holds the same rows
— 39 of them — and asserts the exact output string; [`docs/sql-execution.md`](docs/sql-execution.md)
then executes that generated SQL against a seeded SQLite database and prints the rows, because a string
comparison alone cannot tell you a statement is valid SQL.

| MongoDB query                                          | Generated SQL                                         |
| ------------------------------------------------------ | ----------------------------------------------------- |
| `db.user.find({})`                                     | `SELECT * FROM user;`                                 |
| `db.u.find({}, {a: 1, b: 0, c: 1})`                    | `SELECT a, c FROM u;`                                 |
| `db.u.find({age: {$gt: 1, $lt: 5}})`                   | `SELECT * FROM u WHERE age > 1 AND age < 5;`          |
| `db.user.find({age: {$in: [25, 30]}}, {name: 1})`      | `SELECT name FROM user WHERE age IN (25, 30);`        |
| `db.u.find({a: {$in: []}})`                            | `SELECT * FROM u WHERE 1 = 0;`                        |
| `db.u.find({$or: [{a: 1, b: 2}, {c: 3}]})`             | `SELECT * FROM u WHERE ((a = 1 AND b = 2) OR c = 3);` |
| `db.u.find({$or: [{a: 1}, {$and: [{b: 2}, {c: 3}]}]})` | `SELECT * FROM u WHERE (a = 1 OR (b = 2 AND c = 3));` |
| `db.u.find({name: null})`                              | `SELECT * FROM u WHERE name IS NULL;`                 |
| `db.u.find({name: {$ne: null}})`                       | `SELECT * FROM u WHERE name IS NOT NULL;`             |
| `db.u.find({name: "O'Brien"})`                         | `SELECT * FROM u WHERE name = 'O''Brien';`            |

The `$or` row is why this rewrite exists. The version before it kept only the **first** condition of
each `$and`/`$or` branch, so `{$or: [{a: 1, b: 2}, {c: 3}]}` emitted `(a = 1 OR c = 3)` — `b: 2`
gone, no error, no warning. Against the seed data in [`docs/sql-execution.md`](docs/sql-execution.md)
the old SQL returns 3 rows where the MongoDB query matches 2. It also produced `WHERE ;` for `{}`, the
syntax error `IN ()` for an empty `$in`, `name = ;` for `null`, and the literal string `undefined` for
any unmapped operator. Of 45 probe inputs run against the original code, **23 were wrong.**

## What it refuses

Every refusal is a named code; `__tests__/rejections.test.ts` pins one case each, and
[`docs/cli-transcript.md`](docs/cli-transcript.md) is the transcript with exit codes.

| Input                                                      | `TranslationError.code` |
| ---------------------------------------------------------- | ----------------------- |
| `db.user.insert({a: 1})`, `db.user.find({}).limit(10)`     | `UNSUPPORTED_METHOD`    |
| `db.user.find({name: {$exists: true}})`                    | `UNSUPPORTED_OPERATOR`  |
| `db.user.find({a: [1, 2]})`, `db.u.find({a: {$gt: null}})` | `UNSUPPORTED_VALUE`     |
| `db.user.find({"x'; DROP TABLE t; --": 1})`                | `INVALID_IDENTIFIER`    |
| `db.user.find({a: 1}, {b: 2})`                             | `INVALID_PROJECTION`    |
| `user.find({a: 1})`, `db.user.find({a: 1}`                 | `MALFORMED_QUERY`       |

## It used to be SQL-injectable

The original built string literals as `"'" + operand + "'"` with no escaping at all, so a value could
close its own literal and append a second statement — and a bare apostrophe alone broke it.

```
in   db.user.find({name: "x'; DROP TABLE users; --"})
old  SELECT * FROM user WHERE name = 'x'; DROP TABLE users; --';
new  SELECT * FROM user WHERE name = 'x''; DROP TABLE users; --';
```

The fix splits a problem the original conflated. **Values** are escaped, quotes doubled, in exactly
one function (`src/sql/literals.ts`) — the only place in the codebase that turns caller-supplied text
into SQL. **Identifiers** are not escaped, because escaping them would mean committing to a quoting
dialect; they are validated against `^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$` and rejected
outright, so an attacker-controlled field name never reaches the output at all. Both halves are proved
rather than asserted: `__tests__/security.test.ts` strips properly-escaped literals with a scanner and
asserts on the remaining statement _structure_, and [`docs/sql-execution.md`](docs/sql-execution.md)
runs the payload above against a live SQLite database, then shows the `users` table still standing.

## Three stages, one AST

`translator/ast.ts` names no MongoDB operator and no SQL keyword. That is what keeps the halves
apart: the SQL writer never sees MongoDB syntax, the parser never sees SQL.

```
cli.ts / library import ─▶ index.ts ─▶ MongoDBToSQLTranslator.ts
  1. parse    parser/queryParser.ts     text → collection, filter, projection
  2. analyse  translator/filter.ts      filter → ConditionNode[]  (via operators.ts)
  3. render   translator/sqlBuilder.ts  ConditionNode[] → SQL     (via sql/*)
```

The one extension seam is the operator registry (`src/translator/operators.ts`): a new operator is one
`OperatorHandler` and one `registerOperator` call, nothing else — `registry.test.ts` proves it by
asserting `$nin` is rejected, registering it at runtime, then asserting the SQL it emits, which is also
why it was safe _not_ to ship the missing operators.

## Not supported, on purpose

- **`find()` only** — no `insert`, `update`, `aggregate`, `count`, `distinct`; no cursor methods
  either, so `.limit()`, `.skip()` and `.sort()` are refused and no `LIMIT`/`ORDER BY` is generated.
- **Operators are `$and $or $eq $ne $gt $gte $lt $lte $in`** — everything else (`$nin`, `$nor`,
  `$not`, `$exists`, `$regex`, `$elemMatch`, array and geo) is refused by name.
- **No dialect switch, and identifiers are emitted unquoted**, so `db.order.find(...)` yields
  `FROM order`, a reserved word some engines reject. Quoting means picking a dialect; output is
  verified against SQLite, and `TRUE`/`FALSE` and `!=` suit PostgreSQL and MySQL too.
- **Dotted paths pass through verbatim** — `address.city` is SQL's _table_._column_, correct only if
  the documents were flattened that way. Projections are inclusion-only (`0` keys ignored, so pure
  exclusion yields `SELECT *`), and there are no joins, no `$lookup`, no schema knowledge.

## Working on it

```bash
npm run verify   # typecheck + eslint + prettier --check + jest, what CI should run
npm run bench    # translation cost vs filter size
npx ts-node scripts/verify-against-sqlite.ts   # execute generated SQL for real (needs sqlite3)
```

102 tests across 6 files, 96.6% statements and 88.5% branches, thresholds enforced in `jest.config.ts`
so coverage cannot rot silently. `__tests__/index.test.ts` is the exercise's original seven acceptance
cases, kept verbatim — the proof the rewrite preserved the happy path.

The only unbounded input is the number of conditions in one filter, so that is the one thing measured:
~2 µs per condition, flat from 100 to 10,000. The previous implementation accumulated intermediates
with `reduce((prev, curr) => [...prev, curr], [])` in five places, which is quadratic — a 10× size
increase cost 81× the time ([`docs/benchmark.md`](docs/benchmark.md)). `Dockerfile` and
`docker-compose.yml` are committed and `docker compose config` parses cleanly, but the image has
**never been built** — treat it as unverified; there is no service to run in any case.

## Origin

A take-home exercise for Glassdoor, kept scoped to that brief: `find()` queries, no product features
bolted on. ISC licensed.
