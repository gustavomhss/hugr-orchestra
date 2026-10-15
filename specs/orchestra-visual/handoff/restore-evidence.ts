import path from "node:path"
import { fileURLToPath } from "node:url"

// Recovery utility, not application code or a CI gate. Use a new output path.
const directory = path.dirname(fileURLToPath(import.meta.url))
const target = process.argv[2]
if (!target) throw new Error("Usage: bun restore-evidence.ts <new-output.tar.gz>")
if (await Bun.file(target).exists()) throw new Error("Output already exists; choose a new recovery destination")
const manifest = await Bun.file(path.join(directory, "evidence-snapshot.json")).json()
if (!Array.isArray(manifest.archive.parts) || !manifest.archive.parts.length)
  throw new Error("Evidence manifest has no archive parts")
const expected = manifest.archive.parts.map((part: { path: string }) => part.path)
if (expected.some((name: string, index: number) => !name.endsWith(`.part-${String(index).padStart(3, "0")}`)))
  throw new Error("Evidence parts are not in contiguous numeric order")

const hash = new Bun.CryptoHasher("sha256")
const bytes: Uint8Array[] = []
for (const part of manifest.archive.parts) {
  const content = new Uint8Array(await Bun.file(path.join(directory, part.path)).arrayBuffer())
  if (content.byteLength !== part.bytes || new Bun.CryptoHasher("sha256").update(content).digest("hex") !== part.sha256)
    throw new Error(`Archive part failed verification: ${part.path}`)
  hash.update(content)
  bytes.push(content)
}
if (hash.digest("hex") !== manifest.archive.sha256) throw new Error("Reconstructed archive failed SHA-256 verification")
await Bun.write(target, new Blob(bytes))
console.log(JSON.stringify({ output: target, bytes: Bun.file(target).size, sha256: manifest.archive.sha256 }))
