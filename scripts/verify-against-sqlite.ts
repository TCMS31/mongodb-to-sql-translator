/**
 * End-to-end check: the SQL this translator emits is not merely the expected
 * string, it is valid SQL that a real engine executes and that returns the rows
 * the MongoDB query would have matched.
 *
 * Requires the `sqlite3` CLI on PATH. Run with:
 *   npx ts-node scripts/verify-against-sqlite.ts
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { convertToSQL } from '../src/index';

const SEED = `
CREATE TABLE users (id INTEGER, name TEXT, age INTEGER, city TEXT, active BOOLEAN);
INSERT INTO users VALUES
  (1, 'ada',     36, 'london', 1),
  (2, 'grace',   45, 'nyc',    1),
  (3, 'alan',    41, 'london', 0),
  (4, "O'Brien", 29, 'dublin', 1),
  (5, 'margaret', NULL, 'nyc',  1);
`;

const CASES: ReadonlyArray<readonly [string, string]> = [
  ['everyone', 'db.users.find({})'],
  ['at least 40', 'db.users.find({age: {$gte: 40}}, {name: 1, age: 1})'],
  ['not in london', "db.users.find({city: {$ne: 'london'}}, {name: 1})"],
  [
    'londoners over 40, or grace',
    "db.users.find({$or: [{city: 'london', age: {$gt: 40}}, {name: 'grace'}]}, {name: 1})",
  ],
  ['name in a set', "db.users.find({name: {$in: ['ada', 'alan']}}, {name: 1})"],
  ['empty $in matches nothing', 'db.users.find({name: {$in: []}}, {name: 1})'],
  ['missing age', 'db.users.find({age: null}, {name: 1})'],
  ['an apostrophe in the data', `db.users.find({name: "O'Brien"}, {name: 1, city: 1})`],
  [
    'an injection payload is treated as data',
    `db.users.find({name: "x'; DROP TABLE users; --"}, {name: 1})`,
  ],
];

const main = (): void => {
  const dir = mkdtempSync(join(tmpdir(), 'mongo2sql-'));
  const db = join(dir, 'demo.db');
  const sqlite = (sql: string): string =>
    execFileSync('sqlite3', ['-header', '-column', db, sql], { encoding: 'utf8' }).trimEnd();

  try {
    sqlite(SEED);
    const lines: string[] = [];
    for (const [label, mongo] of CASES) {
      const sql = convertToSQL(mongo, true);
      const rows = sqlite(sql);
      lines.push(`# ${label}`);
      lines.push(`mongo : ${mongo}`);
      lines.push(`sql   : ${sql}`);
      lines.push(rows.length > 0 ? rows.replace(/^/gm, 'rows  | ') : 'rows  | (none)');
      lines.push('');
    }
    lines.push('# the users table still exists after the injection payload ran');
    lines.push(
      sqlite("SELECT name FROM sqlite_master WHERE type='table';").replace(/^/gm, 'rows  | ')
    );
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

main();
