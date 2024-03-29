/**
 * Throughput check for the translator.
 *
 * The only input size that grows without bound here is the number of
 * conditions in a filter, so that is what this measures: a single query
 * holding N conditions inside one $or, translated repeatedly.
 *
 * Run with: npx ts-node scripts/benchmark.ts
 */
import { convertToSQL } from '../src/index';

const buildQuery = (conditionCount: number): string => {
  const branches = Array.from({ length: conditionCount }, (_, i) => `{field${i}: ${i}}`).join(', ');
  return `db.events.find({$or: [${branches}]});`;
};

const timeTranslation = (conditionCount: number, iterations: number): number => {
  const query = buildQuery(conditionCount);
  convertToSQL(query); // warm up
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) {
    convertToSQL(query);
  }
  const elapsedNs = Number(process.hrtime.bigint() - start);
  return elapsedNs / iterations / 1e6;
};

const main = (): void => {
  const rows = [10, 100, 1000, 5000, 10000].map((conditionCount) => {
    const iterations = conditionCount >= 5000 ? 20 : 200;
    const msPerQuery = timeTranslation(conditionCount, iterations);
    return {
      conditions: conditionCount,
      'ms/query': msPerQuery.toFixed(3),
      'us/condition': ((msPerQuery * 1000) / conditionCount).toFixed(3),
    };
  });
  // eslint-disable-next-line no-console
  console.table(rows);
};

main();
