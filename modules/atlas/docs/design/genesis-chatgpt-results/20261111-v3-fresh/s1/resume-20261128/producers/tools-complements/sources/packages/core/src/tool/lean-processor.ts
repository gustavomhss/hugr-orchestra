export * as LeanProcessor from "./lean-processor"

import { filter, getProfiles, tokenizeCommand, type Observation } from "hugr-lean/core"
import { LeanCoverage } from "@orchestra/schema/lean-coverage"

const profiles = getProfiles()

/** Classify all actual built-ins before applying settings; disabled profiles cannot hide overlap. */
export function identify(command: string): LeanCoverage.ItemID | undefined {
  const argv = tokenizeCommand(command)
  if (!argv) return undefined
  const matched = profiles.filter((profile) => profile.match(argv))
  if (matched.length > 1) return undefined
  if (matched.length === 1) return LeanCoverage.forProfile(matched[0]!.id)
  return exactItem(argv)
}

/** One actual package engine; settings only select profiles, never rewrite observations. */
export function process(observation: Observation, items?: LeanCoverage.Settings) {
  try {
    const id = identify(observation.command)
    const selected = id && items?.[id] === false ? [] : profiles
    return filter(observation, { profiles: selected })
  } catch {
    // Keep the package's own fail-open boundary for malformed observations or host settings.
    return filter(observation, { profiles: [] })
  }
}

function exactItem(argv: readonly string[]): LeanCoverage.ItemID | undefined {
  // Preservation attribution only. Prefixes inspected in fixtures/profiles/*/cases.json at leanPin.commit;
  // no output grammar, shell wrappers, inferred script aliases, or invented reducers.
  if (argv.length > 64) return undefined
  const tool = argv[0]!.split("/").at(-1)
  if (tool === "cargo" && ["bench", "doc", "fetch", "install", "fmt", "nextest"].includes(argv[1] ?? "")) return "cargo"
  if (tool === "go" && (["build", "vet"].includes(argv[1] ?? "") || argv[1] === "test" && argv.slice(2).some((arg) => arg === "-bench" || arg.startsWith("-bench=")))) return "go"
  if (tool === "bun" && ["install", "test"].includes(argv[1] ?? "")) return "bun"
  if (tool === "npm" && ["install", "ci"].includes(argv[1] ?? "")) return "npm"
  if (tool === "yarn" && argv[1] === "install") return "yarn"
  if (tool === "pip" && argv[1] === "install") return "pip"
  if (tool === "python" && argv[1] === "-m" && argv[2] === "pip" && argv[3] === "install") return "pip"
  if (tool === "uv" && (["sync", "lock"].includes(argv[1] ?? "") || argv[1] === "pip" && ["install", "sync"].includes(argv[2] ?? ""))) return "uv"
  if (tool === "golangci-lint" && argv[1] === "run") return "golangci"
  if (tool === "vite" && argv[1] === "build") return "vite"
  if (tool === "node" && /(?:^|\/)node_modules\/next\/dist\/bin\/next$/.test(argv[1] ?? "") && argv[2] === "build") return "next"
  if (tool === "npx" && (argv[1] === "prettier" || argv[1] === "--no-install" && argv[2] === "prettier")) return "prettier"
  const direct = { esbuild: "esbuild", "markdownlint-cli2": "markdownlint", mypy: "mypy", prettier: "prettier",
    rollup: "rollup", shellcheck: "shellcheck", stylelint: "stylelint", webpack: "webpack" } as const
  return tool && Object.hasOwn(direct, tool) ? direct[tool as keyof typeof direct] : undefined
}
