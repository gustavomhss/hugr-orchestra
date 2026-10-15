export * as LeanCoverage from "./lean-coverage"

import { Schema } from "effect"

// Inventory from HuGR-Lean PR129, db767483c06b57614fbed6c3fe7f70ae810e46a4 (MIT).
// Group labels/categories are Orchestra presentation; exact evidence does not imply a reducer.
export const items = [
  { id: "cargo", label: "Cargo", category: "build", mode: "reducer", profiles: ["cargo-test", "cargo-build", "cargo-check", "cargo-clippy"], exact: ["cargo-bench", "cargo-doc", "cargo-fetch", "cargo-fmt", "cargo-nextest"] },
  { id: "go", label: "Go", category: "test", mode: "reducer", profiles: ["go-test-verbose", "go-test-json", "go-mod"], exact: ["go-bench", "go-build"] },
  { id: "pytest", label: "pytest", category: "test", mode: "reducer", profiles: ["pytest"], exact: [] },
  { id: "jest", label: "Jest", category: "test", mode: "preserve", profiles: ["jest"], exact: [] },
  { id: "vitest", label: "Vitest", category: "test", mode: "preserve", profiles: ["vitest"], exact: [] },
  { id: "git", label: "Git status", category: "search", mode: "reducer", profiles: ["git-status"], exact: [] },
  { id: "rg", label: "ripgrep", category: "search", mode: "reducer", profiles: ["rg"], exact: [] },
  { id: "tsc", label: "TypeScript", category: "build", mode: "reducer", profiles: ["tsc"], exact: [] },
  { id: "node", label: "Node / tsx", category: "test", mode: "reducer", profiles: ["node-test"], exact: [] },
  { id: "pnpm", label: "pnpm", category: "install", mode: "reducer", profiles: ["pnpm-install"], exact: [] },
  { id: "eslint", label: "ESLint", category: "lint", mode: "reducer", profiles: ["eslint"], exact: [] },
  { id: "biome", label: "Biome", category: "lint", mode: "reducer", profiles: ["biome"], exact: [] },
  { id: "ruff", label: "Ruff", category: "lint", mode: "reducer", profiles: ["ruff"], exact: [] },
  { id: "pyright", label: "Pyright", category: "lint", mode: "reducer", profiles: ["pyright"], exact: [] },
  { id: "pylint", label: "Pylint", category: "lint", mode: "reducer", profiles: ["pylint"], exact: [] },
  { id: "bun", label: "Bun", category: "test", mode: "preserve", profiles: [], exact: ["bun-install", "bun-test"] },
  { id: "esbuild", label: "esbuild", category: "build", mode: "preserve", profiles: [], exact: ["esbuild"] },
  { id: "golangci", label: "golangci-lint", category: "lint", mode: "preserve", profiles: [], exact: ["golangci-lint"] },
  { id: "markdownlint", label: "markdownlint", category: "lint", mode: "preserve", profiles: [], exact: ["markdownlint"] },
  { id: "mypy", label: "mypy", category: "lint", mode: "preserve", profiles: [], exact: ["mypy"] },
  { id: "next", label: "Next.js", category: "build", mode: "preserve", profiles: [], exact: ["next"] },
  { id: "npm", label: "npm", category: "install", mode: "preserve", profiles: [], exact: ["npm-install"] },
  { id: "pip", label: "pip", category: "install", mode: "preserve", profiles: [], exact: ["pip-install"] },
  { id: "playwright", label: "Playwright", category: "test", mode: "preserve", profiles: [], exact: ["playwright"] },
  { id: "prettier", label: "Prettier", category: "lint", mode: "preserve", profiles: [], exact: ["prettier"] },
  { id: "rollup", label: "Rollup", category: "build", mode: "preserve", profiles: [], exact: ["rollup"] },
  { id: "shellcheck", label: "ShellCheck", category: "lint", mode: "preserve", profiles: [], exact: ["shellcheck"] },
  { id: "stylelint", label: "Stylelint", category: "lint", mode: "preserve", profiles: [], exact: ["stylelint"] },
  { id: "uv", label: "uv", category: "install", mode: "preserve", profiles: [], exact: ["uv-install"] },
  { id: "vite", label: "Vite", category: "build", mode: "preserve", profiles: [], exact: ["vite"] },
  { id: "webpack", label: "webpack", category: "build", mode: "preserve", profiles: [], exact: ["webpack"] },
  { id: "yarn", label: "Yarn", category: "install", mode: "preserve", profiles: [], exact: ["yarn-install"] },
] as const

export type ItemID = (typeof items)[number]["id"]
export const ItemID = Schema.Literals(items.map((item) => item.id))
export type Category = (typeof items)[number]["category"]
export const ids: readonly ItemID[] = Object.freeze(items.map((item) => item.id))
export type Settings = Readonly<Partial<Record<ItemID, boolean>>>
export function forProfile(profile: string): ItemID | undefined {
  return items.find((item) => (item.profiles as readonly string[]).includes(profile))?.id
}
