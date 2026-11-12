export * as ReviewReleaseChecks from "./release-checks"

import { createHash, createPublicKey, verify, type KeyObject } from "node:crypto"
import path from "node:path"
import { Effect, Schema } from "effect"
import type { ReviewAnalyze } from "./analyze"
import type { ReviewReleaseEvidence } from "./release-evidence"

export type Result = { readonly checks: ReadonlyArray<ReviewAnalyze.Check>; readonly raw: unknown }

const PAYLOAD_TYPE = "application/vnd.in-toto+json"
const STATEMENT = "https://in-toto.io/Statement/v1"
const PREDICATE = "https://slsa.dev/provenance/v1"
const HEX64 = /^[0-9a-f]{64}$/
const CLAIM = {
  signing: "artifact byte signature matches caller-supplied Ed25519 fingerprint",
  provenance: "signed provenance statement bound to artifact bytes under caller-supplied fingerprint",
  updater: "supplied updater entry matches artifact bytes only",
  sbom: "cryptographic co-signature of supplied SBOM attachment and artifact hashes in one statement",
  notes: "notes supplied for candidate",
} as const

type Verdict = { readonly status: ReviewAnalyze.Status; readonly reason?: string; readonly scope?: string }
type BytesFile = { readonly path: string; readonly sha256: string; readonly bytes: Uint8Array }
type KeyState =
  | { readonly tag: "absent" }
  | { readonly tag: "channel"; readonly reason: string }
  | { readonly tag: "bad"; readonly status: "acquisition-error" | "not-run" | "fail"; readonly reason: string }
  | { readonly tag: "ok"; readonly key: KeyObject }
type Provenance = { readonly verdict: Verdict; readonly byproducts?: ReadonlyArray<unknown> }

const decodeJson = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

export const run: (captured: ReviewReleaseEvidence.Captured) => Effect.Effect<Result> = Effect.fn("ReviewReleaseChecks.run")(function* (captured) {
  const artifact = bytesOf(captured.files.artifact)
  const evalCheck = pack("release:behavioural-eval", { status: "not-run", reason: "owner-permission" })
  if (artifact === undefined) {
    const file = captured.files.artifact
    const unavailable: Verdict = file !== undefined && "reason" in file
      ? { status: "acquisition-error", reason: file.reason }
      : { status: "not-run", reason: "artifact-unavailable" }
    return {
      checks: [
        pack("release:provenance", unavailable),
        pack("release:signing", unavailable),
        pack("release:updater", unavailable),
        pack("release:sbom", unavailable),
        pack("release:notes", unavailable),
        evalCheck,
      ],
      raw: report(captured, [], true),
    }
  }
  const key = yield* Effect.sync(() => resolveKey(captured))
  const signing = judgeSigning(captured, artifact, key)
  const provenance = judgeProvenance(captured, artifact, key)
  const updater = yield* Effect.promise(() => judgeUpdater(captured, artifact).then((value) => value, () => ({ status: "acquisition-error" as const, reason: "yaml-parse" })))
  const sbom = judgeSbom(captured, provenance)
  const notes = judgeNotes(captured)
  const verdicts = [provenance.verdict, signing, updater, sbom, notes]
  return {
    checks: [
      pack("release:provenance", provenance.verdict),
      pack("release:signing", signing),
      pack("release:updater", updater),
      pack("release:sbom", sbom),
      pack("release:notes", notes),
      evalCheck,
    ],
    raw: report(captured, verdicts, false),
  }
})

function pack(id: string, verdict: Verdict): ReviewAnalyze.Check {
  return {
    id,
    pack: "release",
    version: "review-v2",
    lane: "no-build",
    status: verdict.status,
    ...(verdict.reason === undefined && verdict.scope === undefined ? {} : { reason: verdict.reason ?? verdict.scope }),
    workspaceExecuted: false,
    uri: "raw/release.json",
  }
}

