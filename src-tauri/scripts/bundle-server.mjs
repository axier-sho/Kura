// Assemble the Next.js standalone server into a single self-contained folder
// that the Tauri desktop shell bundles as a resource and launches as a hidden
// `node` sidecar at startup.
//
// Next's `output: "standalone"` build produces `.next/standalone/` with a
// `server.js` and a traced, minimal `node_modules` — but it does NOT copy
// `public/` or `.next/static/` (those are expected to be served by a CDN in a
// normal deploy). For a desktop app there is no CDN, so we copy them in next to
// `server.js`, exactly where the standalone server looks for them.
//
// Result layout (-> src-tauri/resources/app-server):
//   server.js
//   node_modules/...        (traced deps, incl. native better-sqlite3 .node)
//   .next/server/...
//   .next/static/...        (copied here)
//   public/...              (copied here)
//   package.json
//
// Run from the project root: `node src-tauri/scripts/bundle-server.mjs`

import {
  existsSync,
  rmSync,
  mkdirSync,
  cpSync,
  readdirSync,
  lstatSync,
  readlinkSync,
  statSync,
} from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const standalone = join(projectRoot, ".next", "standalone");
const dest = join(projectRoot, "src-tauri", "resources", "app-server");

function fail(msg) {
  console.error(`\n[bundle-server] ${msg}\n`);
  process.exit(1);
}

if (!existsSync(standalone)) {
  fail(
    'Missing .next/standalone. Run `next build` first (needs `output: "standalone"` in next.config.ts).',
  );
}

// Start clean so removed files don't linger in the bundle.
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

// Guard: the server must be at the standalone root. If it's nested under an
// absolute path (e.g. .next/standalone/Users/.../server.js), the tracing root
// wasn't pinned — bail rather than ship a bundle whose server.js Rust can't find.
if (!existsSync(join(standalone, "server.js"))) {
  fail(
    "No server.js at the root of .next/standalone — the output is nested.\n" +
      "Set `outputFileTracingRoot: path.join(__dirname)` in next.config.ts and rebuild.",
  );
}

console.log("[bundle-server] copying standalone server ->", dest);
cpSync(standalone, dest, { recursive: true });

// 1) static assets (JS/CSS chunks). Without these every page 404s its assets.
const staticSrc = join(projectRoot, ".next", "static");
if (existsSync(staticSrc)) {
  cpSync(staticSrc, join(dest, ".next", "static"), { recursive: true });
  console.log("[bundle-server] copied .next/static");
} else {
  fail("Missing .next/static — did `next build` finish?");
}

// 2) public/ (icons, etc.)
const publicSrc = join(projectRoot, "public");
if (existsSync(publicSrc)) {
  cpSync(publicSrc, join(dest, "public"), { recursive: true });
  console.log("[bundle-server] copied public/");
}

// 3) Belt-and-suspenders for the native module: nft usually traces
// better-sqlite3's compiled binding, but if it ever misses it the app would
// boot then crash on first DB call. Force the prebuilt binary in if present.
const bsqRel = join("node_modules", "better-sqlite3", "build");
const bsqSrc = join(projectRoot, bsqRel);
const bsqDest = join(dest, bsqRel);
if (existsSync(bsqSrc) && !existsSync(bsqDest)) {
  mkdirSync(dirname(bsqDest), { recursive: true });
  cpSync(bsqSrc, bsqDest, { recursive: true });
  console.log("[bundle-server] copied better-sqlite3 native build/");
}

// 4) CRITICAL: materialize Turbopack's external-package symlinks.
// A Turbopack production build resolves every `serverExternalPackages` entry
// (better-sqlite3, mammoth, unpdf) through a SYMLINK it creates at
// `.next/node_modules/<pkg>-<hash>` pointing at the real package. The server chunks
// then `require("<pkg>-<hash>")`, which resolves ONLY via that symlink. Symlinks do
// not survive this copy + the Windows MSI packaging — they become absolute/dangling
// or are dropped — so the installed app throws `Cannot find module '<pkg>-<hash>'`
// on the first DB/parse call and every page 500s ("Internal Server Error").
// Replace each symlink with a real copy of the package so resolution never depends
// on a symlink. The real package is taken from our own traced node_modules rather
// than the link target (cpSync above has already rewritten it to an absolute
// build-machine path that won't exist on the user's machine).
const extDir = join(dest, ".next", "node_modules");
let materialized = 0;
if (existsSync(extDir)) {
  for (const name of readdirSync(extDir)) {
    const linkPath = join(extDir, name);
    if (!lstatSync(linkPath).isSymbolicLink()) continue;
    // Real package name = Turbopack's "<pkg>-<hex hash>" minus the hash; fall back
    // to the link target's basename if stripping doesn't resolve.
    let realName = name.replace(/-[0-9a-f]{8,}$/, "");
    if (!existsSync(join(dest, "node_modules", realName))) {
      realName = basename(readlinkSync(linkPath));
    }
    const realPkg = join(dest, "node_modules", realName);
    if (!existsSync(realPkg)) {
      fail(
        `external "${name}" -> "${realName}" is missing from the bundled ` +
          "node_modules; cannot materialize. Did the trace drop it?",
      );
    }
    rmSync(linkPath, { recursive: true, force: true });
    cpSync(realPkg, linkPath, { recursive: true });
    console.log(`[bundle-server] materialized external ${name} <- node_modules/${realName}`);
    materialized++;
  }
}
console.log(`[bundle-server] materialized ${materialized} external package(s)`);

// 5) Guard against a contaminated/bloated bundle. v0.1.0 shipped a 449 MB installer
// because a dirty workspace swept build artifacts (static libs, object files) into
// the bundle. A clean standalone bundle is tens of MB; fail loudly well before that.
const MAX_MB = 300;
let bytes = 0;
const stack = [dest];
while (stack.length) {
  const dir = stack.pop();
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isSymbolicLink()) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) stack.push(p);
    else if (e.isFile()) bytes += statSync(p).size;
  }
}
const sizeMb = Math.round(bytes / 1048576);
console.log(`[bundle-server] bundle size: ${sizeMb} MB`);
if (sizeMb > MAX_MB) {
  fail(
    `bundle is ${sizeMb} MB (cap ${MAX_MB} MB). A dirty workspace likely pulled in ` +
      "build artifacts. Build from a clean checkout with a fresh `npm ci`.",
  );
}

console.log("[bundle-server] done.");
