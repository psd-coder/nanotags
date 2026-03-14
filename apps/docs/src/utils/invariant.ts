// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Newable<T> = new (...args: any[]) => T;

export function invariant(
  condition: unknown,
  message: string,
  ErrorClass: Newable<Error> = Error,
): asserts condition {
  if (!condition) {
    throw new ErrorClass(message);
  }
}
