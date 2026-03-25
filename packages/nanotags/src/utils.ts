export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function camelToKebab(str: string): string {
  return str.replaceAll(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
