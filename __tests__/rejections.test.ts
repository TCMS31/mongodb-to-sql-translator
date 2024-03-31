import { convertToSQL, TranslationError, TranslationErrorCode } from '../src/index';

/**
 * A translator that emits "best effort" SQL for a query it did not understand
 * is worse than one that fails: the caller runs a statement whose semantics
 * differ from the MongoDB query and gets wrong rows back, silently.
 *
 * Every row here is an input the translator must refuse, with the error code
 * that explains why.
 */
const REJECTIONS: ReadonlyArray<readonly [string, string, TranslationErrorCode]> = [
  // --- structure ------------------------------------------------------------
  ['empty input', '', 'EMPTY_INPUT'],
  ['whitespace only', '   ', 'EMPTY_INPUT'],
  ['missing db prefix', 'user.find({a: 1})', 'MALFORMED_QUERY'],
  ['missing collection name', 'db..find({a: 1})', 'MALFORMED_QUERY'],
  ['unbalanced parentheses', 'db.user.find({a: 1}', 'MALFORMED_QUERY'],
  ['not a call at all', 'db.user.find', 'MALFORMED_QUERY'],
  ['unparseable arguments', 'db.user.find({name: /joh/});', 'MALFORMED_QUERY'],
  ['more than two arguments', 'db.user.find({a: 1},{b: 1},{c: 1});', 'MALFORMED_QUERY'],
  ['filter is not an object', 'db.user.find([1, 2]);', 'MALFORMED_QUERY'],

  // --- methods we do not translate -----------------------------------------
  ['a write method', 'db.user.insert({a: 1});', 'UNSUPPORTED_METHOD'],
  ['aggregate', 'db.user.aggregate([]);', 'UNSUPPORTED_METHOD'],
  ['chained .limit()', 'db.user.find({}).limit(10);', 'UNSUPPORTED_METHOD'],
  ['chained .sort()', 'db.user.find({}).sort({age: -1});', 'UNSUPPORTED_METHOD'],
  ['chained .skip().limit()', 'db.user.find({}).skip(5).limit(10);', 'UNSUPPORTED_METHOD'],

  // --- operators we do not translate ---------------------------------------
  ['$exists', 'db.user.find({name: {$exists: true}});', 'UNSUPPORTED_OPERATOR'],
  ['$nin', 'db.user.find({age: {$nin: [1, 2]}});', 'UNSUPPORTED_OPERATOR'],
  ['$nor', 'db.user.find({$nor: [{a: 1}, {b: 2}]});', 'UNSUPPORTED_OPERATOR'],
  ['$not', 'db.user.find({age: {$not: {$gt: 5}}});', 'UNSUPPORTED_OPERATOR'],
  ['$regex', "db.user.find({name: {$regex: '^j'}});", 'UNSUPPORTED_OPERATOR'],
  ['$expr', 'db.user.find({$expr: {a: 1}});', 'UNSUPPORTED_OPERATOR'],

  // --- values with no faithful SQL equivalent -------------------------------
  ['array equality', 'db.user.find({a: [1, 2]});', 'UNSUPPORTED_VALUE'],
  ['sub-document equality', 'db.user.find({a: {b: 1}});', 'UNSUPPORTED_VALUE'],
  ['$eq against a sub-document', 'db.user.find({a: {$eq: {b: 1}}});', 'UNSUPPORTED_VALUE'],
  ['$gt against null', 'db.user.find({a: {$gt: null}});', 'UNSUPPORTED_VALUE'],
  ['$in against a non-array', 'db.user.find({a: {$in: 5}});', 'UNSUPPORTED_VALUE'],
  ['$in containing null', 'db.user.find({a: {$in: [1, null]}});', 'UNSUPPORTED_VALUE'],
  ['Infinity', 'db.user.find({a: Infinity});', 'UNSUPPORTED_VALUE'],
  ['NaN', 'db.user.find({a: NaN});', 'UNSUPPORTED_VALUE'],

  // --- malformed logical operators -----------------------------------------
  ['$or with an empty array', 'db.user.find({$or: []});', 'MALFORMED_QUERY'],
  ['$or with a non-array operand', 'db.user.find({$or: {a: 1}});', 'MALFORMED_QUERY'],
  ['an empty operator object', 'db.user.find({a: {}});', 'MALFORMED_QUERY'],

  // --- identifiers ----------------------------------------------------------
  ['a field name with a space', "db.user.find({'a b': 1});", 'INVALID_IDENTIFIER'],
  ['a field name carrying SQL', `db.user.find({"x'; DROP TABLE t; --": 1});`, 'INVALID_IDENTIFIER'],
  [
    'a projection key carrying SQL',
    `db.user.find({}, {"a; DROP TABLE t": 1});`,
    'INVALID_IDENTIFIER',
  ],

  // --- projection -----------------------------------------------------------
  ['a projection value that is not 0 or 1', 'db.user.find({a: 1},{b: 2});', 'INVALID_PROJECTION'],
  ['a projection that is not an object', 'db.user.find({a: 1}, 5);', 'INVALID_PROJECTION'],
];

describe('inputs the translator must refuse', () => {
  test.each(REJECTIONS)('%s', (_name, mongo, code) => {
    expect(() => convertToSQL(mongo)).toThrow(TranslationError);
    try {
      convertToSQL(mongo);
      throw new Error('expected convertToSQL to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(TranslationError);
      expect((error as TranslationError).code).toBe(code);
      expect((error as TranslationError).message).not.toMatch(/undefined|\[object Object\]/);
    }
  });

  test('a non-string input is a programming error, not a translation error', () => {
    expect(() => convertToSQL(42 as unknown as string)).toThrow(TypeError);
  });

  test('the unsupported-operator message lists what is supported', () => {
    expect(() => convertToSQL('db.u.find({a: {$exists: true}});')).toThrow(
      /Supported: \$and, \$eq, \$gt, \$gte, \$in, \$lt, \$lte, \$ne, \$or\./
    );
  });
});
