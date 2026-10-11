// Repair: resolve desktop file selection before setup and again at completion.
// Bun 1.3.14: src/cli/test_command.zig and src/cli/test/Scanner.zig.
import { Glob, TOML } from "bun"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

export function desktopSelection(request: { package: string; runner: string; args: string[] }, cwd: string) {
  if (request.package !== "desktop" || request.runner !== "bun") return []
  // Only documented test-ci value options and file-neutral Bun switches are accepted here.
  // Unknown options (including --changed/--shard/--cwd) cannot silently change the selection.
  const parsed = parseArgs({ args: request.args, allowPositionals: true, options: {
    timeout: { type: "string" }, "test-name-pattern": { type: "string", short: "t" },
    bail: { type: "boolean" }, "pass-with-no-tests": { type: "boolean" },
    only: { type: "boolean" }, todo: { type: "boolean" }, concurrent: { type: "boolean" },
    randomize: { type: "boolean" }, "only-failures": { type: "boolean" },
    "update-snapshots": { type: "boolean", short: "u" },
  } })
  const config = path.join(cwd, "bunfig.toml")
  const settings = (existsSync(config) ? TOML.parse(readFileSync(config, "utf8")) : {}) as {
    test?: { root?: unknown; pathIgnorePatterns?: unknown }
  }
  if (settings.test?.root !== undefined) throw new Error("Jimmy desktop unsupported selection: test.root")
  const patterns = settings.test?.pathIgnorePatterns ?? []
  if (!Array.isArray(patterns) || !patterns.every((value) => typeof value === "string"))
    throw new Error("Jimmy desktop invalid pathIgnorePatterns")
  const ignored = patterns.map((value) => new Glob(value))
  const skip = (file: string) => ignored.some((glob, index) => glob.match(file) ||
    (patterns[index].includes("**") && glob.match(`${file}/`)))
  const explicit = parsed.positionals.some((arg) => path.isAbsolute(arg) || arg.startsWith("./") || arg.startsWith("../") ||
    (process.platform === "win32" && (arg.startsWith(".\\") || arg.startsWith("..\\"))))
  const scan = (entry: string, direct: boolean): string[] => {
    const full = path.resolve(cwd, entry)
    const file = path.relative(cwd, full).replaceAll("\\", "/")
    if (skip(file)) return []
    const stat = statSync(full, { throwIfNoEntry: false })
    if (!stat) return []
    if (stat.isDirectory()) return readdirSync(full).flatMap((name) =>
      name.startsWith(".") || name.toLowerCase() === "node_modules" ? [] : scan(path.join(entry, name), false))
    if (!stat.isFile() || !/\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/i.test(file)) return []
    if (!direct && !/[._](test|spec)\.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$/i.test(file)) return []
    if (explicit || parsed.positionals.length === 0 || parsed.positionals.some((arg) =>
      full.startsWith(process.platform === "win32" ? arg.replaceAll("/", "\\") : arg) ||
      file.includes(process.platform === "win32" ? arg.replaceAll("\\", "/") : arg))) return [file]
    return []
  }
  const selected = [...new Set((explicit ? parsed.positionals : ["."]).flatMap((entry) => scan(entry, explicit)))]
  if (selected.length === 0) throw new Error("Jimmy desktop empty test selection")
  return selected
}

export function requireDesktopEvidence(selected: string[], directory: string,
  current: { sha: string | undefined; runID: string | undefined; platform: string; arch: string }) {
  if (!selected.includes("src/main/jimmy-desktop-proof.test.ts")) return false
  if (!current.sha || !current.runID) throw new Error("Jimmy desktop missing current-run identity")
  const load = (name: string) => {
    const file = path.join(directory, `jimmy-desktop-${name}.json`)
    if (!existsSync(file)) throw new Error(`Missing completed Jimmy desktop ${name} evidence`)
    const text = readFileSync(file, "utf8")
    if (!text.trim()) throw new Error(`Empty completed Jimmy desktop ${name} evidence`)
    const value = JSON.parse(text)
    if (!value || value.sha !== current.sha || value.runID !== current.runID)
      throw new Error(`Jimmy desktop ${name} evidence belongs to another run`)
    return value
  }
  const proof = load("proof")
  if (proof.schema !== "jimmy-desktop-proof-v1" || proof.stopped !== true || proof.fixtureReaped !== "SIGKILL" ||
    proof.platform !== current.platform || proof.arch !== current.arch || !Array.isArray(proof.mutation?.changes) ||
    !proof.mutation.changes.length || typeof proof.mutation.failure !== "string" ||
    !proof.mutation.failure.includes("generated native artifact bridge"))
    throw new Error("Jimmy desktop native/mutation proof did not complete")
  const types = load("typecheck")
  if (types.schema !== "jimmy-desktop-typecheck-v1" || types.passed !== true)
    throw new Error("Jimmy desktop scoped typecheck did not complete")
  return true
}
