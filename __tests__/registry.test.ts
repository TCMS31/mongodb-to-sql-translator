import { convertToSQL, registerOperator, supportedOperators, TranslationError } from '../src/index';

/**
 * The operator registry is the extension seam: a new MongoDB operator should
 * be one handler and one registration, with no edit to the parser, the filter
 * walker or the SQL builder.
 *
 * Jest gives each test file its own module registry, so registering here does
 * not leak into the other suites.
 */
describe('operator registry', () => {
  test('$nin is unsupported out of the box', () => {
    expect(() => convertToSQL('db.u.find({a: {$nin: [1, 2]}});')).toThrow(TranslationError);
  });

  test('registering a handler is enough to support a new operator', () => {
    registerOperator({
      name: '$nin',
      build: (field, operand) => ({
        kind: 'group',
        connective: 'AND',
        conditions: (operand as number[]).map((value) => ({
          kind: 'comparison',
          field,
          operator: '!=',
          value,
        })),
      }),
    });

    expect(convertToSQL('db.u.find({a: {$nin: [1, 2]}});')).toBe(
      'SELECT * FROM u WHERE (a != 1 AND a != 2);'
    );
    expect(supportedOperators()).toContain('$nin');
  });

  test('the built-in operators are registered', () => {
    expect(supportedOperators()).toEqual(
      expect.arrayContaining(['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in'])
    );
  });
});
