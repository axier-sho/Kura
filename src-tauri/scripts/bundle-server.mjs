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

import { existsSync, rmSync, mkdirSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
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

console.log("[bundle-server] done.");
