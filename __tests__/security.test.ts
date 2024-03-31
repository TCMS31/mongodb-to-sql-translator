import { convertToSQL } from '../src/index';

/**
 * The translator builds SQL by concatenating text, so values coming from a
 * MongoDB query are the injection surface. The original implementation wrapped
 * strings as `"'" + value + "'"` with no escaping, which let a crafted value
 * close the literal and append a second statement.
 */
/**
 * Remove every single-quoted SQL literal from a statement, treating `''` as an
 * escaped quote. What is left is the SQL structure; if a payload escaped its
 * literal, its text would show up here.
 */
const stripStringLiterals = (sql: string): string => {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    if (sql[i] !== "'") {
      out += sql[i];
      i += 1;
      continue;
    }
    i += 1; // opening quote
    let closed = false;
    while (i < sql.length) {
      if (sql[i] === "'") {
        if (sql[i + 1] === "'") {
          i += 2; // escaped quote, still inside the literal
          continue;
        }
        i += 1; // closing quote
        closed = true;
        break;
      }
      i += 1;
    }
    if (!closed) {
      throw new Error(`unterminated string literal in: ${sql}`);
    }
    out += "''";
  }
  return out;
};

describe('SQL injection through query values', () => {
  const STATEMENT_BREAKERS = [
    "x'; DROP TABLE users; --",
    "' OR '1'='1",
    "'; DELETE FROM users WHERE 'a'='a",
    "a' UNION SELECT password FROM admins --",
    "'",
    "''",
    "\\'",
  ];

  test.each(STATEMENT_BREAKERS)('value %j cannot break out of its literal', (payload) => {
    const sql = convertToSQL(`db.user.find({name: ${JSON.stringify(payload)}});`);

    // Every literal is terminated, and nothing from the payload leaks into the
    // statement structure: one SELECT, one trailing semicolon, no comment.
    const structure = stripStringLiterals(sql);
    expect(structure).toBe("SELECT * FROM user WHERE name = '';");
    expect(structure.match(/;/g)).toHaveLength(1);
    expect(structure).not.toMatch(/DROP|DELETE|UNION|--/i);

    // The payload survives as data, doubled per the SQL escaping rule.
    expect(sql).toContain(payload.replace(/'/g, "''"));
  });

  test('a payload is escaped identically inside $in', () => {
    expect(convertToSQL(`db.user.find({name: {$in: ["a'; DROP TABLE t; --", 'b']}});`)).toBe(
      "SELECT * FROM user WHERE name IN ('a''; DROP TABLE t; --', 'b');"
    );
  });

  test('a comment sequence stays inside the literal', () => {
    expect(convertToSQL("db.user.find({note: '-- not a comment'});")).toBe(
      "SELECT * FROM user WHERE note = '-- not a comment';"
    );
  });

  test('identifiers are validated rather than escaped, so they cannot carry SQL', () => {
    expect(() => convertToSQL(`db.user.find({"name; DROP TABLE users": 1});`)).toThrow(
      /Unsupported field name/
    );
    expect(() => convertToSQL(`db["user; DROP TABLE t"].find({a: 1});`)).toThrow();
  });
});
