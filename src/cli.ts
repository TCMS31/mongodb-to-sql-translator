#!/usr/bin/env node
import { convertToSQL } from './index';
import { TranslationError } from './errors';

const USAGE = `Usage: mongo2sql [--id] "<query>"

Translate a MongoDB find() query into a SQL SELECT statement.

Arguments:
  <query>   A db.<collection>.find(<filter>, <projection>) statement.
            If omitted, the query is read from stdin.

Options:
  --id      Rewrite MongoDB's _id field to the SQL column name id.
  -h,--help Show this message.

Exit codes:
  0  translated successfully
  1  the query could not be translated
`;

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin as AsyncIterable<Buffer | string>) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

export const run = async (argv: string[]): Promise<number> => {
  if (argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(USAGE);
    return 0;
  }

  const removeUnderscoreBeforeId = argv.includes('--id');
  const positional = argv.filter((arg) => !arg.startsWith('-'));
  const query = positional.length > 0 ? positional.join(' ') : await readStdin();

  try {
    process.stdout.write(`${convertToSQL(query, removeUnderscoreBeforeId)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof TranslationError) {
      process.stderr.write(`error [${error.code}]: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
};

/* istanbul ignore next -- entry point, exercised by the CLI test via run(). */
if (require.main === module) {
  run(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: Error) => {
      process.stderr.write(`error: ${error.message}\n`);
      process.exit(1);
    }
  );
}
