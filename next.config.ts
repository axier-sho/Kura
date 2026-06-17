import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tauri loads the app in a webview; allow the dev origin and keep images unoptimized
  // so the same build works both on Vercel and inside the desktop shell.
  images: { unoptimized: true },
  // `unpdf` and `mammoth` are used only in server code (route handlers / server actions).
  serverExternalPackages: ["unpdf", "mammoth"],
};

export default nextConfig;
