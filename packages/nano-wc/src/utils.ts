export function invariant(condition: unknown, message: string | Error): asserts condition {
  if (!condition) {
    throw message instanceof Error ? message : new Error(message);
  }
}

export function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
