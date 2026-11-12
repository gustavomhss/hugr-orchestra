import { readdirSync, lstatSync } from "node:fs"
import { dirname, join, extname } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { nativeSha256 } from "./genesis-native-io.js"
import { readFileSync } from "node:fs"

/** Actual executing adapter and resolved knowledge trees, not user-declared implementation labels. */
export function evaluationRuntimeIdentity(): Record<string, string> {
  const files: [string, string][] = []
  const collect = (root: string, prefix: string, extension: string, relative = "") => {
    for (const name of readdirSync(join(root, relative)).sort()) {
      const path = join(root, relative, name), key = join(relative, name), stat = lstatSync(path)
      if (stat.isSymbolicLink()) throw new Error("evaluation-runtime-symlink")
      if (stat.isDirectory()) collect(root, prefix, extension, key)
      if (stat.isFile() && extname(name) === extension && !name.endsWith(".d.ts")) files.push([`${prefix}/${key}`, nativeSha256(readFileSync(path))])
    }
  }
  const own = fileURLToPath(import.meta.url)
  collect(dirname(own), "adapter", extname(own))
  const knowledge = createRequire(import.meta.url).resolve("@atlas/knowledge")
  collect(dirname(knowledge), "knowledge", extname(knowledge))
  return Object.fromEntries(files)
}
