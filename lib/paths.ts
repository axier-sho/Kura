/**
 * Local data locations. Everything Kura persists (the SQLite database and the
 * original uploaded files) lives under a single per-user app-data directory so
 * the app is fully offline — the only thing that ever leaves the machine is the
 * Gemini AI request.
 *
 * Override the base directory with KURA_DATA_DIR. Otherwise we use the OS
 * convention:
 *   - win32 : %APPDATA%\kura
 *   - darwin: ~/Library/Application Support/kura
 *   - linux : $XDG_DATA_HOME/kura or ~/.local/share/kura
 */
import os from "node:os";
import path from "node:path";

function resolveDataDir(): string {
  const override = process.env.KURA_DATA_DIR;
  if (override) return path.resolve(override);

  const home = os.homedir();
  switch (process.platform) {
    case "win32":
      return path.join(
        process.env.APPDATA ?? path.join(home, "AppData", "Roaming"),
        "kura",
      );
    case "darwin":
      return path.join(home, "Library", "Application Support", "kura");
    default:
      return path.join(
        process.env.XDG_DATA_HOME ?? path.join(home, ".local", "share"),
        "kura",
      );
  }
}

export const dataDir = resolveDataDir();
export const dbPath = path.join(dataDir, "kura.db");
export const filesDir = path.join(dataDir, "files");
