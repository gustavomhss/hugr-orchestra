import path from "node:path"
import { createHash } from "node:crypto"
import { chmod, lstat, mkdir, readdir, realpath, writeFile } from "node:fs/promises"
import { archiveInventory, type Scope } from "./archive-inventory.ts"

type Member = { path: string; mode: string; gitBlob: string; bytes: number; sha256: string }
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
const objectID = (value: unknown): value is string => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)
const sha256 = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const overlaps = (a: string, b: string, separator = path.sep) => a === b || a.startsWith(b + separator) || b.startsWith(a + separator)

export async function createRecoveryBundle(repository: string, revision: string, destination: string, scopes?: Scope[]) {
  const source = await realpath((await git(repository, ["rev-parse", "--show-toplevel"])).toString().trim())
  const inventory = await archiveInventory(source, revision, scopes)
  const output = await emptyDestination(destination, [source])
  await mkdir(path.join(output, "blobs"))
  const files: Member[] = []
  const stored = new Set<string>()
  // Read one Git object at a time; never archive/extract the checkout or burst per-file reads.
  for (const scope of inventory.scopes) {
    for (const member of scope.files) {
      safePath(member.path)
      const bytes = await git(source, ["cat-file", "blob", member.blob])
      const gitBlob = createHash(member.blob.length === 40 ? "sha1" : "sha256")
        .update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
      if (bytes.length !== member.bytes || gitBlob !== member.blob) throw new Error(`RECOVERY_GIT_BLOB_INVALID:${member.path}`)
      const hash = digest(bytes)
      if (!stored.has(hash)) {
        await writeFile(path.join(output, "blobs", hash), bytes, { flag: "wx", mode: 0o600 })
        stored.add(hash)
      }
      files.push({ path: member.path, mode: member.mode, gitBlob: member.blob, bytes: bytes.length, sha256: hash })
    }
  }
  const manifest = { format: 1 as const, source: inventory.source, scopes: inventory.scopes.map(({ files, ...scope }) => scope), files }
  validateManifest(manifest)
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n")
  // The checksum is the final publication marker. Partial bundles cannot be restored.
  await writeFile(path.join(output, "manifest.json"), bytes, { flag: "wx", mode: 0o600 })
  await writeFile(path.join(output, "manifest.sha256"), digest(bytes) + "\n", { flag: "wx", mode: 0o600 })
  return manifest
}

export async function restoreRecoveryBundle(bundle: string, destination: string) {
  const input = await ownedDirectory(bundle)
  const entries = await readdir(input)
  const unexpected = entries.find((name) => !["manifest.json", "manifest.sha256", "blobs"].includes(name))
  if (unexpected) throw new Error(`RECOVERY_UNEXPECTED_ENTRY:${unexpected}`)
  const bytes = await ownedFile(path.join(input, "manifest.json"))
  const checksum = (await ownedFile(path.join(input, "manifest.sha256"))).toString()
  if (!/^[a-f0-9]{64}\n?$/.test(checksum) || checksum.trim() !== digest(bytes)) throw new Error("RECOVERY_MANIFEST_CHECKSUM_INVALID:manifest.json")
  const manifest = validateManifest(parseManifest(bytes))
  const blobs = await ownedDirectory(path.join(input, "blobs"))
  const expected = new Set(manifest.files.map((file) => file.sha256))
  const extra = (await readdir(blobs)).find((name) => !expected.has(name))
  if (extra) throw new Error(`RECOVERY_UNEXPECTED_BLOB:${extra}`)
  // Validate all payloads before even creating the destination.
  for (const file of manifest.files) await verifiedBlob(blobs, file)
  const output = await emptyDestination(destination, [input], true)
  for (const file of manifest.files) {
    const target = path.join(output, file.path)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, await verifiedBlob(blobs, file), { flag: "wx", mode: file.mode === "100755" ? 0o755 : 0o644 })
    await chmod(target, file.mode === "100755" ? 0o755 : 0o644)
  }
  return manifest
}

function safePath(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value || path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /[\\:\x00-\x1f\x7f]/.test(value) || value.split("/").some((part) => !part || part === "." || part === ".." || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)))
    throw new Error(`RECOVERY_PATH_INVALID:${String(value)}`)
}

