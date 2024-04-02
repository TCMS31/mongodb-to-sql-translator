# Benchmark

The only unbounded input dimension is the number of conditions in a single
filter, so that is what is measured. Reproduce with `npm run bench`.

Captured 2026-09-25 on Node v22.22.3, Apple Silicon, macOS 25.4.

```console
$ npm run bench
> mongodb-to-sql-translator@1.0.0 bench
> ts-node scripts/benchmark.ts
┌─────────┬────────────┬──────────┬──────────────┐
│ (index) │ conditions │ ms/query │ us/condition │
├─────────┼────────────┼──────────┼──────────────┤
│ 0       │ 10         │ '0.040'  │ '4.017'      │
│ 1       │ 100        │ '0.192'  │ '1.922'      │
│ 2       │ 1000       │ '1.883'  │ '1.883'      │
│ 3       │ 5000       │ '11.162' │ '2.232'      │
│ 4       │ 10000      │ '23.196' │ '2.320'      │
└─────────┴────────────┴──────────┴──────────────┘
```

Cost per condition is flat from 100 to 10,000 conditions (~2 microseconds),
i.e. translation is linear in the size of the filter.

## What changed

The previous implementation accumulated every intermediate list with
`reduce((prev, curr) => [...prev, curr], [])`, in five places. That idiom
reallocates the whole array on each step and is quadratic:

| conditions | `[...prev, x]` in reduce | `push` |
| ---------: | -----------------------: | -----: |
|        100 |                 0.018 ms | 0.0026 ms |
|      1 000 |                 0.568 ms | 0.0027 ms |
|      5 000 |                12.529 ms | 0.0132 ms |
|     10 000 |                46.043 ms | 0.0232 ms |

(Measured with a standalone micro-benchmark of the two idioms on the same
machine: a 10x increase in size costs 81x the time for the spread form.)
