import { describe, expect, it } from "vitest";

import { invariant } from "./utils";

describe("invariant", () => {
  it("throws Error with string message when falsy", () => {
    expect(() => invariant(false, "boom")).toThrow(new Error("boom"));
  });

  it("re-throws provided Error instance when falsy", () => {
    const err = new TypeError("typed");
    expect(() => invariant(false, err as unknown as Error)).toThrow(err);
  });

  it("does not throw when truthy", () => {
    expect(() => invariant(true, "unreachable")).not.toThrow();
    expect(() => invariant(1, "unreachable")).not.toThrow();
    expect(() => invariant("yes", "unreachable")).not.toThrow();
  });
});
