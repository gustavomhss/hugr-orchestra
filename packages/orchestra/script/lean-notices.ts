import path from "node:path"
import { createHash } from "node:crypto"

export const leanPin = {
  name: "hugr-lean",
  version: "0.2.0",
  repository: "https://github.com/gustavomhss/HuGR-Lean",
  commit: "cfe14329cc98f0a2778acdd148e66dbf5a0dd668",
  sha256: "4e46ae0534937bdfedd46f667292d9904f2446a0fe01479ea0e6c71a74862af6",
  integrity: "sha512-Z1q0Y3UjzX74WPrVSRMU/JQwxkIk+EZs9/nR51TUkJegVtyoxF7Q5A9CYjTwNRVG/3ubdfe55wErWZX1UI3AqQ==",
  modifications: "None; license materials copied byte-for-byte from the approved pinned archive.",
}
export const leanMaterials = ["LICENSE", "NOTICE", "licenses/TRS-MIT.txt"]
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

export async function leanNotices(outdir: string) {
  const core = path.resolve(import.meta.dirname, "../../core")
  const archive = new Uint8Array(await Bun.file(path.join(core, "vendor/hugr-lean-0.2.0.tgz")).arrayBuffer())
  if (sha256(archive) !== leanPin.sha256) throw new Error("Unapproved Lean archive")
  const files = await new Bun.Archive(archive).files()
  const metadata = files.get("package/package.json")
  if (!metadata) throw new Error("Missing Lean package metadata")
  const pkg = JSON.parse(await metadata.text())
  if (pkg.name !== leanPin.name || pkg.version !== leanPin.version) throw new Error("Unapproved Lean package")
  const materials = await Promise.all(leanMaterials.map(async (file) => {
    const original = files.get(`package/${file}`)
    if (!original) throw new Error(`Missing Lean material: ${file}`)
    const bytes = new Uint8Array(await original.arrayBuffer())
    if (!bytes.length) throw new Error(`Empty Lean material: ${file}`)
    await Bun.write(path.join(outdir, "licenses/hugr-lean", file), bytes)
    return { path: file, sha256: sha256(bytes) }
  }))
  await Bun.write(path.join(outdir, "licenses/hugr-lean/manifest.json"), JSON.stringify({ ...leanPin, materials }, null, 2) + "\n")
}
