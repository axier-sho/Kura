import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sanitizeFolderName, uniqueDestPath } from "@/lib/workspace/fs";

describe("sanitizeFolderName", () => {
  it("keeps a normal name unchanged", () => {
    expect(sanitizeFolderName("契約書")).toBe("契約書");
    expect(sanitizeFolderName("Invoices 2026")).toBe("Invoices 2026");
  });

  it("preserves spaces and hyphens", () => {
    expect(sanitizeFolderName("my - folder")).toBe("my - folder");
  });

  it("turns path separators into spaces (no nesting)", () => {
    expect(sanitizeFolderName("a/b\\c")).toBe("a b c");
  });

  it("strips OS-illegal characters", () => {
    expect(sanitizeFolderName('a<b>c:d"e|f?g*h')).toBe("abcdefgh");
  });

  it("removes control characters", () => {
    const ctrl = "a" + String.fromCharCode(1) + "b" + String.fromCharCode(31) + "c";
    expect(sanitizeFolderName(ctrl)).toBe("abc");
  });

  it("collapses runs of whitespace and trims", () => {
    expect(sanitizeFolderName("  a    b  ")).toBe("a b");
  });

  it("throws on names that reduce to empty / dot / dot-dot", () => {
    expect(() => sanitizeFolderName("")).toThrow();
    expect(() => sanitizeFolderName("   ")).toThrow();
    expect(() => sanitizeFolderName(".")).toThrow();
    expect(() => sanitizeFolderName("..")).toThrow();
    expect(() => sanitizeFolderName("///")).toThrow();
  });
});

describe("uniqueDestPath", () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "kura-fs-"));
  });

  afterAll(() => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("returns the plain path when nothing collides", () => {
    expect(uniqueDestPath(dir, "report.pdf")).toBe(path.join(dir, "report.pdf"));
  });

  it("inserts numbered suffixes before the extension on collision", () => {
    fs.writeFileSync(path.join(dir, "doc.pdf"), "x");
    expect(uniqueDestPath(dir, "doc.pdf")).toBe(path.join(dir, "doc (2).pdf"));

    fs.writeFileSync(path.join(dir, "doc (2).pdf"), "x");
    expect(uniqueDestPath(dir, "doc.pdf")).toBe(path.join(dir, "doc (3).pdf"));
  });

  it("strips any path components from the incoming filename", () => {
    const result = uniqueDestPath(dir, "../../etc/passwd");
    expect(path.dirname(result)).toBe(dir);
    expect(path.basename(result)).not.toContain("/");
  });
});
