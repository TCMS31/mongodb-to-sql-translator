# CLI transcript

Captured by running the built CLI (`npm run build`, then `node dist/cli.js`) on
2026-09-25. Every line below is literal output.

```console
$ node dist/cli.js --id "db.user.find({age: {$gte: 21}}, {name: 1, _id: 1})"
SELECT name, id FROM user WHERE age >= 21;
# exit 0

$ node dist/cli.js --id "db.order.find({$and: [{status: 'placed'}, {total: {$gt: 100}}]}, {_id: 0, customer: 1})"
SELECT customer FROM order WHERE (status = 'placed' AND total > 100);
# exit 0

$ node dist/cli.js --id "db.u.find({$or: [{a: 1, b: 2}, {c: 3}]})"
SELECT * FROM u WHERE ((a = 1 AND b = 2) OR c = 3);
# exit 0

$ node dist/cli.js --id "db.user.find({a: 1, $or: [{b: 2}, {c: 3}]})"
SELECT * FROM user WHERE a = 1 AND (b = 2 OR c = 3);
# exit 0

$ node dist/cli.js --id "db.user.find({})"
SELECT * FROM user;
# exit 0

$ node dist/cli.js --id "db.user.find({a: {$in: []}})"
SELECT * FROM user WHERE 1 = 0;
# exit 0

$ node dist/cli.js --id "db.user.find({name: null})"
SELECT * FROM user WHERE name IS NULL;
# exit 0

$ node dist/cli.js --id "db.user.find({'address.city': 'NY'})"
SELECT * FROM user WHERE address.city = 'NY';
# exit 0

$ node dist/cli.js --id "db.user.find({name: "x'; DROP TABLE users; --"})"
SELECT * FROM user WHERE name = 'x''; DROP TABLE users; --';
# exit 0

```

## Queries the translator refuses

A translator that emits best-effort SQL for a query it did not understand
returns the wrong rows silently. These inputs fail loudly instead.

```console
$ node dist/cli.js "db.user.find({name: {$exists: true}})"
error [UNSUPPORTED_OPERATOR]: Unsupported MongoDB operator "$exists". Supported: $and, $eq, $gt, $gte, $in, $lt, $lte, $ne, $or.
# exit 1

$ node dist/cli.js "db.user.find({age: {$nin: [1, 2]}})"
error [UNSUPPORTED_OPERATOR]: Unsupported MongoDB operator "$nin". Supported: $and, $eq, $gt, $gte, $in, $lt, $lte, $ne, $or.
# exit 1

$ node dist/cli.js "db.user.find({}).limit(10)"
error [UNSUPPORTED_METHOD]: Cursor method .limit() is not supported; only a bare find() call can be translated.
# exit 1

$ node dist/cli.js "db.user.find({}).sort({age: -1})"
error [UNSUPPORTED_METHOD]: Cursor method .sort() is not supported; only a bare find() call can be translated.
# exit 1

$ node dist/cli.js "db.user.insert({a: 1})"
error [UNSUPPORTED_METHOD]: Only find() is supported; received insert().
# exit 1

$ node dist/cli.js "db.user.find({a: [1, 2]})"
error [UNSUPPORTED_VALUE]: Field "a" is matched against an array. MongoDB array matching has no direct SQL equivalent; use $in for "any of these values".
# exit 1

$ node dist/cli.js "db.user.find({a: {$gt: null}})"
error [UNSUPPORTED_VALUE]: Operator $gt on field "a" cannot be applied to null.
# exit 1

$ node dist/cli.js "db.user.find({"x'; DROP TABLE t; --": 1})"
error [INVALID_IDENTIFIER]: Unsupported field name: "x'; DROP TABLE t; --". Expected letters, digits and underscores, optionally dot-separated.
# exit 1

$ node dist/cli.js "db.user.find({a: 1}, {b: 2})"
error [INVALID_PROJECTION]: Projection value for "b" must be 0 or 1, received 2.
# exit 1

$ node dist/cli.js "user.find({a: 1})"
error [MALFORMED_QUERY]: Expected a query of the form db.<collection>.find(<filter>, <projection>).
# exit 1

```
