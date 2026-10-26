export * as ConfigPluginFile from "./plugin-file"

import path from "path"
import { fileURLToPath } from "url"
import { applyEdits, modify, parse, printParseErrorCode, type ParseError } from "jsonc-parser"

export type Result = { readonly file: string; readonly mode: "add" | "replace" | "noop" }

/** The config files a directory may hold, in load order (a later file wins). */
export function files(directory: string) {
  return [
    path.join(directory, "orchestra.json"),
    path.join(directory, "orchestra.jsonc"),
    path.join(directory, ".orchestra", "orchestra.json"),
    path.join(directory, ".orchestra", "orchestra.jsonc"),
  ]
}

/** The package an entry names: a spec without its version (`@scope/pkg@1.2` is `@scope/pkg`). */
export function packageName(spec: string) {
  const at = spec.lastIndexOf("@")
  return at > 0 ? spec.slice(0, at) : spec
}

/**
 * Registers a plugin package in a directory's config `plugins`, keeping comments and formatting. An entry for the same
 * package stays as it is unless `force` replaces it. The first existing config file is edited, else `orchestra.json`.
 */
export async function add(directory: string, spec: string, options: { readonly force?: boolean } = {}): Promise<Result> {
  const file = (await Promise.all(files(directory).map(async (item) => ((await Bun.file(item).exists()) ? item : undefined)))).find(
    (item) => item !== undefined,
  ) ?? files(directory)[0]
  const text = (await Bun.file(file).exists()) ? await Bun.file(file).text() : "{}"
  const errors: ParseError[] = []
  const document = parse(text, errors, { allowTrailingComma: true })
  if (errors.length > 0) throw new Error(`Invalid JSON in ${file} (${printParseErrorCode(errors[0].error)} at offset ${errors[0].offset})`)
  const existing: unknown[] = Array.isArray(document?.plugins) ? document.plugins : []

  const name = packageName(spec)
  const index = existing.findIndex((entry) => packageName(typeof entry === "string" ? entry : String((entry as { package?: unknown })?.package ?? "")) === name)
  if (index >= 0 && (!options.force || existing[index] === spec)) return { file, mode: "noop" }

  const format = { formattingOptions: { tabSize: 2, insertSpaces: true } }
  const edits = modify(text, ["plugins", index >= 0 ? index : existing.length], spec, { ...format, isArrayInsertion: index < 0 })
  await Bun.write(file, applyEdits(text, edits))
  return { file, mode: index >= 0 ? "replace" : "add" }
}

export type Target = "server" | "tui"

export type Manifest = { readonly directory: string; readonly targets: readonly Target[] }

/** A path spec names a local plugin; anything else is an npm package. */
export function isPath(spec: string) {
  return spec.startsWith("file://") || spec.startsWith(".") || path.isAbsolute(spec) || /^[A-Za-z]:[\\/]/.test(spec)
}

/**
 * Makes a plugin package available and checks its manifest exposes a plugin entrypoint: `exports["./server"]` or
 * `main` for the server, `exports["./tui"]` or `oc-themes` for the TUI. An npm spec installs through the Npm service
 * (a bare name installs its latest version); `resolve` replaces that step.
 */
export async function install(
  spec: string,
  resolve: (spec: string) => Promise<string> = resolveSpec,
): Promise<Manifest> {
  const directory = await resolve(spec).catch((cause: unknown) => {
    throw new Error(`Could not install "${spec}": ${installDetail(cause)}`, { cause })
  })
  const file = path.join(directory, "package.json")
  const manifest = await Bun.file(file)
    .json()
    .catch((cause: unknown) => {
      throw new Error(`Installed "${spec}" but failed to read ${file}: ${cause instanceof Error ? cause.message : cause}`, { cause })
    })
  const targets = packageTargets(spec, manifest as Record<string, unknown>)
  if (targets.length === 0) {
    throw new Error(
      `"${spec}" does not expose plugin entrypoints in package.json. Expected one of: exports["./tui"], exports["./server"], package.json main for server, or package.json["oc-themes"] for tui themes.`,
    )
  }
  return { directory, targets }
}

async function resolveSpec(spec: string) {
  if (isPath(spec)) {
    const target = spec.startsWith("file://") ? fileURLToPath(spec) : path.resolve(spec)
    return (await Bun.file(target).exists()) ? path.dirname(target) : target
  }
  const { Npm } = await import("../npm")
  const bare = spec.lastIndexOf("@") <= 0
  return (await Npm.add(bare ? `${spec}@latest` : spec)).directory
}

function installDetail(cause: unknown) {
  const text = cause instanceof Error ? `${cause.message}\n${String((cause.cause as { stderr?: unknown } | undefined)?.stderr ?? "")}` : String(cause)
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  return lines.find((line) => line.startsWith("error:"))?.replace(/^error:\s*/, "") ?? lines.at(-1) ?? "unknown error"
}

function packageTargets(spec: string, json: Record<string, unknown>) {
  const exported = (kind: Target) => {
    const exports = json.exports
    if (typeof exports !== "object" || exports === null) return false
    const value = (exports as Record<string, unknown>)[`./${kind}`]
    if (typeof value === "string") return value.trim() !== ""
    if (typeof value !== "object" || value === null) return false
    return ["import", "default"].some((key) => {
      const entry = (value as Record<string, unknown>)[key]
      return typeof entry === "string" && entry.trim() !== ""
    })
  }
  const main = typeof json.main === "string" && json.main.trim() !== ""
  const themes = json["oc-themes"]
  if (themes !== undefined && (!Array.isArray(themes) || themes.some((item) => typeof item !== "string" || !item.trim())))
    throw new TypeError(`Plugin ${spec} has an invalid oc-themes field`)
  const server = exported("server") || main
  const tui = exported("tui") || (Array.isArray(themes) && themes.length > 0)
  return [...(server ? (["server"] as const) : []), ...(tui ? (["tui"] as const) : [])]
}
