// Repo-only recovery envelopes. These are not Atlas facts, admission decisions or publication authority.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { gzipSync, gunzipSync } from "node:zlib"
import { credentialValues, findCredentialFiles } from "./secret-scan.mjs"
import { id } from "../../modules/atlas/packages/kernel/dist/src/index.js"

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
export const gitBlob = (bytes) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
export function checkpointScan(env, nonce) {
  return { secrets: JSON.stringify([...credentialValues(env.ATLAS_SCAN_SECRETS ?? ""), env.GH_TOKEN ?? "", nonce]),
    authFile: env.ATLAS_SCAN_AUTH_FILE }
}

const allowed = (path) => /^atlas\/staging(?:\.[0-9]+)?\.json$/.test(path) ||
  /^atlas\/cas\/([0-9a-f]{2})\/\1[0-9a-f]{62}$/.test(path) ||
  /^evidence\/(?:plan|report)-(?:advisory|dependency|count|definition|semantic)\.json$/.test(path)

export function snapshotFiles(repo, evidence) {
  const walk = (root, prefix) => {
    if (!existsSync(root)) return []
    assert(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(), "checkpoint: unsafe payload root")
    return readdirSync(root).sort().flatMap((name) => {
      const path = join(root, name)
      const stat = lstatSync(path)
      assert(!stat.isSymbolicLink(), "checkpoint: symlink refused")
      if (stat.isDirectory()) return walk(path, `${prefix}${name}/`)
      assert(stat.isFile(), "checkpoint: non-regular payload")
      if (!allowed(`${prefix}${name}`)) return []
      const bytes = readFileSync(path)
      return [{ path: `${prefix}${name}`, sha256: sha256(bytes), bytes: bytes.toString("base64") }]
    })
  }
  // Do not traverse indexes or unrelated .atlas trees (including credentials and user memory).
  assert(lstatSync(join(repo, ".atlas")).isDirectory() && !lstatSync(join(repo, ".atlas")).isSymbolicLink(), "checkpoint: unsafe store root")
  const files = readdirSync(join(repo, ".atlas")).filter((name) => /^staging(?:\.[0-9]+)?\.json$/.test(name))
    .map((name) => {
      const path = join(repo, ".atlas", name)
      assert(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), "checkpoint: non-regular staging")
      const bytes = readFileSync(path)
      return { path: `atlas/${name}`, sha256: sha256(bytes), bytes: bytes.toString("base64") }
    })
  return [...files, ...walk(join(repo, ".atlas/cas"), "atlas/cas/"), ...walk(evidence, "evidence/")]
}

export function validateIdentity(identity) {
  assert(identity && /^[0-9a-f]{40}$/.test(identity.revision), "checkpoint: missing revision")
  assert(["production", "control", "transport"].includes(identity.mode), "checkpoint: invalid execution mode")
  for (const field of ["run", "attempt", "indexRun", "budget"]) {
    assert(/^[1-9][0-9]*$/.test(String(identity[field])), `checkpoint: invalid ${field}`)
  }
  assert(Array.isArray(identity.retainedRuns) && identity.retainedRuns.length <= 4 &&
    new Set(identity.retainedRuns).size === identity.retainedRuns.length &&
    identity.retainedRuns.every((run) => /^[1-9][0-9]*$/.test(String(run))), "checkpoint: invalid retained identity")
  assert(Array.isArray(identity.arms) && identity.arms.length > 0 &&
    new Set(identity.arms).size === identity.arms.length &&
    identity.arms.every((arm) => ["advisory", "dependency", "count", "definition"].includes(arm)), "checkpoint: invalid arms")
  for (const field of ["wrapperSha256", "profileSha256"]) assert(/^[0-9a-f]{64}$/.test(identity[field]), "checkpoint: missing model identity")
}

