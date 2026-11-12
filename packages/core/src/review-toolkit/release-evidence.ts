export * as ReviewReleaseEvidence from "./release-evidence"

import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { optional } from "@orchestra/schema/schema"

const file = Schema.NonEmptyString.check(Schema.isMaxLength(8192))
export const Input = Schema.Struct({
  artifact: file,
  signer: optional(Schema.Struct({ publicKey: file, sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)) })),
  signature: optional(file),
  provenance: optional(file),
  updater: optional(file),
  sbom: optional(file),
  notes: optional(file),
})
export type Input = typeof Input.Type
export type Field = "artifact" | "publicKey" | "signature" | "provenance" | "updater" | "sbom" | "notes"
export type File = { readonly path: string; readonly sha256: string; readonly bytes: Uint8Array } | { readonly path: string; readonly reason: string }
export type Captured = { readonly input?: Input; readonly identity: string; readonly files: Readonly<Partial<Record<Field, File>>> }
export const LIMITS = { artifact: 64 * 1024 * 1024, evidence: 1024 * 1024, publicKey: 16 * 1024 } as const

const roles = ["artifact", "publicKey", "signature", "provenance", "updater", "sbom", "notes"] as const
const blocked = new Set(["", ".", "..", ".git", "node_modules", "vendor"])
const openFlags = constants.O_NOFOLLOW ? constants.O_RDONLY | constants.O_NOFOLLOW | (constants.O_NONBLOCK ?? 0) : undefined

export const capture: (root: string, input?: Input) => Effect.Effect<Captured> = (root, input) => {
  const cloned = input === undefined ? undefined : cloneInput(input)
  if (cloned === undefined) return Effect.sync(() => pack(undefined, ""))
  return Effect.promise(() => load(root, cloned))
}

function cloneInput(input: Input): Input {
  return {
    artifact: input.artifact,
    ...(input.signer === undefined ? {} : { signer: { publicKey: input.signer.publicKey, sha256: input.signer.sha256 } }),
    ...(input.signature === undefined ? {} : { signature: input.signature }),
    ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
    ...(input.updater === undefined ? {} : { updater: input.updater }),
    ...(input.sbom === undefined ? {} : { sbom: input.sbom }),
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  }
}

function pack(input: Input | undefined, fingerprint: string, files: Partial<Record<Field, File>> = {}): Captured {
  const rows = roles.map((field) => {
    const item = files[field]
    if (item === undefined) return [field, "", "missing", "", "", fingerprint]
    if ("reason" in item) return [field, item.path, "error", "", item.reason, fingerprint]
    return [field, item.path, "captured", item.sha256, "", fingerprint]
  })
  const identity = createHash("sha256").update(JSON.stringify(rows)).digest("hex")
  const mapped = Object.fromEntries(roles.flatMap((field) => (files[field] === undefined ? [] : [[field, files[field]]])))
  if (input === undefined) return { identity, files: mapped }
  return { input, identity, files: mapped }
}

async function load(root: string, input: Input): Promise<Captured> {
  const fingerprint = input.signer?.sha256 ?? ""
  const requests = roles.flatMap((field) => {
    const rel = pathOf(input, field)
    return rel === undefined ? [] : [[field, rel] as const]
  })
  const rootResult = requests.some(([, rel]) => !unsafe(rel)) ? await canonicalRoot(root) : undefined
  const entries = await Promise.all(requests.map(async ([field, rel]) => {
    if (unsafe(rel)) return [field, { path: rel, reason: "unsafe-path" }] as const
    if (typeof rootResult !== "string") return [field, { path: rel, reason: rootResult?.reason ?? "ENOENT" }] as const
    return [field, await readRole(rootResult, field, rel)] as const
  }))
  return pack(input, fingerprint, Object.fromEntries(entries))
}

function pathOf(input: Input, field: Field) {
  if (field === "artifact") return input.artifact
  if (field === "publicKey") return input.signer?.publicKey
  if (field === "signature") return input.signature
  if (field === "provenance") return input.provenance
  if (field === "updater") return input.updater
  if (field === "sbom") return input.sbom
  return input.notes
}

function unsafe(value: string) {
  if (value.includes("\0") || value.includes("\\") || value.includes("\r") || value.includes("\n")) return true
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value)) return true
  return value.split("/").some((part) => blocked.has(part))
}

async function canonicalRoot(root: string): Promise<string | { reason: string }> {
  try {
    return await realpath(root)
  } catch (error) {
    return { reason: errno(error) }
  }
}

async function readRole(rootReal: string, field: Field, rel: string): Promise<File> {
  if (openFlags === undefined) return { path: rel, reason: "nofollow-unavailable" }
  const parts = rel.split("/")
  const lexical = path.join(rootReal, ...parts)
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    const walked = await walk(rootReal, parts)
    if (typeof walked === "string") return { path: rel, reason: walked }
    const resolved = await realpath(lexical)
    if (!pinned(rootReal, lexical, resolved)) return { path: rel, reason: "outside-root" }
    handle = await open(lexical, openFlags)
    const opened = await handle.stat()
    const limit = field === "artifact" ? LIMITS.artifact : field === "publicKey" ? LIMITS.publicKey : LIMITS.evidence
    if (!opened.isFile() || opened.ino !== walked.ino || opened.dev !== walked.dev || opened.size !== walked.size) {
      return { path: rel, reason: "unstable" }
    }
    if (!Number.isSafeInteger(opened.size) || opened.size < 0) return { path: rel, reason: "EINVAL" }
    if (opened.size > limit) return { path: rel, reason: "oversize" }
    const buf = Buffer.alloc(opened.size + 1)
    const read = await handle.read(buf, 0, opened.size + 1, 0)
    if (read.bytesRead !== opened.size) return { path: rel, reason: "size-changed" }
    const after = await handle.stat()
    if (!after.isFile() || after.ino !== opened.ino || after.dev !== opened.dev || after.size !== opened.size) {
      return { path: rel, reason: "unstable" }
    }
    const again = await walk(rootReal, parts)
    if (typeof again === "string") return { path: rel, reason: again }
    const resolvedAgain = await realpath(lexical)
    if (!pinned(rootReal, lexical, resolvedAgain) || again.ino !== opened.ino || again.dev !== opened.dev) {
      return { path: rel, reason: "outside-root" }
    }
    const bytes = new Uint8Array(read.bytesRead)
    bytes.set(buf.subarray(0, read.bytesRead))
    return { path: rel, sha256: createHash("sha256").update(bytes).digest("hex"), bytes }
  } catch (error) {
    return { path: rel, reason: errno(error) }
  } finally {
    if (handle !== undefined) await handle.close().then(() => undefined, () => undefined)
  }
}

async function walk(rootReal: string, parts: ReadonlyArray<string>) {
  let cursor = rootReal
  for (const [index, part] of parts.entries()) {
    cursor = path.join(cursor, part)
    const st = await lstat(cursor)
    if (st.isSymbolicLink()) return "symlink"
    const last = index === parts.length - 1
    if (!last && !st.isDirectory()) return "ENOTDIR"
    if (!last) continue
    if (!st.isFile()) return "not-regular-file"
    return { ino: st.ino, dev: st.dev, size: st.size }
  }
  return "ENOENT"
}

function pinned(rootReal: string, lexical: string, resolved: string) {
  if (resolved !== lexical) return false
  const prefix = rootReal.endsWith(path.sep) ? rootReal : rootReal + path.sep
  return resolved.startsWith(prefix)
}

function errno(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" && /^[A-Z0-9]+$/.test(error.code)) {
    return error.code
  }
  return "EIO"
}
