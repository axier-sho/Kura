import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertInside, isInside } from "@/lib/workspace/paths";

let work: string; // the "working directory" (sandbox root)
let outside: string; // a sibling directory, outside the sandbox

// Symlink creation needs elevation on stock Windows; detect support so the
// symlink-escape case can skip there while still running on Linux CI / macOS.
let symlinkSupported = false;

beforeAll(() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "kura-paths-"));
  work = path.join(base, "work");
  outside = path.join(base, "outside");
  fs.mkdirSync(work, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, "secret.txt"), "top secret");
  try {
    fs.symlinkSync(outside, path.join(work, "escape"), "dir");
    symlinkSupported = true;
  } catch {
    symlinkSupported = false;
  }
});

afterAll(() => {
  // Best-effort cleanup of the temp tree (parent of `work`).
  try {
    fs.rmSync(path.dirname(work), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe("isInside", () => {
  it("treats the directory itself as inside", () => {
    expect(isInside(work, work)).toBe(true);
  });

  it("accepts a nested path", () => {
    expect(isInside(work, path.join(work, "a", "b.txt"))).toBe(true);
  });

  it("rejects a sibling that merely shares a name prefix", () => {
    // `${work}-evil` starts with `work` as a string but is NOT nested.
    expect(isInside(work, `${work}-evil`)).toBe(false);
    expect(isInside(work, outside)).toBe(false);
  });
});

describe("assertInside", () => {
  it("resolves a relative candidate against the working dir", () => {
    expect(assertInside(work, "sub/file.txt")).toBe(
      path.resolve(work, "sub/file.txt"),
    );
  });

  it("accepts an absolute path already inside", () => {
    const p = path.join(work, "ok.txt");
    expect(assertInside(work, p)).toBe(path.resolve(p));
  });

  it("rejects a `..` traversal escape", () => {
    expect(() => assertInside(work, "../escaped.txt")).toThrow();
    expect(() => assertInside(work, path.join(work, "..", "x"))).toThrow();
  });

  it("rejects an absolute path outside the working dir", () => {
    expect(() => assertInside(work, path.join(outside, "secret.txt"))).toThrow();
  });

  it.skipIf(!symlinkSupported)(
    "rejects a path that escapes via a symlinked subfolder",
    () => {
      // `work/escape` is a symlink to `outside`; a path through it resolves
      // outside the sandbox and must be rejected.
      const viaLink = path.join(work, "escape", "secret.txt");
      expect(isInside(work, viaLink)).toBe(false);
      expect(() => assertInside(work, viaLink)).toThrow();
    },
  );
});