export function validateEnvelope(envelope, identity, known = new Map()) {
  validateIdentity(envelope?.identity)
  assert.deepEqual(envelope.identity, identity, "checkpoint: identity mismatch")
  assert.equal(envelope.version, 1, "checkpoint: unsupported schema")
  assert(Number.isSafeInteger(envelope.sequence) && envelope.sequence >= 1, "checkpoint: invalid sequence")
  assert(envelope.previous === null || /^[0-9a-f]{64}$/.test(envelope.previous), "checkpoint: invalid previous hash")
  if (envelope.kind === "snapshot") {
    assert(Array.isArray(envelope.files) && envelope.files.length > 0, "checkpoint: empty snapshot")
    assert(envelope.files.some((file) => file.path === "atlas/staging.json"), "checkpoint: missing staging head")
    const seen = new Set()
    for (const file of envelope.files) {
      assert(typeof file.path === "string" && allowed(file.path) && !seen.has(file.path), "checkpoint: invalid or duplicate path")
      seen.add(file.path)
      assert(/^[0-9a-f]{64}$/.test(file.sha256), "checkpoint: invalid file")
      const encoded = file.bytes ?? known.get(file.sha256)
      assert(typeof encoded === "string", "checkpoint: missing prior payload")
      const bytes = Buffer.from(encoded, "base64")
      assert.equal(bytes.toString("base64"), encoded, "checkpoint: noncanonical encoding")
      assert.equal(sha256(bytes), file.sha256, "checkpoint: payload hash mismatch")
      if (file.path.startsWith("atlas/cas/")) {
        assert.equal(String(id(JSON.parse(bytes.toString("utf8")))), file.path.split("/").at(-1), "checkpoint: CAS carrier address mismatch")
      }
    }
    const head = envelope.files.find((file) => file.path === "atlas/staging.json")
    const staging = JSON.parse(Buffer.from(head.bytes ?? known.get(head.sha256), "base64").toString("utf8"))
    assert(Array.isArray(staging.current), "checkpoint: invalid staging head")
    for (const [key, row] of staging.current) {
      assert(/^[0-9a-f]{64}$/.test(key) && key === row.nodeKey && Array.isArray(row.claims) && row.claims.length > 0 &&
        row.claims.every((claim) => typeof claim === "string" && claim.trim().length > 0) &&
        new Set(row.claims).size === row.claims.length, "checkpoint: malformed candidate")
      assert(typeof row.contentHash === "string" && /^[0-9a-f]{64}$/.test(row.contentHash), "checkpoint: missing fact carrier")
      assert(row.claims.length === 1 || row.claimEvidenceByClaim, "checkpoint: missing individual claim carriers")
      if (row.claimEvidenceByClaim) for (const claim of row.claims) {
        assert(/^[0-9a-f]{64}$/.test(row.claimEvidenceByClaim[claim]?.factRef ?? ""), "checkpoint: missing individual claim carrier")
      }
      const refs = [row.contentHash, row.answerRef, ...Object.values(row.claimEvidenceByClaim ?? {})
        .flatMap((receipt) => [receipt.factRef, receipt.answerRef])].filter((ref) => ref !== undefined)
      for (const ref of refs) assert(/^[0-9a-f]{64}$/.test(ref) && seen.has(`atlas/cas/${ref.slice(0, 2)}/${ref}`), "checkpoint: missing candidate receipt")
    }
    return
  }
  assert(["dispatch", "completion"].includes(envelope.kind), "checkpoint: unknown event")
  assert(envelope.identity.mode !== "production" || envelope.identity.arms.includes(envelope.arm), "checkpoint: missing production arm")
  assert(/^[0-9a-f-]{36}$/.test(envelope.request), "checkpoint: invalid request identity")
  assert(/^[0-9a-f]{64}$/.test(envelope.promptSha256) && Number.isSafeInteger(envelope.promptBytes) &&
    envelope.promptBytes > 0, "checkpoint: invalid prompt receipt")
  if (envelope.kind === "dispatch") return
  assert(Number.isInteger(envelope.exitCode) && envelope.exitCode >= 0 && envelope.exitCode <= 255, "checkpoint: invalid command status")
  for (const field of ["stdout", "stderr"]) {
    assert(typeof envelope[field] === "string", "checkpoint: missing command bytes")
    assert.equal(Buffer.from(envelope[field], "base64").toString("base64"), envelope[field], "checkpoint: noncanonical command bytes")
  }
}

