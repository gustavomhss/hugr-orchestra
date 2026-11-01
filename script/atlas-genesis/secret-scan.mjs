// Refuse to upload an Atlas genesis artifact that carries a credential.
//
// Usage: node script/atlas-genesis/secret-scan.mjs <file-or-dir>...
// Secret VALUES come from the environment (ATLAS_SCAN_SECRETS, one per line) and are never printed. Every
// file under the given paths is also checked for credential SHAPES (Anthropic keys and OAuth tokens). On a hit
// the offending file names are printed and the exit code is 1; nothing about the match itself is printed.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const values = (process.env.ATLAS_SCAN_SECRETS ?? "")
  .split("\n")
  .map((v) => v.trim())
  .filter((v) => v.length >= 8)
const shapes = [/sk-ant-[A-Za-z0-9_-]{8,}/, /\boauth[_-]?token["'\s:=]+[A-Za-z0-9._-]{16,}/i, /\bBearer\s+[A-Za-z0-9._-]{20,}/]

const files = (path) => {
  if (!existsSync(path)) return []
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path).flatMap((entry) => files(join(path, entry)))
}

const hits = process.argv
  .slice(2)
  .flatMap(files)
  .filter((file) => {
    const text = readFileSync(file).toString("latin1")
    return values.some((v) => text.includes(v)) || shapes.some((re) => re.test(text))
  })

if (hits.length > 0) {
  console.error(`secret-scan: ${hits.length} file(s) carry a credential and will not be uploaded:`)
  for (const file of hits) console.error(`  ${file}`)
  process.exit(1)
}
console.log(`secret-scan: clean (${process.argv.length - 2} path(s) scanned)`)
