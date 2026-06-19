import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Tauri loads the app in a webview; allow the dev origin and keep images unoptimized
  // so the same build works both on Vercel and inside the desktop shell.
  images: { unoptimized: true },
  // Emit a self-contained server (`.next/standalone/server.js`) that runs with a
  // plain `node server.js` — no `next` CLI, minimal traced node_modules. The
  // Tauri desktop shell bundles this and launches it as a hidden sidecar so the
  // installed app starts its own server instead of needing `npm run start`.
  output: "standalone",
  // Pin the file-tracing root to THIS project. Without it, Next walks up to a
  // higher ancestor (e.g. a parent lockfile) and nests the output under the
  // machine's absolute path — `.next/standalone/Users/.../server.js` — which is
  // unportable and breaks the desktop bundle. Pinning keeps the layout flat:
  // `.next/standalone/server.js`.
  outputFileTracingRoot: path.join(__dirname),
  // The tracing root above is the project dir, which CONTAINS `src-tauri/`
  // (the Rust shell). Its `target/` build cache (~1.4 GB) and any previously
  // assembled `resources/app-server` bundle have no place in the Next server
  // output, but the tracer will sweep them into `.next/standalone` if they
  // exist at build time — e.g. when CI's cargo cache restores `target/` before
  // `next build`, ballooning the bundle from ~90 MB to 1.5 GB and tripping
  // bundle-server's size cap. Exclude the whole Tauri dir from tracing so the
  // bundle is deterministic regardless of leftover build state.
  outputFileTracingExcludes: {
    "*": ["src-tauri/**"],
  },
  // `unpdf`, `mammoth` and `better-sqlite3` are used only in server code
  // (route handlers / server actions); keep them out of the bundle.
  // `better-sqlite3` is a native module and must not be bundled.
  serverExternalPackages: ["unpdf", "mammoth", "better-sqlite3"],
};

export default nextConfig;
