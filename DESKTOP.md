# Kura desktop (Tauri) build & run

Kura is a **Next.js server app** (API routes, server actions, native `better-sqlite3`),
not a static site. The desktop build therefore bundles the Next server *inside*
the app and launches it as a **hidden `node` sidecar** on startup — no terminal
window, and the user never has to run `npm start` themselves.

```
Tauri window  ──►  hidden node.exe  ──►  Next.js server (127.0.0.1:<free port>)
   (loader)        (bundled sidecar)      (bundled .next/standalone)
```

## Prerequisites

- **Node 20 LTS** (see `.nvmrc`). ⚠️ Node 23+/26 **cannot build `better-sqlite3`** —
  you'll get `node-gyp` C++ errors. Use Node 20: `nvm install 20 && nvm use 20`.
- **Rust** (stable) + the Tauri prerequisites for your OS:
  https://tauri.app/start/prerequisites/
- Build the **Windows installer on Windows** (and macOS app on macOS). The app
  bundles a platform-native `better-sqlite3` and a platform-native `node`, so it
  is **not** cross-compilable from another OS.

## One-time setup

```bash
nvm use 20          # or otherwise make `node -v` report v20.x
npm install         # installs deps incl. a prebuilt better-sqlite3 for Node 20
npm run tauri:node  # downloads the Node runtime sidecar -> src-tauri/binaries/
```

`npm run tauri:node` fetches Node for your current OS. To fetch for Windows
explicitly: `npm run tauri:node -- --target win`.

## Develop

```bash
npm run tauri:dev
```

Starts `next dev` and opens the window pointed at it. (In dev the sidecar is not
used — the dev server is.)

## Build the installer

```bash
npm run tauri:build
```

This runs `npm run tauri:prepare` first (= `next build` with `output: "standalone"`
+ `src-tauri/scripts/bundle-server.mjs`, which assembles the self-contained
server into `src-tauri/resources/app-server/`), then Tauri bundles the `.msi` /
`.exe` (NSIS) with the Node sidecar and that server folder embedded.

Output: `src-tauri/target/release/bundle/`.

## Auto-updates

Kura updates itself via **`tauri-plugin-updater`** + **GitHub Releases**. On launch
(release builds only), it checks
`https://github.com/axier-sho/Kura/releases/latest/download/latest.json`; if a newer
**signed** version exists it asks the user (「更新しますか?」) and, on accept, downloads,
installs, and relaunches. User data in `%APPDATA%\kura` is untouched by an update.

Only **NSIS** artifacts are used for updates (the `.nsis.zip` + its `.sig`); the MSI is a
manual-install option and is not part of the update manifest. Dev (`tauri:dev`) never
checks for updates — the logic is compiled out of debug builds.

### One-time setup (signing key)

Updates must be cryptographically signed. Generate a keypair **once** and keep it safe —
if it is lost, existing installs can no longer auto-update (they'd need a manual reinstall).

```bash
npm run tauri signer generate -- -w ~/.tauri/kura.key
```

- Put the printed **public key** into `src-tauri/tauri.conf.json` →
  `plugins.updater.pubkey` (replace `REPLACE_WITH_TAURI_UPDATER_PUBLIC_KEY`).
- Add the **private key** (file contents) + its password as GitHub repo secrets
  (Settings → Secrets and variables → Actions):
  - `TAURI_SIGNING_PRIVATE_KEY`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Keep `~/.tauri/kura.key` out of the repo (store it in a password manager / secret vault).

### Shipping an update

1. Bump the version in **all three** files so they match (the updater compares the
   installed version against the manifest):
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
2. Commit, then tag and push:
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```
3. The `Build Windows desktop (Tauri)` workflow builds on Windows, signs, and publishes a
   GitHub Release containing the NSIS installer, its `.sig`, and an auto-generated
   `latest.json`. Because the release is published (not a draft), the
   `releases/latest/download/latest.json` endpoint resolves to it.
4. Installed older clients see the update on their next launch and prompt to install it.

A manual `workflow_dispatch` run (no tag) instead produces a signed build and uploads it as
a workflow artifact — handy for testing without cutting a release.

## How it works (where to look)

- `src-tauri/src/lib.rs` — on launch (release only) finds a free port, spawns the
  bundled `node server.js` hidden, waits for it to listen, then navigates the
  window to it. Kills the server on exit.
- `src-tauri/tauri.conf.json` — `externalBin` (node sidecar) + `resources`
  (bundled server) + `beforeBuildCommand`.
- `next.config.ts` — `output: "standalone"` and a pinned `outputFileTracingRoot`.
- The SQLite DB + files live in the per-user data dir (`%APPDATA%\kura` on
  Windows), never in the read-only install folder.

## Troubleshooting

- **"connection denied" / blank window** — the old cause (hardcoded
  `localhost:3000` with no server) is fixed. If it still happens, the sidecar
  didn't start: confirm `src-tauri/binaries/node-<triple>` exists (`npm run
  tauri:node`) and that `src-tauri/resources/app-server/server.js` was produced.
- **`better-sqlite3` gyp/C++ build errors** — you're on too-new a Node. Switch to
  Node 20 and reinstall.
- **App boots then errors on first document/DB action** — the bundled native
  binary's ABI doesn't match the bundled node. Reinstall deps under Node 20 and
  rebuild so both are Node 20.
