import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the native driver out of the bundle: bundlers cannot load its
  // .node addon correctly (segfaults on the first query).
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
