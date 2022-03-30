/** Result type for representing nonfatal errors */
export type Result<T = unknown, Err = unknown> = OkResult<T> | ErrorResult<Err>;

/** Returned when an operation succeeds */
export type OkResult<T = undefined> = { status: 'ok'; value: T };

/** Returned when an operation fails */
export type ErrorResult<Err> = { status: 'error'; error: Err };

/** Convenience for creating an OkResult */
export function ok(): OkResult<object>;
export function ok<T>(value: T): OkResult<T>;
export function ok(value: unknown = {}): OkResult<unknown> {
  return { status: 'ok', value };
}

/** Convenience for creating an ErrorResult */
export function error<Err>(error: Err): ErrorResult<Err> {
  return { status: 'error', error };
}

/** Returns OkResult if a value is defined and non-null, otherwise returns an error object */
export function okIfExists<T>(
  value: T | undefined | null
): Result<T, FetchError> {
  if (value === undefined || value === null) {
    return {
      status: 'error',
      error: FetchError.DOES_NOT_EXIST
    };
  }

  return {
    status: 'ok',
    value
  };
}

export enum FetchError {
  /** The requested object does not exist */
  DOES_NOT_EXIST = 'DOES_NOT_EXIST'
}