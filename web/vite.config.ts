import { defineConfig } from "vite";

// En GitHub Pages la página vive en /<nombre-del-repo>/. En local, en /.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  test: { environment: "jsdom" },
} as any);
