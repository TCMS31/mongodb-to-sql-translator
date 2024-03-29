/**
 * Error codes surfaced by the translator.
 *
 * The translator never returns a partially-built statement: any input it cannot
 * translate faithfully raises a `TranslationError`. Emitting "best effort" SQL
 * for a query we did not fully understand is worse than failing, because the
 * caller would run a statement whose semantics differ from the MongoDB query.
 */
export type TranslationErrorCode =
  | 'EMPTY_INPUT'
  | 'MALFORMED_QUERY'
  | 'UNSUPPORTED_METHOD'
  | 'UNSUPPORTED_OPERATOR'
  | 'UNSUPPORTED_VALUE'
  | 'INVALID_IDENTIFIER'
  | 'INVALID_PROJECTION';

/** Raised for every input the translator declines to translate. */
export class TranslationError extends Error {
  public readonly code: TranslationErrorCode;

  constructor(code: TranslationErrorCode, message: string) {
    super(message);
    this.name = 'TranslationError';
    this.code = code;
    // Required so `instanceof` works when compiling down to ES5 targets.
    Object.setPrototypeOf(this, TranslationError.prototype);
  }
}
