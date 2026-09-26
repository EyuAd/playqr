import { defineConfig } from "vite";
export default defineConfig({
  root: "frontend",
  envDir: "..",
  base: "./",
  build: { outDir: "../dist", emptyOutDir: true },
});

