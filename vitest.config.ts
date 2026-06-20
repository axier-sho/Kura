import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirror the `@/*` path alias from tsconfig.json so tests import the same way the
// app does. Resolved from this file's URL to stay correct on Windows and POSIX.
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": root },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "src-tauri/**"],
  },
});
