#!/usr/bin/env bun
import { chmod, mkdir, readdir } from "node:fs/promises"
import { basename, join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { archiveDistribution, prepareDistribution, verifyDistribution } from "./distribution-payload"
import { prepareNpmDistribution } from "./distribution-npm"

// Release producer. `payload` turns one native build into a verified payload and archive.
// `assemble` turns every target's payload and archive into npm packages
// and SHA256SUMS. It publishes nothing: the release workflow owns registries,
// the GitHub release and every credential.
const usage = `Usage:
  release.ts payload --version X.Y.Z --target <target> --out <dir> [--dist apps/cli/dist]
  release.ts assemble --version X.Y.Z --payloads <dir> --archives <dir> --base-url <https url> --out <dir>`

const { positionals, values } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  strict: true,
  options: {
    version: { type: "string" },
    target: { type: "string" },
    dist: { type: "string", default: join(import.meta.dir, "../dist") },
    out: { type: "string" },
    payloads: { type: "string" },
    archives: { type: "string" },
    "base-url": { type: "string" },
  },
})

const version = requireValue("version")
if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) throw new Error("Release version must be stable X.Y.Z")
const out = resolve(requireValue("out"))

if (positionals[0] === "payload") {
  const target = requireValue("target")
  const payload = join(out, "payloads", target)
  await mkdir(join(out, "payloads"), { recursive: true })
  await mkdir(join(out, "archives"), { recursive: true })
  await prepareDistribution({ dist: resolve(values.dist), out: payload, version, target })
  const archive = await archiveDistribution({ directory: payload, file: join(out, "archives", archiveName(version, target)) })
  console.log(JSON.stringify({ target, archive: basename(archive.file), sha256: archive.sha256 }))
  process.exit(0)
}

if (positionals[0] === "assemble") {
  const payloadRoot = resolve(requireValue("payloads"))
  const archiveRoot = resolve(requireValue("archives"))
  const baseURL = requireValue("base-url").replace(/\/+$/, "")
  const payloads = (await readdir(payloadRoot)).toSorted().map((target) => join(payloadRoot, target))
  // Payloads arrive extracted from the release archives; Bun normalizes tar modes,
  // so executable flags come back from each descriptor before verification.
  await Promise.all(payloads.map(async (payload) => {
    const descriptor: { files: { path: string; executable: boolean }[] } = await Bun.file(join(payload, "distribution.json")).json()
    if (descriptor.files.some((file) => file.path.split("/").some((part) => !part || part === "." || part === "..")))
      throw new Error(`Unsafe descriptor path in ${payload}`)
    await Promise.all(descriptor.files.map((file) => chmod(join(payload, file.path), file.executable ? 0o755 : 0o644)))
  }))
  const manifests = await Promise.all(payloads.map((payload) => verifyDistribution(payload, { version, target: basename(payload) })))
  const archives = await Promise.all(manifests.map(async (manifest) => {
    const name = archiveName(version, manifest.target)
    const bytes = await Bun.file(join(archiveRoot, name)).bytes()
    return { target: manifest.target, name, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") }
  }))
  const extra = (await readdir(archiveRoot)).filter((name) => !archives.some((archive) => archive.name === name))
  if (extra.length) throw new Error(`Archives without a verified payload: ${extra.join(", ")}`)
  await prepareNpmDistribution({ payloads, out: join(out, "npm") })
  await Bun.write(join(out, "SHA256SUMS"), archives.map((archive) => `${archive.sha256}  ${archive.name}\n`).join(""))
  console.log(JSON.stringify({ version, targets: archives.map((archive) => archive.target) }))
  process.exit(0)
}

throw new Error(usage)

function requireValue(name: "version" | "target" | "out" | "payloads" | "archives" | "base-url") {
  const value = values[name]
  if (!value) throw new Error(`Missing --${name}\n${usage}`)
  return value
}

function archiveName(version: string, target: string) {
  return `orchestra-${version}-${target}.tar.gz`
}