function resolveKey(captured: ReviewReleaseEvidence.Captured): KeyState {
  const file = captured.files.publicKey
  if (file === undefined) return { tag: "absent" }
  if ("reason" in file) return { tag: "channel", reason: file.reason }
  const policy = captured.input?.signer?.sha256
  if (policy === undefined) return { tag: "bad", status: "not-run", reason: "signer-policy-missing" }
  const text = utf8(file.bytes)
  if (text === undefined) return { tag: "bad", status: "acquisition-error", reason: "invalid-encoding" }
  const key = trap(() => createPublicKey(text))
  if (key === undefined) return { tag: "bad", status: "acquisition-error", reason: "malformed-key" }
  if (key.asymmetricKeyType !== "ed25519") return { tag: "bad", status: "not-run", reason: "unsupported-key-type" }
  const der = trap(() => key.export({ type: "spki", format: "der" }))
  if (der === undefined) return { tag: "bad", status: "acquisition-error", reason: "malformed-key" }
  if (createHash("sha256").update(der).digest("hex") !== policy) return { tag: "bad", status: "fail", reason: "fingerprint-mismatch" }
  return { tag: "ok", key }
}

function judgeSigning(captured: ReviewReleaseEvidence.Captured, artifact: BytesFile, key: KeyState): Verdict {
  const blocked = proofGate(captured.files.signature, key)
  if (blocked !== undefined) return blocked
  const proof = bytesOf(captured.files.signature)
  if (proof === undefined || key.tag !== "ok") return { status: "acquisition-error", reason: "malformed-key" }
  if (proof.bytes.byteLength !== 64) return { status: "acquisition-error", reason: "signature-encoding" }
  const ok = trap(() => verify(null, artifact.bytes, key.key, proof.bytes))
  if (ok === undefined) return { status: "acquisition-error", reason: "signature-encoding" }
  if (!ok) return { status: "fail", reason: "signature-mismatch" }
  return { status: "pass", scope: CLAIM.signing }
}

function judgeProvenance(captured: ReviewReleaseEvidence.Captured, artifact: BytesFile, key: KeyState): Provenance {
  const blocked = proofGate(captured.files.provenance, key)
  if (blocked !== undefined) return { verdict: blocked }
  const proof = bytesOf(captured.files.provenance)
  if (proof === undefined || key.tag !== "ok") return { verdict: { status: "acquisition-error", reason: "malformed-key" } }
  const parsed = readJson(proof.bytes)
  const envelope = envelopeOf(parsed)
  if (envelope === undefined) return { verdict: { status: "acquisition-error", reason: "malformed-json" } }
  if (envelope.payloadType !== PAYLOAD_TYPE) return { verdict: { status: "not-run", reason: "unsupported-format" } }
  if (envelope.signatures.length > 16) {
    return { verdict: { status: "acquisition-error", reason: "malformed-envelope" } }
  }
  const payload = canonicalBase64(envelope.payload)
  if (payload === undefined) return { verdict: { status: "acquisition-error", reason: "malformed-base64" } }
  const sigs = decodedSigs(envelope.signatures)
  if (sigs.length === 0) return { verdict: envelope.signatures.length === 0
    ? { status: "fail", reason: "signature-mismatch" }
    : { status: "acquisition-error", reason: "malformed-signature" } }
  if (!sigs.some((sig) => trap(() => verify(null, pae(envelope.payloadType, payload), key.key, sig)) === true)) {
    return { verdict: { status: "fail", reason: "signature-mismatch" } }
  }
  const body = readJson(payload)
  if (body === undefined) return { verdict: { status: "acquisition-error", reason: "malformed-json" } }
  return judgeStatement(body, artifact)
}

function judgeStatement(value: unknown, artifact: BytesFile): Provenance {
  if (!isRecord(value) || !isRecord(value.predicate)) return { verdict: { status: "acquisition-error", reason: "malformed-statement" } }
  if (value._type !== STATEMENT || value.predicateType !== PREDICATE) return { verdict: { status: "not-run", reason: "unsupported-format" } }
  if (!isRecord(value.predicate.buildDefinition) || !isRecord(value.predicate.runDetails)) {
    return { verdict: { status: "acquisition-error", reason: "malformed-statement" } }
  }
  const named = Array.isArray(value.subject)
    ? value.subject.filter((item): item is Record<string, unknown> => isRecord(item) && item.name === artifact.path)
    : []
  if (!Array.isArray(value.subject) || named.length !== 1) return { verdict: { status: "fail", reason: "subject-mismatch" } }
  const digest = named[0]?.digest
  const sha = isRecord(digest) ? digest.sha256 : undefined
  if (typeof sha !== "string" || !HEX64.test(sha) || sha !== artifact.sha256) return { verdict: { status: "fail", reason: "subject-mismatch" } }
  const byproducts = value.predicate.runDetails.byproducts
  return { verdict: { status: "pass", scope: CLAIM.provenance }, byproducts: Array.isArray(byproducts) ? byproducts : [] }
}

