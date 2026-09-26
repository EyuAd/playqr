import js from "@eslint/js";
import globals from "globals";
export default [
  { ignores: ["**/.wrangler/**", "**/worker-build/**", "dist/**", "assets/**"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        HTMLRewriter: "readonly",
      },
    },
    rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
  },
];

