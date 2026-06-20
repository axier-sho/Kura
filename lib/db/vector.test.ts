import { describe, it, expect } from "vitest";
import { cosine } from "@/lib/db/vector";

describe("cosine", () => {
  it("is 1 for identical (parallel) vectors", () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
    expect(cosine([1, 0], [2, 0])).toBeCloseTo(1, 10); // same direction, scaled
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("is -1 for opposite vectors", () => {
    expect(cosine([1, 2], [-1, -2])).toBeCloseTo(-1, 10);
  });

  it("returns 0 when either vector is all-zero (degenerate)", () => {
    expect(cosine([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosine([1, 2, 3], [0, 0, 0])).toBe(0);
    expect(cosine([], [])).toBe(0);
  });

  it("throws on a dimension mismatch rather than silently truncating", () => {
    expect(() => cosine([1, 2, 3], [1, 2])).toThrow(/dimension mismatch/);
  });
});