async function judgeUpdater(captured: ReviewReleaseEvidence.Captured, artifact: BytesFile): Promise<Verdict> {
  const file = captured.files.updater
  if (file === undefined) return { status: "not-run", reason: "evidence-missing" }
  if ("reason" in file) return { status: "acquisition-error", reason: file.reason }
  const text = utf8(file.bytes)
  if (text === undefined || text.length === 0) return { status: "acquisition-error", reason: "invalid-encoding" }
  const { parseDocument } = await import("yaml")
  const parsed: unknown = trap(() => {
    const doc = parseDocument(text, { schema: "core", customTags: [], uniqueKeys: true })
    if (doc.errors.length > 0 || doc.warnings.length > 0) return undefined
    return doc.toJS({ maxAliasCount: 0 })
  })
  if (parsed === undefined) return { status: "acquisition-error", reason: "yaml-parse" }
  if (!isRecord(parsed) || typeof parsed.version !== "string" || parsed.version.length === 0 || !Array.isArray(parsed.files)) {
    return { status: "not-run", reason: "unsupported-format" }
  }
  const name = path.posix.basename(artifact.path)
  const matches = parsed.files.filter((item): item is Record<string, unknown> => isRecord(item) && item.url === name)
  if (matches.length !== 1) return { status: "fail", reason: "entry-mismatch" }
  const digest = matches[0]?.sha512
  if (typeof digest !== "string") return { status: "fail", reason: "digest-missing-or-invalid" }
  const decoded = canonicalBase64(digest)
  if (decoded === undefined || decoded.byteLength !== 64) return { status: "fail", reason: "digest-missing-or-invalid" }
  if (!createHash("sha512").update(artifact.bytes).digest().equals(decoded)) return { status: "fail", reason: "digest-mismatch" }
  return { status: "pass", scope: CLAIM.updater }
}

function judgeSbom(captured: ReviewReleaseEvidence.Captured, provenance: Provenance): Verdict {
  const file = captured.files.sbom
  if (file === undefined) return { status: "not-run", reason: "evidence-missing" }
  if ("reason" in file) return { status: "acquisition-error", reason: file.reason }
  const json = readJson(file.bytes)
  if (json === undefined) return { status: "acquisition-error", reason: "malformed-json" }
  if (!isRecord(json) || !isRecord(json.descriptor) || json.descriptor.name !== "syft" || !Array.isArray(json.artifacts) || !isRecord(json.source)) {
    return { status: "not-run", reason: "unsupported-format" }
  }
  if (provenance.verdict.status !== "pass" || provenance.byproducts === undefined) {
    return { status: "not-run", reason: "artifact-binding-unavailable" }
  }
  const named = provenance.byproducts.filter((item): item is Record<string, unknown> => isRecord(item) && item.name === file.path)
  if (named.length === 0) return { status: "not-run", reason: "artifact-binding-unavailable" }
  if (named.length !== 1) return { status: "fail", reason: "byproduct-mismatch" }
  const digest = named[0]?.digest
  const sha = isRecord(digest) ? digest.sha256 : undefined
  if (typeof sha !== "string" || !HEX64.test(sha) || sha !== file.sha256) return { status: "fail", reason: "byproduct-mismatch" }
  return { status: "pass", scope: CLAIM.sbom }
}

function judgeNotes(captured: ReviewReleaseEvidence.Captured): Verdict {
  const file = captured.files.notes
  if (file === undefined) return { status: "not-run", reason: "evidence-missing" }
  if ("reason" in file) return { status: "acquisition-error", reason: file.reason }
  const text = utf8(file.bytes)
  if (text === undefined || text.trim().length === 0) return { status: "acquisition-error", reason: "invalid-notes" }
  return { status: "pass", scope: CLAIM.notes }
}

