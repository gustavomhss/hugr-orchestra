export * as ConfigPluginFile from "./plugin-file"

import path from "path"
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