export function encodeEnvelope(envelope, directory, scan, known = new Map()) {
  validateEnvelope(envelope, envelope.identity, known)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const payloads = envelope.kind === "snapshot" ? envelope.files.filter((file) => file.bytes !== undefined).map((file) => Buffer.from(file.bytes, "base64")) :
    envelope.kind === "completion" ? [Buffer.from(envelope.stdout, "base64"), Buffer.from(envelope.stderr, "base64")] : []
  const paths = payloads.map((bytes, index) => {
    const path = join(directory, `scan-${index}`)
    writeFileSync(path, bytes, { flag: "wx", mode: 0o600 })
    return path
  })
  const metadata = join(directory, "envelope.json")
  writeFileSync(metadata, JSON.stringify(envelope), { flag: "wx", mode: 0o600 })
  assert.equal(findCredentialFiles([metadata, ...paths], scan).length, 0, "checkpoint: credential scan refused upload")
  const bytes = gzipSync(readFileSync(metadata))
  assert(bytes.length <= 20 * 1024 * 1024, "checkpoint: envelope too large")
  return bytes
}

export function decodeChain(records, identity) {
  assert(Array.isArray(records) && records.length > 0, "checkpoint: empty restore chain")
  const envelopes = records.map((bytes) => JSON.parse(gunzipSync(bytes, { maxOutputLength: 128 * 1024 * 1024 })))
  const known = new Map()
  envelopes.forEach((envelope, index) => {
    validateEnvelope(envelope, identity, known)
    assert.equal(envelope.sequence, index + 1, "checkpoint: missing/reordered sequence")
    assert.equal(envelope.previous, index === 0 ? null : sha256(records[index - 1]), "checkpoint: chain mismatch")
    if (envelope.kind !== "snapshot") return
    for (const file of envelope.files) {
      if (file.bytes !== undefined) known.set(file.sha256, file.bytes)
      file.bytes ??= known.get(file.sha256)
    }
  })
  const requests = new Map()
  for (const envelope of envelopes) {
    if (envelope.kind === "snapshot") continue
    if (envelope.kind === "dispatch") {
      assert(!requests.has(envelope.request), "checkpoint: duplicate dispatch")
      requests.set(envelope.request, envelope)
      continue
    }
    const dispatch = requests.get(envelope.request)
    assert(dispatch?.kind === "dispatch" && dispatch.promptSha256 === envelope.promptSha256 &&
      dispatch.promptBytes === envelope.promptBytes && dispatch.arm === envelope.arm, "checkpoint: unmatched completion")
    requests.set(envelope.request, envelope)
  }
  assert(envelopes.some((envelope) => envelope.kind === "snapshot"), "checkpoint: no restorable snapshot")
  return { envelopes, inFlight: [...requests.values()].filter((record) => record.kind === "dispatch"),
    completions: [...requests.values()].filter((record) => record.kind === "completion") }
}

export function restoreChain(records, identity, destination) {
  const chain = decodeChain(records, identity) // Complete verification BEFORE the destination exists.
  assert(!existsSync(destination), "checkpoint: restore destination already exists")
  const snapshot = chain.envelopes.findLast((envelope) => envelope.kind === "snapshot")
  mkdirSync(destination, { recursive: true, mode: 0o700 })
  for (const file of snapshot.files) {
    const path = join(destination, file.path)
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    writeFileSync(path, Buffer.from(file.bytes, "base64"), { flag: "wx", mode: 0o600 })
  }
  mkdirSync(join(destination, "responses"))
  for (const record of chain.completions) {
    writeFileSync(join(destination, "responses", `${record.request}.json`), JSON.stringify(record) + "\n", { flag: "wx", mode: 0o600 })
  }
  writeFileSync(join(destination, "recovery.json"), JSON.stringify({ identity, snapshotSequence: snapshot.sequence,
    dispatched: chain.inFlight.length + chain.completions.length, completed: chain.completions.length,
    inFlight: chain.inFlight.map((record) => record.request) }) + "\n", { flag: "wx", mode: 0o600 })
  return chain
}