function validateManifest(value: unknown) {
  if (!record(value) || value.format !== 1 || !record(value.source) || !objectID(value.source.revision) || !objectID(value.source.tree)) throw new Error("RECOVERY_MANIFEST_INVALID:source")
  if (!Array.isArray(value.scopes) || !value.scopes.length || !Array.isArray(value.files) || !value.files.length) throw new Error("RECOVERY_MANIFEST_EMPTY")
  const scopes = value.scopes.map((scope): Scope => {
    if (!record(scope)) throw new Error("RECOVERY_SCOPE_INVALID")
    safePath(scope.path)
    const disposition = scope.disposition
    if ((disposition !== "retain-recovery" && disposition !== "retain-runtime" && disposition !== "review-history") || typeof scope.owner !== "string" || !scope.owner.trim() || !Array.isArray(scope.readers) || !scope.readers.length || !scope.readers.every((reader): reader is string => typeof reader === "string" && !!reader.trim()) || (scope.uncertainty !== undefined && (typeof scope.uncertainty !== "string" || !scope.uncertainty.trim()))) throw new Error(`RECOVERY_SCOPE_INVALID:${scope.path}`)
    return { path: scope.path, disposition, owner: scope.owner, readers: scope.readers, ...(typeof scope.uncertainty === "string" ? { uncertainty: scope.uncertainty } : {}) }
  })
  const duplicateScope = scopes.find((scope, index) => scopes.some((other, otherIndex) => index !== otherIndex && overlaps(scope.path.toLowerCase(), other.path.toLowerCase(), "/")))
  if (duplicateScope) throw new Error(`RECOVERY_SCOPE_OVERLAP:${duplicateScope.path}`)
  const files = value.files.map((file): Member => {
    if (!record(file)) throw new Error("RECOVERY_MEMBER_INVALID")
    safePath(file.path)
    if ((file.mode !== "100644" && file.mode !== "100755") || !objectID(file.gitBlob) || !sha256(file.sha256) || typeof file.bytes !== "number" || !Number.isSafeInteger(file.bytes) || file.bytes < 0) throw new Error(`RECOVERY_MEMBER_INVALID:${file.path}`)
    const member = { path: file.path, mode: file.mode, gitBlob: file.gitBlob, bytes: file.bytes, sha256: file.sha256 }
    if (!scopes.some((scope) => member.path.startsWith(scope.path + "/"))) throw new Error(`RECOVERY_MEMBER_SCOPE_INVALID:${member.path}`)
    return member
  })
  const duplicate = files.find((file, index) => files.some((other, otherIndex) => index !== otherIndex && overlaps(file.path.toLowerCase(), other.path.toLowerCase(), "/")))
  if (duplicate) throw new Error(`RECOVERY_MEMBER_OVERLAP:${duplicate.path}`)
  const empty = scopes.find((scope) => !files.some((file) => file.path.startsWith(scope.path + "/")))
  if (empty) throw new Error(`RECOVERY_SCOPE_EMPTY:${empty.path}`)
  return { format: 1 as const, source: { revision: value.source.revision, tree: value.source.tree }, scopes, files }
}

async function ownedDirectory(directory: string) {
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink() || (process.getuid && info.uid !== process.getuid())) throw new Error(`RECOVERY_DIRECTORY_INVALID:${directory}`)
  return realpath(directory)
}

async function ownedFile(file: string) {
  const info = await lstat(file).catch((error: unknown) => { throw new Error(`RECOVERY_INPUT_MISSING:${file}`, { cause: error }) })
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (process.getuid && info.uid !== process.getuid())) throw new Error(`RECOVERY_INPUT_INVALID:${file}`)
  return Buffer.from(await Bun.file(file).arrayBuffer())
}

async function verifiedBlob(directory: string, file: Member) {
  const bytes = await ownedFile(path.join(directory, file.sha256))
  const gitBlob = createHash(file.gitBlob.length === 40 ? "sha1" : "sha256")
    .update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
  if (bytes.length !== file.bytes || digest(bytes) !== file.sha256 || gitBlob !== file.gitBlob)
    throw new Error(`RECOVERY_BLOB_INVALID:${file.path}:${file.sha256}`)
  return bytes
}

async function emptyDestination(destination: string, excluded: string[], rejectRepository = false) {
  const requested = path.resolve(destination)
  const info = await lstat(requested).catch((error: unknown) => {
    if (record(error) && error.code === "ENOENT") return undefined
    throw error
  })
  if (info && (!info.isDirectory() || info.isSymbolicLink() || (process.getuid && info.uid !== process.getuid()))) throw new Error(`RECOVERY_DESTINATION_INVALID:${destination}`)
  // Resolve existing parents physically; symlink aliases cannot bypass overlap checks.
  const parent = await realpath(path.dirname(requested))
  const target = info ? await realpath(requested) : path.join(parent, path.basename(requested))
  if (excluded.some((directory) => overlaps(target, directory))) throw new Error(`RECOVERY_DESTINATION_OVERLAP:${destination}`)
  if (rejectRepository) {
    // The portable manifest has no source-machine path. Reject checkout destinations
    // to prevent restoration into the original source (including through aliases).
    for (const ancestor of ancestors(target)) {
      const gitEntry = await lstat(path.join(ancestor, ".git")).catch((error: unknown) => {
        if (record(error) && error.code === "ENOENT") return undefined
        throw error
      })
      if (gitEntry) throw new Error(`RECOVERY_DESTINATION_REPOSITORY:${destination}`)
    }
  }
  if (info && (await readdir(target)).length) throw new Error(`RECOVERY_DESTINATION_NOT_EMPTY:${destination}`)
  if (!info) await mkdir(target, { mode: 0o700 })
  return target
}

function ancestors(directory: string): string[] {
  const parent = path.dirname(directory)
  return parent === directory ? [directory] : [directory, ...ancestors(parent)]
}

function parseManifest(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  } catch (cause) {
    throw new Error("RECOVERY_MANIFEST_INVALID:manifest.json", { cause })
  }
}

async function git(repository: string, args: string[]) {
  const process = Bun.spawn(["git", "--no-replace-objects", "-C", repository, ...args], { stdout: "pipe", stderr: "pipe" })
  const [bytes, error, status] = await Promise.all([new Response(process.stdout).arrayBuffer(), new Response(process.stderr).text(), process.exited])
  if (status !== 0) throw new Error(`RECOVERY_GIT_FAILED:${args[0]}:${error.trim()}`)
  return Buffer.from(bytes)
}
