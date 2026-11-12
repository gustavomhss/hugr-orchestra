import { createHash, generateKeyPairSync, sign } from "node:crypto"
import { mkdir, open, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { tmpdir } from "../fixture/tmpdir"
import { ReviewReleaseEvidence } from "../../src/review-toolkit/release-evidence"

const artifactLimit = 64 * 1024 * 1024
const evidenceLimit = 1024 * 1024
const keyLimit = 16 * 1024
const roles = { artifact: true, publicKey: true, signature: true, provenance: true, updater: true, sbom: true, notes: true } satisfies {
  [K in ReviewReleaseEvidence.Field]: true
}
const fields = Object.keys(roles) as Array<ReviewReleaseEvidence.Field>
const evidenceFields = ["signature", "provenance", "updater", "sbom", "notes"] as const
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")
type Row = { field: string; path: string; status: string; bytesSHA256: string; reason: string; requestSignerFingerprint: string }
const identity = (items: ReadonlyArray<Row>) =>
  createHash("sha256").update(JSON.stringify(items.map((row) => [row.field, row.path, row.status, row.bytesSHA256, row.reason, row.requestSignerFingerprint]))).digest("hex")
const rows = (
  present: Partial<Record<ReviewReleaseEvidence.Field, { path: string; bytesSHA256: string }>>,
  fingerprint: string,
  errors: Partial<Record<ReviewReleaseEvidence.Field, { path: string; reason: string }>> = {},
) =>
  fields.map((field) => {
    const hit = present[field]
    if (hit) return { field, path: hit.path, status: "captured", bytesSHA256: hit.bytesSHA256, reason: "", requestSignerFingerprint: fingerprint }
    const bad = errors[field]
    if (bad) return { field, path: bad.path, status: "error", bytesSHA256: "", reason: bad.reason, requestSignerFingerprint: fingerprint }
    return { field, path: "", status: "missing", bytesSHA256: "", reason: "", requestSignerFingerprint: fingerprint }
  })
const taken = (file: ReviewReleaseEvidence.File | undefined) => {
  expect(file).toBeDefined()
  if (!file || !("bytes" in file)) throw new Error("expected captured bytes")
  return file
}
const refused = (file: ReviewReleaseEvidence.File | undefined) => {
  expect(file).toBeDefined()
  if (!file || !("reason" in file)) throw new Error("expected refusal reason")
  expect(file.reason.length).toBeGreaterThan(0)
  expect("bytes" in file).toBe(false)
  return file
}
const sparse = async (file: string, size: number) => {
  const handle = await open(file, "w")
  await handle.truncate(size)
  await handle.close()
}
const run = (root: string, input?: ReviewReleaseEvidence.Input) => Effect.runPromise(ReviewReleaseEvidence.capture(root, input))

describe("ReviewReleaseEvidence.capture", () => {
  test("hashes every supplied path and binds the SPKI fingerprint into identity", async () => {
    await using dir = await tmpdir()
    const root = path.join(dir.path, "work")
    await mkdir(root)
    const { privateKey, publicKey } = generateKeyPairSync("ed25519")
    const pem = new Uint8Array(Buffer.from(publicKey.export({ type: "spki", format: "pem" })))
    const fingerprint = sha256(new Uint8Array(publicKey.export({ type: "spki", format: "der" })))
    const artifact = new Uint8Array([1, 2, 3, 4])
    const bodies = {
      artifact,
      publicKey: pem,
      signature: new Uint8Array(sign(null, artifact, privateKey)),
      provenance: new TextEncoder().encode("{}\n"),
      updater: new TextEncoder().encode("version: 1\n"),
      sbom: new TextEncoder().encode("{}\n"),
      notes: new TextEncoder().encode("candidate notes\n"),
    }
    const names = { artifact: "dist/app.bin", publicKey: "keys/release.pem", signature: "dist/app.bin.sig", provenance: "dist/provenance.json", updater: "dist/latest.yml", sbom: "dist/app.sbom.json", notes: "dist/NOTES.txt" } satisfies Record<ReviewReleaseEvidence.Field, string>
    for (const field of fields) {
      await mkdir(path.join(root, path.posix.dirname(names[field])), { recursive: true })
      await writeFile(path.join(root, names[field]), bodies[field])
    }
    const input: ReviewReleaseEvidence.Input = { artifact: names.artifact, signer: { publicKey: names.publicKey, sha256: fingerprint }, signature: names.signature, provenance: names.provenance, updater: names.updater, sbom: names.sbom, notes: names.notes }
    const captured = await run(root, input)
    const present: Partial<Record<ReviewReleaseEvidence.Field, { path: string; bytesSHA256: string }>> = {}
    for (const field of fields) {
      const file = taken(captured.files[field])
      expect(file.path).toBe(names[field])
      expect(file.bytes).toEqual(bodies[field])
      expect(file.sha256).toBe(sha256(file.bytes))
      expect(file.bytes).toBeInstanceOf(Uint8Array)
      present[field] = { path: names[field], bytesSHA256: sha256(bodies[field]) }
    }
    expect(captured.identity).toBe(identity(rows(present, fingerprint)))
    expect(captured.input).toEqual(input)
  })

  test("omitted input is a stable hash and stores no files", async () => {
    await using dir = await tmpdir()
    const first = await run(dir.path)
    const second = await run(path.join(dir.path, "missing-root"))
    expect(first.files).toEqual({})
    expect(second.files).toEqual({})
    expect(first.identity).toBe(identity(rows({}, "")))
    expect(second.identity).toBe(first.identity)
  })

  test("byte, path, and key-policy changes retarget identity; prior bytes and captured input survive caller mutation", async () => {
    await using dir = await tmpdir()
    const root = path.join(dir.path, "work")
    await mkdir(root)
    await writeFile(path.join(root, "app.bin"), "v1")
    await writeFile(path.join(root, "other.bin"), "v1")
    await writeFile(path.join(root, "key.pem"), "pem")
    const fingerprint = "ab".repeat(32)
    const capture = (artifact: string, policy = fingerprint) => run(root, { artifact, signer: { publicKey: "key.pem", sha256: policy } })
    const first = await capture("app.bin")
    const artifact = taken(first.files.artifact)
    const prior = Uint8Array.from(artifact.bytes)
    await writeFile(path.join(root, "app.bin"), "v2")
    expect(artifact.bytes).toEqual(prior)
    expect(sha256(artifact.bytes)).toBe(artifact.sha256)
    const changed = await capture("app.bin")
    const moved = await capture("other.bin")
    const policy = await capture("other.bin", "cd".repeat(32))
    expect(new Set([first.identity, changed.identity, moved.identity, policy.identity]).size).toBe(4)
    expect(first.identity).toBe(identity(rows({ artifact: { path: "app.bin", bytesSHA256: sha256(prior) }, publicKey: { path: "key.pem", bytesSHA256: sha256(new TextEncoder().encode("pem")) } }, fingerprint)))
    const input: ReviewReleaseEvidence.Input = { artifact: "app.bin", signer: { publicKey: "key.pem", sha256: fingerprint } }
    const retained = await run(root, input)
    const kept = { identity: retained.identity, artifact: retained.input?.artifact, publicKey: retained.input?.signer?.publicKey, sha256: retained.input?.signer?.sha256, bytes: Uint8Array.from(taken(retained.files.artifact).bytes) }
    Object.assign(input, { artifact: "other.bin" })
    Object.assign(input.signer ?? {}, { publicKey: "evil.pem", sha256: "11".repeat(32) })
    expect(retained.identity).toBe(kept.identity)
    expect(retained.input?.artifact).toBe(kept.artifact)
    expect(retained.input?.signer?.publicKey).toBe(kept.publicKey)
    expect(retained.input?.signer?.sha256).toBe(kept.sha256)
    expect(taken(retained.files.artifact).bytes).toEqual(kept.bytes)
  })

  test("refuses unsafe paths and binds each nonempty reason into identity", async () => {
    await using dir = await tmpdir()
    const root = path.join(dir.path, "work")
    await mkdir(root)
    const outside = path.join(dir.path, "secret.bin")
    await writeFile(outside, "SENSITIVE_RELEASE_BYTES")
    await writeFile(path.join(root, "x"), "TRAVERSAL_SECRET")
    for (const relative of [".git/config", "pkg/node_modules/x", "vendor/lib", "src/.git/x", "lib/vendor/x", "a/x", "a\\b", "a\r\nb"]) {
      await mkdir(path.dirname(path.join(root, relative)), { recursive: true })
      await writeFile(path.join(root, relative), "SENSITIVE_RELEASE_BYTES")
    }
    const bad = [outside, "../secret.bin", "a\u0000b", "a\\b", "a\r\nb", "", ".", ".git/config", "pkg/node_modules/x", "vendor/lib", "a/../x", "a/./x", "a//x", "src/.git/x", "lib/vendor/x"]
    const digests: string[] = []
    for (const artifact of bad) {
      const captured = await run(root, { artifact } as ReviewReleaseEvidence.Input)
      const file = refused(captured.files.artifact)
      expect(file.path).toBe(artifact)
      expect(file.reason).toBe("unsafe-path")
      expect(captured.identity).toBe(identity(rows({}, "", { artifact: { path: artifact, reason: file.reason } })))
      digests.push(captured.identity)
      expect(JSON.stringify(captured)).not.toContain("SENSITIVE_RELEASE_BYTES")
      expect(JSON.stringify(captured)).not.toContain("TRAVERSAL_SECRET")
    }
    expect(new Set(digests).size).toBe(bad.length)
  })

  test("a missing file and a directory at the same path are distinct errors", async () => {
    await using dir = await tmpdir()
    const root = path.join(dir.path, "work")
    await mkdir(root)
    const missing = await run(root, { artifact: "same.bin" })
    const missingFile = refused(missing.files.artifact)
    await mkdir(path.join(root, "same.bin"))
    const directory = await run(root, { artifact: "same.bin" })
    const directoryFile = refused(directory.files.artifact)
    expect(missingFile.reason).not.toBe(directoryFile.reason)
    expect(missing.identity).toBe(identity(rows({}, "", { artifact: { path: "same.bin", reason: missingFile.reason } })))
    expect(directory.identity).toBe(identity(rows({}, "", { artifact: { path: "same.bin", reason: directoryFile.reason } })))
    expect(missing.identity).not.toBe(directory.identity)
  })

  test("refuses escaping, in-root, and symlinked dependency-root components", async () => {
    await using dir = await tmpdir()
    const root = path.join(dir.path, "work")
    const outside = path.join(dir.path, "outside")
    await mkdir(root)
    await mkdir(outside)
    await mkdir(path.join(root, "real"))
    await writeFile(path.join(outside, "secret"), "OUTSIDE_SECRET")
    await writeFile(path.join(root, "real", "inside.txt"), "INSIDE_LINK_SECRET")
    await writeFile(path.join(root, "regular.bin"), "ok")
    await symlink(path.join(outside, "secret"), path.join(root, "linked.bin"), "file")
    await symlink(outside, path.join(root, "escape"), "dir")
    await symlink(path.join(root, "real", "inside.txt"), path.join(root, "final-link"), "file")
    await symlink(path.join(root, "real"), path.join(root, "ancestor-link"), "dir")
    const cases = ["linked.bin", "escape/secret", "final-link", "ancestor-link/inside.txt"]
    for (const artifact of cases) {
      const captured = await run(root, { artifact })
      const file = refused(captured.files.artifact)
      expect(captured.identity).toBe(identity(rows({}, "", { artifact: { path: artifact, reason: file.reason } })))
      expect(JSON.stringify(captured)).not.toContain("OUTSIDE_SECRET")
      expect(JSON.stringify(captured)).not.toContain("INSIDE_LINK_SECRET")
    }
    await mkdir(path.join(root, "payload"))
    await writeFile(path.join(root, "payload", "x"), "DEP_ROOT_SECRET")
    await mkdir(path.join(root, "nested"))
    for (const name of [".git", "node_modules", "vendor"]) {
      await symlink(path.join(root, "payload"), path.join(root, "nested", name), "dir")
      const artifact = `nested/${name}/x`
      const captured = await run(root, { artifact })
      const file = refused(captured.files.artifact)
      expect(captured.identity).toBe(identity(rows({}, "", { artifact: { path: artifact, reason: file.reason } })))
      expect(JSON.stringify(captured)).not.toContain("DEP_ROOT_SECRET")
    }
    expect(taken((await run(root, { artifact: "regular.bin" })).files.artifact).bytes).toEqual(new TextEncoder().encode("ok"))
  })

  test("pins ceilings and accepts exact evidence bounds while refusing one extra byte", async () => {
    expect(ReviewReleaseEvidence.LIMITS).toEqual({ artifact: artifactLimit, evidence: evidenceLimit, publicKey: keyLimit })
    await using dir = await tmpdir()
    const root = path.join(dir.path, "work")
    await mkdir(root)
    await writeFile(path.join(root, "app.bin"), "a")
    const fingerprint = "ef".repeat(32)
    await sparse(path.join(root, "key.pem"), keyLimit)
    const keyOk = await run(root, { artifact: "app.bin", signer: { publicKey: "key.pem", sha256: fingerprint } })
    const keyFile = taken(keyOk.files.publicKey)
    expect(keyFile.bytes.byteLength).toBe(keyLimit)
    expect(keyFile.sha256).toBe(sha256(keyFile.bytes))
    await sparse(path.join(root, "key.pem"), keyLimit + 1)
    const keyOver = await run(root, { artifact: "app.bin", signer: { publicKey: "key.pem", sha256: fingerprint } })
    const keyRefused = refused(keyOver.files.publicKey)
    expect(keyOver.identity).toBe(identity(rows({ artifact: { path: "app.bin", bytesSHA256: sha256(new TextEncoder().encode("a")) } }, fingerprint, { publicKey: { path: "key.pem", reason: keyRefused.reason } })))
    await sparse(path.join(root, "huge.bin"), artifactLimit)
    const huge = taken((await run(root, { artifact: "huge.bin" })).files.artifact)
    expect(huge.bytes.byteLength).toBe(artifactLimit)
    expect(huge.sha256).toBe(sha256(huge.bytes))
    await sparse(path.join(root, "huge.bin"), artifactLimit + 1)
    refused((await run(root, { artifact: "huge.bin" })).files.artifact)
    for (const field of evidenceFields) {
      const rel = `${field}.bin`
      await sparse(path.join(root, rel), evidenceLimit)
      const input = { artifact: "app.bin", [field]: rel } as ReviewReleaseEvidence.Input
      const allowed = taken((await run(root, input)).files[field])
      expect(allowed.bytes.byteLength).toBe(evidenceLimit)
      expect(allowed.sha256).toBe(sha256(allowed.bytes))
      await sparse(path.join(root, rel), evidenceLimit + 1)
      const over = await run(root, input)
      const file = refused(over.files[field])
      expect(JSON.stringify(file)).not.toContain("bytes")
      expect(over.identity).toBe(identity(rows({ artifact: { path: "app.bin", bytesSHA256: sha256(new TextEncoder().encode("a")) } }, "", { [field]: { path: rel, reason: file.reason } })))
    }
  })
})
