# Generated SQL executed against SQLite

The translation table in `__tests__/translation-table.test.ts` asserts the exact
SQL string. This transcript goes one step further: it seeds a real SQLite
database, runs the *generated* statement, and shows the rows that come back, so
the output is demonstrably valid, executable SQL and not just an expected string.

Reproduce with `npx ts-node scripts/verify-against-sqlite.ts` (needs the
`sqlite3` CLI). Captured 2026-09-25.

Seed data:

```sql
CREATE TABLE users (id INTEGER, name TEXT, age INTEGER, city TEXT, active BOOLEAN);
INSERT INTO users VALUES
  (1, 'ada',      36, 'london', 1),
  (2, 'grace',    45, 'nyc',    1),
  (3, 'alan',     41, 'london', 0),
  (4, 'O''Brien', 29, 'dublin', 1),
  (5, 'margaret', NULL, 'nyc',  1);
```

```console
$ npx ts-node scripts/verify-against-sqlite.ts
# everyone
mongo : db.users.find({})
sql   : SELECT * FROM users;
rows  | id  name      age  city    active
rows  | --  --------  ---  ------  ------
rows  | 1   ada       36   london  1     
rows  | 2   grace     45   nyc     1     
rows  | 3   alan      41   london  0     
rows  | 4   O'Brien   29   dublin  1     
rows  | 5   margaret       nyc     1

# at least 40
mongo : db.users.find({age: {$gte: 40}}, {name: 1, age: 1})
sql   : SELECT name, age FROM users WHERE age >= 40;
rows  | name   age
rows  | -----  ---
rows  | grace  45 
rows  | alan   41

# not in london
mongo : db.users.find({city: {$ne: 'london'}}, {name: 1})
sql   : SELECT name FROM users WHERE city != 'london';
rows  | name    
rows  | --------
rows  | grace   
rows  | O'Brien 
rows  | margaret

# londoners over 40, or grace
mongo : db.users.find({$or: [{city: 'london', age: {$gt: 40}}, {name: 'grace'}]}, {name: 1})
sql   : SELECT name FROM users WHERE ((city = 'london' AND age > 40) OR name = 'grace');
rows  | name 
rows  | -----
rows  | grace
rows  | alan

# name in a set
mongo : db.users.find({name: {$in: ['ada', 'alan']}}, {name: 1})
sql   : SELECT name FROM users WHERE name IN ('ada', 'alan');
rows  | name
rows  | ----
rows  | ada 
rows  | alan

# empty $in matches nothing
mongo : db.users.find({name: {$in: []}}, {name: 1})
sql   : SELECT name FROM users WHERE 1 = 0;
rows  | (none)

# missing age
mongo : db.users.find({age: null}, {name: 1})
sql   : SELECT name FROM users WHERE age IS NULL;
rows  | name    
rows  | --------
rows  | margaret

# an apostrophe in the data
mongo : db.users.find({name: "O'Brien"}, {name: 1, city: 1})
sql   : SELECT name, city FROM users WHERE name = 'O''Brien';
rows  | name     city  
rows  | -------  ------
rows  | O'Brien  dublin

# an injection payload is treated as data
mongo : db.users.find({name: "x'; DROP TABLE users; --"}, {name: 1})
sql   : SELECT name FROM users WHERE name = 'x''; DROP TABLE users; --';
rows  | (none)

# the users table still exists after the injection payload ran
rows  | name 
rows  | -----
rows  | users
```

## Why the `$or` case matters

`db.users.find({$or: [{city: 'london', age: {$gt: 40}}, {name: 'grace'}]})`
returns **grace** and **alan** above.

The previous implementation kept only the first condition of each `$or` branch,
so it emitted `WHERE (city = 'london' OR name = 'grace')`. Run against the same
seed data that returns **ada, grace, alan** - one extra row that does not match
the MongoDB query. That is the class of bug this rewrite targets: wrong rows,
no error, no warning.
