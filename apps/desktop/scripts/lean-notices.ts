import path from "node:path"
import { createHash } from "node:crypto"
import { WorkspacePaths } from "@orchestra/script/workspace-paths"

// The lean candidate ships these notices from a gitignored desktop build directory (electron-builder.candidate.config.ts).
export const leanOutput = path.resolve(import.meta.dirname, "../dist/lean-notices")

export const leanPin = {
  name: "hugr-lean",
  version: "0.4.0",
  repository: "https://github.com/gustavomhss/HuGR-Lean",
  commit: "0660c2b5dc9249816330603160aadfaeb33e5fc7",
  tree: "af1e9f1bd9781588fde339737e6c006886c64a4f",
  artifact: "hugr-lean-0.4.0-0660c2b5dc92.tgz",
  producer: "https://github.com/gustavomhss/HuGR-Lean/actions/runs/38402476737",
  sha256: "5ff983c58aa056d82059d5edd5b428478dda50a7683a201b7d844949aa1712a3",
  integrity: "sha512-mN7VGI6MBXiswd5ye0zJZML5loxhdrL3/HJbzvvXT8Cv6kMTyYsR7YorNYk6REdwEE4E4BfiwnuzZljOCDlkew==",
  modifications: "npm registry tarball bytes unchanged; immutable filename. All shipped license/provenance materials copied byte-for-byte.",
}
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

export async function leanNotices(outdir: string) {
  const core = WorkspacePaths.make(import.meta.dirname).module("core")
  const archive = new Uint8Array(await Bun.file(path.join(core, "vendor", leanPin.artifact)).arrayBuffer())
  if (sha256(archive) !== leanPin.sha256) throw new Error("Unapproved Lean archive")
  if (`sha512-${createHash("sha512").update(archive).digest("base64")}` !== leanPin.integrity) throw new Error("Lean archive integrity mismatch")
  const dependency = (await Bun.file(path.join(core, "package.json")).json()).dependencies[leanPin.name]
  if (dependency !== `file:./vendor/${leanPin.artifact}`) throw new Error("Lean package dependency differs from notice pin")
  const files = await new Bun.Archive(archive).files()
  const metadata = files.get("package/package.json")
  if (!metadata) throw new Error("Missing Lean package metadata")
  const pkg = JSON.parse(await metadata.text())
  if (pkg.name !== leanPin.name || pkg.version !== leanPin.version) throw new Error("Unapproved Lean package")
  // Extension: derive all shipped license/source notes from the digest-verified archive, not a second inventory.
  const names = [...files.keys()].filter((file) => file === "package/LICENSE" || file === "package/NOTICE" || file.startsWith("package/licenses/") || file.endsWith("/SOURCES.md"))
    .map((file) => file.slice("package/".length)).sort()
  for (const required of ["LICENSE", "NOTICE"]) if (!names.includes(required)) throw new Error(`Missing Lean material: ${required}`)
  if (!names.some((file) => file.startsWith("licenses/"))) throw new Error("Missing Lean donor licenses")
  if (!names.some((file) => file.endsWith("/SOURCES.md"))) throw new Error("Missing Lean source provenance")
  const materials = await Promise.all(names.map(async (file) => {
    if (path.isAbsolute(file) || file.includes("\\") || file.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`Invalid Lean material path: ${file}`)
    const original = files.get(`package/${file}`)
    if (!original) throw new Error(`Missing Lean material: ${file}`)
    const bytes = new Uint8Array(await original.arrayBuffer())
    if (!bytes.length) throw new Error(`Empty Lean material: ${file}`)
    await Bun.write(path.join(outdir, "licenses/hugr-lean", file), bytes)
    return { path: file, sha256: sha256(bytes) }
  }))
  await Bun.write(path.join(outdir, "licenses/hugr-lean/manifest.json"), JSON.stringify({ ...leanPin, materials }, null, 2) + "\n")
}
