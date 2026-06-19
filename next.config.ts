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
  // `unpdf`, `mammoth` and `better-sqlite3` are used only in server code
  // (route handlers / server actions); keep them out of the bundle.
  // `better-sqlite3` is a native module and must not be bundled.
  serverExternalPackages: ["unpdf", "mammoth", "better-sqlite3"],
};

export default nextConfig;
