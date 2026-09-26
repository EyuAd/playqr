import { copyFile, cp, access } from "node:fs/promises";
// Publish the generated build into the existing branch-root Pages layout.
await access(new URL("../dist/index.html", import.meta.url));
await copyFile(
  new URL("../dist/index.html", import.meta.url),
  new URL("../index.html", import.meta.url),
);
await cp(
  new URL("../dist/assets/", import.meta.url),
  new URL("../assets/", import.meta.url),
  { recursive: true },
);
console.log(
  "Prepared GitHub Pages entry and versioned assets. Source remains in frontend/.",
);

