// Refuse to upload an Atlas genesis artifact that carries a credential.
//
// Usage: node script/atlas-genesis/secret-scan.mjs <file-or-dir>...
// Full known VALUES come from ATLAS_SCAN_SECRETS (newline values or JSON) and the optional current
// ATLAS_SCAN_AUTH_FILE JSON. Existing Anthropic/OAuth/Bearer SHAPES are also checked, not arbitrary
// unlabeled token fragments. Only offending artifact paths are printed, never matched values.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const shapes = [/sk-ant-[A-Za-z0-9_-]{8,}/, /\boauth[_-]?token["'\s:=]+[A-Za-z0-9._-]{16,}/i, /\bBearer\s+[A-Za-z0-9._-]{20,}/]

export function credentialValues(text) {
  const values = new Set([text, ...text.split("\n").map((value) => value.trim())].filter((value) => value.length >= 8))
  const collect = (value) => {
    if (typeof value === "string" && value.length >= 8) values.add(value)
    if (value && typeof value === "object") Object.values(value).forEach(collect)
  }
  try {
    collect(JSON.parse(text))
  } catch {
    // Legacy newline-separated values need not be JSON.
  }
  return [...values]
}

const files = (path) => {
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path).flatMap((entry) => files(join(path, entry)))
}

export function findCredentialFiles(paths, { secrets = "", authFile } = {}) {
  if (paths.length === 0) throw Object.assign(new Error("secret-scan: artifact paths required"), { name: "SecretScanInputError" })
  const values = new Set(credentialValues(secrets))
  if (authFile !== undefined) {
    try {
      const text = readFileSync(authFile, "utf8")
      JSON.parse(text)
      credentialValues(text).forEach((value) => values.add(value))
    } catch {
      throw Object.assign(new Error("secret-scan: auth file unavailable or invalid"), { name: "SecretScanAuthError" })
    }
  }
  try {
    return [...new Set(paths.flatMap(files))].filter((file) => {
      const text = readFileSync(file).toString("latin1")
      return [...values].some((value) => text.includes(value)) || shapes.some((shape) => shape.test(text))
    })
  } catch {
    throw Object.assign(new Error("secret-scan: artifact unavailable or unreadable"), { name: "SecretScanArtifactError" })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const hits = findCredentialFiles(process.argv.slice(2), {
      secrets: process.env.ATLAS_SCAN_SECRETS ?? "",
      authFile: process.env.ATLAS_SCAN_AUTH_FILE,
    })
    if (hits.length === 0) console.log(`secret-scan: no known credential detected (${process.argv.length - 2} path(s) scanned)`)
    if (hits.length > 0) {
      console.error(`secret-scan: ${hits.length} file(s) carry a credential and will not be uploaded:`)
      for (const file of hits) console.error(`  ${file}`)
      process.exitCode = 1
    }
  } catch {
    console.error("secret-scan: scan failed; upload refused")
    process.exitCode = 1
  }
}