function proofGate(file: ReviewReleaseEvidence.File | undefined, key: KeyState): Verdict | undefined {
  if (file === undefined) return { status: "not-run", reason: "evidence-missing" }
  if ("reason" in file) return { status: "acquisition-error", reason: file.reason }
  if (key.tag === "absent") return { status: "not-run", reason: "signer-policy-missing" }
  if (key.tag === "channel") return { status: "acquisition-error", reason: key.reason }
  if (key.tag === "bad") return { status: key.status, reason: key.reason }
  return undefined
}

function envelopeOf(value: unknown) {
  if (!isRecord(value) || typeof value.payloadType !== "string" || typeof value.payload !== "string" || !Array.isArray(value.signatures)) return undefined
  return { payloadType: value.payloadType, payload: value.payload, signatures: value.signatures }
}

function decodedSigs(entries: ReadonlyArray<unknown>) {
  return entries.flatMap((item) => {
    if (!isRecord(item) || typeof item.sig !== "string") return []
    const decoded = canonicalBase64(item.sig)
    if (decoded === undefined || decoded.byteLength !== 64) return []
    return [decoded]
  })
}

function pae(payloadType: string, payload: Uint8Array) {
  const typeBytes = Buffer.from(payloadType, "utf8")
  return Buffer.concat([
    Buffer.from(`DSSEv1 ${String(typeBytes.byteLength)} `, "ascii"),
    typeBytes,
    Buffer.from(` ${String(payload.byteLength)} `, "ascii"),
    Buffer.from(payload),
  ])
}

function report(captured: ReviewReleaseEvidence.Captured, verdicts: ReadonlyArray<Verdict>, artifactUnavailable: boolean) {
  const unbound = verdicts.some((item) => item.reason === "artifact-binding-unavailable")
  return {
    identity: captured.identity,
    files: Object.entries(captured.files).map(([field, file]) => fileMeta(field, file)),
    errors: artifactUnavailable ? missingOrError(captured) : errorFiles(captured),
    claims: verdicts.flatMap((item) => (item.scope === undefined ? [] : [item.scope])),
    ...(unbound ? { sbomBinding: "unbound", sbomReview: "notExamined" } : {}),
  }
}

function fileMeta(field: string, file: ReviewReleaseEvidence.File) {
  if ("reason" in file) return { field, path: file.path, status: "error", reason: file.reason }
  return { field, path: file.path, status: "captured", sha256: file.sha256, size: file.bytes.byteLength }
}

function missingOrError(captured: ReviewReleaseEvidence.Captured) {
  const fields = ["artifact", "publicKey", "signature", "provenance", "updater", "sbom", "notes"] as const
  return fields.flatMap((field) => {
    const file = captured.files[field]
    if (file === undefined) return [{ field, status: "missing" }]
    if ("reason" in file) return [{ field, path: file.path, status: "error", reason: file.reason }]
    return []
  })
}

function errorFiles(captured: ReviewReleaseEvidence.Captured) {
  return Object.entries(captured.files).flatMap(([field, file]) => ("reason" in file ? [{ field, path: file.path, reason: file.reason }] : []))
}

function bytesOf(file: ReviewReleaseEvidence.File | undefined): BytesFile | undefined {
  if (file === undefined || "reason" in file) return undefined
  return file
}

function readJson(bytes: Uint8Array) {
  const text = utf8(bytes)
  if (text === undefined || text.trim().length === 0) return undefined
  const decoded = decodeJson(text)
  if (decoded._tag === "None") return undefined
  return decoded.value
}

function canonicalBase64(value: string) {
  if (value.length % 4 !== 0) return undefined
  if (value !== "" && !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return undefined
  const decoded = Buffer.from(value, "base64")
  if (decoded.toString("base64") !== value) return undefined
  return decoded
}

function utf8(bytes: Uint8Array) {
  return trap(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function trap<T>(read: () => T) {
  try {
    return read()
  } catch {
    return undefined
  }
}
