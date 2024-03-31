import { run } from '../src/cli';

/** Capture what the CLI writes, so exit codes and streams can be asserted. */
const captureRun = async (argv: string[]): Promise<{ code: number; out: string; err: string }> => {
  let out = '';
  let err = '';
  const stdout = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  const stderr = jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    err += String(chunk);
    return true;
  });
  try {
    const code = await run(argv);
    return { code, out, err };
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
};

describe('command line interface', () => {
  test('translates a query passed as an argument', async () => {
    const { code, out, err } = await captureRun(['db.user.find({age: {$gte: 21}},{name: 1});']);
    expect(code).toBe(0);
    expect(out).toBe('SELECT name FROM user WHERE age >= 21;\n');
    expect(err).toBe('');
  });

  test('--id rewrites _id to id', async () => {
    const { out } = await captureRun(['--id', 'db.user.find({_id: 1});']);
    expect(out).toBe('SELECT * FROM user WHERE id = 1;\n');
  });

  test('reports a translation failure on stderr and exits non-zero', async () => {
    const { code, out, err } = await captureRun(['db.user.find({a: {$exists: true}});']);
    expect(code).toBe(1);
    expect(out).toBe('');
    expect(err).toMatch(/^error \[UNSUPPORTED_OPERATOR\]:/);
  });

  test('--help prints usage and exits zero', async () => {
    const { code, out } = await captureRun(['--help']);
    expect(code).toBe(0);
    expect(out).toMatch(/Usage: mongo2sql/);
  });
});
