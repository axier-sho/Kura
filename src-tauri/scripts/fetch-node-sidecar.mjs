// Download an official Node.js runtime and drop it into src-tauri/binaries/ with
// the target-triple name Tauri expects for an `externalBin` sidecar. The Tauri
// shell then launches it at startup to run the bundled Next.js server.
//
// Tauri sidecar naming: `binaries/node-<target-triple>` (+ `.exe` on Windows),
// e.g. `binaries/node-x86_64-pc-windows-msvc.exe`. At bundle time Tauri strips
// the triple and ships it next to the app as `node.exe`.
//
// Usage (run on the machine you BUILD on):
//   node src-tauri/scripts/fetch-node-sidecar.mjs                 # host platform
//   node src-tauri/scripts/fetch-node-sidecar.mjs --target win    # force Windows x64
//
// Cross-building this app (native better-sqlite3 + a Windows node) from macOS is
// not practical — build the Windows installer ON Windows and run this there.

import { existsSync, mkdirSync, rmSync, renameSync, readdirSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { writeFile } from "node:fs/promises";

const NODE_VERSION = "v20.18.1"; // LTS; Next 16 needs Node >= 18.18

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const binariesDir = join(root, "binaries");
const tmpDir = join(root, ".node-sidecar-tmp");

// triple => { url-slug, archive ext, exe name, tauri suffix }
const TARGETS = {
  "x86_64-pc-windows-msvc": { slug: "win-x64", ext: "zip", exe: "node.exe", out: "node-x86_64-pc-windows-msvc.exe" },
  "aarch64-apple-darwin": { slug: "darwin-arm64", ext: "tar.gz", exe: "bin/node", out: "node-aarch64-apple-darwin" },
  "x86_64-apple-darwin": { slug: "darwin-x64", ext: "tar.gz", exe: "bin/node", out: "node-x86_64-apple-darwin" },
  "x86_64-unknown-linux-gnu": { slug: "linux-x64", ext: "tar.gz", exe: "bin/node", out: "node-x86_64-unknown-linux-gnu" },
};

function resolveTriple() {
  const arg = process.argv.find((a) => a.startsWith("--target"));
  const forced = arg ? (arg.includes("=") ? arg.split("=")[1] : process.argv[process.argv.indexOf(arg) + 1]) : null;
  if (forced === "win" || forced === "windows") return "x86_64-pc-windows-msvc";
  if (forced && TARGETS[forced]) return forced;
  const { platform, arch } = process;
  if (platform === "win32") return "x86_64-pc-windows-msvc";
  if (platform === "darwin") return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  if (platform === "linux") return "x86_64-unknown-linux-gnu";
  throw new Error(`Unsupported host ${platform}/${arch}; pass --target <triple>`);
}

const triple = resolveTriple();
const t = TARGETS[triple];
const base = `node-${NODE_VERSION}-${t.slug}`;
const url = `https://nodejs.org/dist/${NODE_VERSION}/${base}.${t.ext}`;

console.log(`[fetch-node] target ${triple}`);
console.log(`[fetch-node] downloading ${url}`);

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
mkdirSync(binariesDir, { recursive: true });

const res = await fetch(url);
if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
const archivePath = join(tmpDir, `${base}.${t.ext}`);
await writeFile(archivePath, Readable.fromWeb(res.body));

// Extract with system tooling. `tar` ships with Windows 10 1803+ (bsdtar, reads
// zip) and macOS/Linux (reads tar.gz). Fall back to `unzip` for zip on hosts
// whose tar can't (e.g. extracting a Windows zip on an old macOS).
console.log("[fetch-node] extracting…");
try {
  execFileSync("tar", ["-xf", archivePath, "-C", tmpDir], { stdio: "inherit" });
} catch {
  if (t.ext === "zip") execFileSync("unzip", ["-q", archivePath, "-d", tmpDir], { stdio: "inherit" });
  else throw new Error("extraction failed: install `tar`");
}

const exeSrc = join(tmpDir, base, t.exe);
if (!existsSync(exeSrc)) {
  throw new Error(`node executable not found at ${exeSrc} (contents: ${readdirSync(join(tmpDir, base)).join(", ")})`);
}
const dest = join(binariesDir, t.out);
rmSync(dest, { force: true });
renameSync(exeSrc, dest);
if (!t.out.endsWith(".exe")) chmodSync(dest, 0o755);
rmSync(tmpDir, { recursive: true, force: true });

console.log(`[fetch-node] wrote src-tauri/binaries/${t.out}`);
