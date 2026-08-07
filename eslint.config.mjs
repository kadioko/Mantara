import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** @type {import("eslint").Linter.Config[]} */
const config = [
  // Globbed rather than anchored to the root: build output and dependencies can appear in nested
  // directories too, such as a git worktree under .claude/, and linting those swamps real findings.
  { ignores: ["**/.next/**", "**/node_modules/**", ".claude/**", "next-env.d.ts"] },
  ...coreWebVitals,
  ...typescript,
];

export default config;
