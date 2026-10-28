export * as RelayCommands from "./relay-commands"

import { access, readdir, readFile } from "node:fs/promises"
import path from "path"
import { Effect, Option, Schema } from "effect"

// The check commands a project already declares, offered as suggestions in the workflow editor. Detection only reads
// manifest files in the project root; it never runs anything, so it needs no trust.

export interface Command {
  readonly command: string
  // The manifest that declares it, e.g. `package.json` or `Makefile`.
  readonly source: string
  readonly kind: "test" | "lint" | "typecheck" | "format" | "build"
}

export interface Detected {
  readonly commands: ReadonlyArray<Command>
  // pytest test files relative to the project, for one check per test file.
  readonly pytest: ReadonlyArray<string>
}

const PYTEST_FILES = 200

export const detect = Effect.fn("RelayCommands.detect")(function* (directory: string) {
  const read = (name: string) =>
    Effect.promise(() => readFile(path.join(directory, name), "utf8").catch(() => undefined))
  const pkg = yield* read("package.json")
  const pyproject = yield* read("pyproject.toml")
  const cargo = yield* read("Cargo.toml")
  const gomod = yield* read("go.mod")
  const makefile = yield* read("Makefile")
  const runner = yield* packageRunner(directory)
  const pytest = pyproject?.includes("pytest") ? yield* pytestFiles(directory) : []
  return {
    commands: [
      ...scripts(pkg).flatMap((script): Command[] => {
        const kind = kindOf(script)
        return kind ? [{ command: `${runner} run ${script}`, source: "package.json", kind }] : []
      }),
      ...(pyproject?.includes("pytest") ? [{ command: "pytest -q", source: "pyproject.toml", kind: "test" } as const] : []),
      ...(pyproject?.includes("ruff") ? [{ command: "ruff check .", source: "pyproject.toml", kind: "lint" } as const] : []),
      ...(pyproject?.includes("mypy") ? [{ command: "mypy .", source: "pyproject.toml", kind: "typecheck" } as const] : []),
      ...(cargo
        ? ([
            { command: "cargo test", source: "Cargo.toml", kind: "test" },
            { command: "cargo clippy -- -D warnings", source: "Cargo.toml", kind: "lint" },
            { command: "cargo fmt --check", source: "Cargo.toml", kind: "format" },
          ] as const)
        : []),
      ...(gomod
        ? ([
            { command: "go test ./...", source: "go.mod", kind: "test" },
            { command: "go vet ./...", source: "go.mod", kind: "lint" },
          ] as const)
        : []),
      ...[...(makefile ?? "").matchAll(/^([A-Za-z][\w-]*)\s*:(?!=)/gm)].flatMap((match): Command[] => {
        const kind = kindOf(match[1]!)
        return kind ? [{ command: `make ${match[1]}`, source: "Makefile", kind }] : []
      }),
    ].filter((command, index, all) => all.findIndex((other) => other.command === command.command) === index),
    pytest,
  } satisfies Detected
})

function scripts(text: string | undefined) {
  if (!text) return []
  const parsed = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(text))
  if (typeof parsed !== "object" || parsed === null || !("scripts" in parsed)) return []
  const listed = parsed.scripts
  if (typeof listed !== "object" || listed === null) return []
  return Object.keys(listed)
}

function kindOf(name: string): Command["kind"] | undefined {
  if (/typecheck|type-check|tsc/.test(name)) return "typecheck"
  if (/^test|:test|^check$/.test(name)) return "test"
  if (/lint|clippy|vet/.test(name)) return "lint"
  if (/^(fmt|format)(:check)?$|format:check|fmt-check/.test(name)) return "format"
  if (/^build$/.test(name)) return "build"
  return undefined
}

// The lockfile names the package manager; npm is the fallback every Node install has. Relay modules run under Node in
// the desktop server, so they read files through `node:fs` rather than the Bun runtime.
const packageRunner = Effect.fn("RelayCommands.packageRunner")(function* (directory: string) {
  const exists = (name: string) =>
    Effect.promise(() =>
      access(path.join(directory, name)).then(
        () => true,
        () => false,
      ),
    )
  if ((yield* exists("bun.lock")) || (yield* exists("bun.lockb"))) return `bun`
  if (yield* exists("pnpm-lock.yaml")) return "pnpm"
  if (yield* exists("yarn.lock")) return "yarn"
  return "npm"
})

const pytestFiles = (directory: string) =>
  Effect.promise(async () => {
    // The project root and the usual test roots only: a scan of the whole tree would walk virtualenvs and node_modules.
    const files = await Promise.all([
      readdir(directory).catch(() => []),
      ...["test", "tests", "src"].map((root) =>
        readdir(path.join(directory, root), { recursive: true })
          .then((names) => names.map((name) => path.posix.join(root, name.split(path.sep).join("/"))))
          .catch(() => []),
      ),
    ])
    return [...new Set(files.flat().filter((file) => /^(test_.*|.*_test)\.py$/.test(path.posix.basename(file))))]
      .toSorted()
      .slice(0, PYTEST_FILES)
  })
