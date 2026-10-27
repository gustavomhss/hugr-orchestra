export * as TuiConfigFiles from "./tui-config-files"

import { parse, printParseErrorCode, type ParseError } from "jsonc-parser"
import fs from "fs/promises"
import path from "path"
import { Flag } from "./flag/flag"
import { Global } from "./global"

const names = ["tui.json", "tui.jsonc"]

export interface File {
  readonly path: string
  readonly value: unknown
}

/**
 * Reads `tui.json` and `tui.jsonc` from the global config folder, then from each folder between the project root and
 * `directory` (and its `.orchestra` folder), from lowest to highest priority. The project root is the nearest
 * ancestor with a `.git` entry. A file that cannot be parsed throws an error naming it, so the user never silently
 * runs on defaults. The TUI package owns the schema, so the caller decodes `value`.
 */
export async function read(directory: string, globalConfig = Global.make().config): Promise<File[]> {
  const folders = [globalConfig, ...(Flag.ORCHESTRA_DISABLE_PROJECT_CONFIG ? [] : await projectFolders(directory))]
  const files = await Promise.all(folders.flatMap((folder) => names.map((name) => path.join(folder, name))).map(load))
  return files.filter((file): file is File => file !== undefined)
}

async function projectFolders(directory: string) {
  const ancestors = async (current: string): Promise<string[]> => {
    const parent = path.dirname(current)
    if (parent === current || (await fs.stat(path.join(current, ".git")).catch(() => undefined))) return [current]
    return [current, ...(await ancestors(parent))]
  }
  // Farthest folder first, so the folder nearest the opened directory wins.
  return (await ancestors(path.resolve(directory))).toReversed().flatMap((folder) => [folder, path.join(folder, ".orchestra")])
}

async function load(file: string): Promise<File | undefined> {
  const text = await fs.readFile(file, "utf8").catch(() => undefined)
  if (!text?.trim()) return undefined
  const errors: ParseError[] = []
  const value: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length)
    throw new Error(
      `${file}: ${errors.map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`).join(", ")}`,
    )
  return { path: file, value }
}
