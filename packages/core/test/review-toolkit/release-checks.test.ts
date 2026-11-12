import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { ReviewReleaseChecks } from "../../src/review-toolkit/release-checks"
import { ReviewReleaseEvidence } from "../../src/review-toolkit/release-evidence"
import { tmpdir } from "../fixture/tmpdir"
import { one, expectShape, expectEval, containsArtifact } from "../fixture/release-assertions"

const FIVE = ["release:provenance", "release:signing", "release:updater", "release:sbom", "release:notes"] as const
const EVAL = "release:behavioural-eval"
const PAYLOAD_TYPE = "application/vnd.in-toto+json"
const STATEMENT = "https://in-toto.io/Statement/v1"
const SLSA = "https://slsa.dev/provenance/v1"
const CLAIMS = [
  "artifact byte signature matches caller-supplied Ed25519 fingerprint",
  "signed provenance statement bound to artifact bytes under caller-supplied fingerprint",
  "supplied updater entry matches artifact bytes only",
  "cryptographic co-signature of supplied SBOM attachment and artifact hashes in one statement",
  "notes supplied for candidate",
] as const
let seq = 0

describe("ReviewReleaseChecks", () => {
  test("valid five pass, behavioural eval stays not-run, raw keeps narrow claims", async () => {
    await using root = await tmpdir()
    const staged = stage(root.path)
    expect(staged.payloadBytes.byteLength).not.toBe(staged.payloadBytes.toString("utf8").length)
    expect(staged.signature.byteLength).toBe(64)
    const { captured, result } = await analyze(root.path, staged.input)
    expect(existsSync(join(root.path, "executed.marker"))).toBe(false)
    expect(captured.identity).toMatch(/^[0-9a-f]{64}$/)
    const artifact = captured.files.artifact
    if (!artifact || !("bytes" in artifact)) throw new Error("artifact buffer missing")
    expect(Buffer.from(artifact.bytes).equals(staged.artifact)).toBe(true)
    expect(artifact.sha256).toBe(sha256(staged.artifact))
    expect(result.checks.map((item) => item.id)).toEqual([...FIVE, EVAL])
    for (const id of FIVE) {
      const item = one(result, id)
      expectShape(item)
      expect(item.status).toBe("pass")
    }
    expectEval(result)
    const raw = JSON.stringify(result.raw)
    for (const claim of CLAIMS) expect(raw).toContain(claim)
    expect(containsArtifact(result.raw, staged.artifact)).toBe(false)
    expect(raw).not.toMatch(/authenticode|notariz|publisher identity|codesign|slsa level/i)
  })

  test("mutated artifact and wrong fingerprint fail signing and provenance", async () => {
    await using root = await tmpdir()
    const mutated = await analyze(root.path, stage(root.path, (draft) => {
      const next = Buffer.from(draft.artifact)
      next[next.byteLength - 1] ^= 0x01
      draft.artifact = next
    }).input)
    expect(one(mutated.result, "release:signing").status).toBe("fail")
    expect(one(mutated.result, "release:provenance").status).toBe("fail")
    expectEval(mutated.result)
    const wrong = await analyze(root.path, stage(root.path, (draft) => { draft.fingerprint = "a".repeat(64) }).input)
    expect(one(wrong.result, "release:signing").status).toBe("fail")
    expect(one(wrong.result, "release:provenance").status).toBe("fail")
    const encoded = await analyze(root.path, stage(root.path, (draft) => {
      draft.signature = Buffer.from(draft.signature.toString("base64"), "utf8")
    }).input)
    expect(one(encoded.result, "release:signing").status).toBe("acquisition-error")
    const rsa = await analyze(root.path, stage(root.path, (draft) => {
      const generated = generateKeyPairSync("rsa", { modulusLength: 2048 })
      const pem = generated.publicKey.export({ type: "spki", format: "pem" })
      if (typeof pem !== "string") throw new Error("expected rsa pem")
      draft.privateKey = generated.privateKey
      draft.pem = pem
      draft.fingerprint = createHash("sha256").update(generated.publicKey.export({ type: "spki", format: "der" })).digest("hex")
      draft.signature = sign("sha256", draft.artifact, generated.privateKey)
      restate(draft)
    }).input)
    expect(one(rsa.result, "release:signing").status).toBe("not-run")
    expect(one(rsa.result, "release:signing").reason).toBe("unsupported-key-type")
    expect(one(rsa.result, "release:provenance").status).toBe("not-run")
    expect(one(rsa.result, "release:provenance").reason).toBe("unsupported-key-type")
    expect(one(rsa.result, "release:signing").status).not.toBe("pass")
  })

  test("missing signer or proofs never pass", async () => {
    await using root = await tmpdir()
    const missingSigner = await analyze(root.path, stage(root.path, (draft) => { draft.omitSigner = true }).input)
    expect(one(missingSigner.result, "release:signing").reason).toBe("signer-policy-missing")
    expect(one(missingSigner.result, "release:provenance").reason).toBe("signer-policy-missing")
    expect(one(missingSigner.result, "release:sbom").reason).toBe("artifact-binding-unavailable")
    expect(one(missingSigner.result, "release:signing").status).toBe("not-run")
    for (const field of ["signature", "provenance"] as const) {
      const item = one((await analyze(root.path, stage(root.path, (draft) => { draft.omit.add(field) }).input)).result, field === "signature" ? "release:signing" : "release:provenance")
      expect(item.status).toBe("not-run")
      expect(item.reason).toBe("evidence-missing")
    }
    for (const field of ["signature", "provenance"] as const) {
      const item = one((await analyze(root.path, stage(root.path, (draft) => { draft.omitSigner = true; draft.omit.add(field) }).input)).result, field === "signature" ? "release:signing" : "release:provenance")
      expect(item.status).toBe("not-run")
      expect(item.reason).toBe("evidence-missing")
    }
  })

  test("dsse ambiguity fails and an advisory keyid change still passes", async () => {
    await using root = await tmpdir()
    const provenance = async (adjust: (draft: Draft) => void) => one((await analyze(root.path, stage(root.path, adjust).input)).result, "release:provenance")
    const unsupported = await provenance((draft) => { draft.payloadType = "application/json"; restate(draft) })
    expect(unsupported.status).toBe("not-run")
    expect(unsupported.reason).toBe("unsupported-format")
    const wrongType = await provenance((draft) => { draft.statementType = "https://in-toto.io/Statement/v0"; restate(draft) })
    expect(wrongType.status).toBe("not-run")
    expect(wrongType.reason).toBe("unsupported-format")
    const wrongPredicate = await provenance((draft) => { draft.predicateType = "https://slsa.dev/provenance/v0.2"; restate(draft) })
    expect(wrongPredicate.status).toBe("not-run")
    expect(wrongPredicate.reason).toBe("unsupported-format")
    const malformed = await provenance((draft) => { restate(draft); draft.payloadB64 = "!!!!" })
    expect(malformed.status).toBe("acquisition-error")
    const broken = await provenance((draft) => { restate(draft); draft.payloadB64 = `${draft.payloadB64.slice(0, 8)}\n${draft.payloadB64.slice(8)}` })
    expect(broken.status).toBe("acquisition-error")
    expect((await provenance((draft) => { const flipped = Buffer.from(draft.provenanceSig); flipped[0] ^= 0xff; draft.provenanceSig = flipped; draft.signatures = [{ keyid: "ignore", sig: flipped }] })).status).toBe("fail")
    expect((await provenance((draft) => { draft.subjects = [{ name: "dist/other.bin", digest: { sha256: sha256(draft.artifact) } }]; restate(draft) })).status).toBe("fail")
    expect((await provenance((draft) => { draft.subjects = [{ name: draft.paths.artifact, digest: { sha256: "0".repeat(64) } }]; restate(draft) })).status).toBe("fail")
    expect((await provenance((draft) => {
      const sha = sha256(draft.artifact)
      draft.subjects = [{ name: draft.paths.artifact, digest: { sha256: sha } }, { name: draft.paths.artifact, digest: { sha256: sha } }]
      restate(draft)
    })).status).toBe("fail")
    expect((await provenance((draft) => { draft.subjects = [{ name: draft.paths.artifact, digest: { sha512: createHash("sha512").update(draft.artifact).digest("hex") } }]; restate(draft) })).status).toBe("fail")
    expect((await provenance((draft) => { draft.includeBuild = false; restate(draft) })).status).toBe("acquisition-error")
    expect((await provenance((draft) => { draft.includeRun = false; restate(draft) })).status).toBe("acquisition-error")
    expect((await provenance((draft) => { draft.signatures = many(draft, 17) })).status).toBe("acquisition-error")
    expect((await provenance((draft) => { draft.signatures = many(draft, 16) })).status).toBe("pass")
    const passed = await analyze(root.path, stage(root.path, (draft) => { draft.keyid = "advisory-changed"; restate(draft) }).input)
    expect(one(passed.result, "release:provenance").status).toBe("pass")
    expect(one(passed.result, "release:signing").status).toBe("pass")
  })

  test("malformed envelope and signed malformed JSON payload are acquisition errors", async () => {
    await using root = await tmpdir()
    const staged = stage(root.path)
    const proof = staged.input.provenance
    if (!proof) throw new Error("fixture missing provenance")
    write(root.path, proof, "{ malformed JSON")
    expect(one((await analyze(root.path, staged.input)).result, "release:provenance").status).toBe("acquisition-error")
    const payload = stage(root.path, (draft) => {
      draft.payloadBytes = Buffer.from("not JSON", "utf8")
      draft.payloadB64 = draft.payloadBytes.toString("base64")
      draft.provenanceSig = sign(null, dssePae(draft.payloadType, draft.payloadBytes), draft.privateKey)
      draft.signatures = [{ keyid: "advisory", sig: draft.provenanceSig }]
    })
    expect(one((await analyze(root.path, payload.input)).result, "release:provenance").status).toBe("acquisition-error")
  })

  test("updater zero, multi, digest and unsupported format cannot pass", async () => {
    await using root = await tmpdir()
    const runUpdater = async (updater: string | ((artifact: Buffer) => string)) => one((await analyze(root.path, stage(root.path, (draft) => { draft.updater = typeof updater === "function" ? updater(draft.artifact) : updater }).input)).result, "release:updater")
    expect((await runUpdater((artifact) => updaterYaml([{ url: "https://downloads.example/app.bin", sha512: sha512b64(artifact) }]))).status).toBe("fail")
    expect((await runUpdater((artifact) => updaterYaml([{ url: "dist/app.bin", sha512: sha512b64(artifact) }]))).status).toBe("fail")
    expect((await runUpdater((artifact) => updaterYaml([{ url: "app%2Ebin", sha512: sha512b64(artifact) }]))).status).toBe("fail")
    expect((await runUpdater((artifact) => updaterYaml([{ url: "app.bin", sha512: sha512b64(artifact) }, { url: "app.bin", sha512: sha512b64(artifact) }]))).status).toBe("fail")
    expect((await runUpdater(updaterYaml([{ url: "app.bin" }]))).reason).toBe("digest-missing-or-invalid")
    expect((await runUpdater(() => updaterYaml([{ url: "app.bin", sha512: Buffer.alloc(64).toString("base64") }]))).status).toBe("fail")
    expect((await runUpdater((artifact) => updaterYaml([{ url: "app.bin", sha512: `${sha512b64(artifact).slice(0, 16)}\n${sha512b64(artifact).slice(16)}` }]))).reason).toBe("digest-missing-or-invalid")
    expect((await runUpdater((artifact) => updaterYaml([{ url: "app.bin", sha512: createHash("sha512").update(artifact).digest("hex") }]))).reason).toBe("digest-missing-or-invalid")
    expect((await runUpdater((artifact) => updaterYaml([{ url: "app.bin", sha512: sha512b64(artifact).slice(0, 40) }]))).reason).toBe("digest-missing-or-invalid")
    expect((await runUpdater((artifact) => updaterYaml([{ url: "app.bin", sha512: sha512b64(artifact).replace(/=+$/, "") }]))).reason).toBe("digest-missing-or-invalid")
    const unsupported = await runUpdater("- not-electron-builder-metadata\n")
    expect(unsupported.status).toBe("not-run")
    expect(unsupported.reason).toBe("unsupported-format")
  })

  test("sbom passes only as a co-signature and stays not-run without binding", async () => {
    await using root = await tmpdir()
    const unbound = await analyze(root.path, stage(root.path, (draft) => { draft.byproducts = []; restate(draft) }).input)
    expect(one(unbound.result, "release:sbom").status).toBe("not-run")
    expect(one(unbound.result, "release:sbom").reason).toBe("artifact-binding-unavailable")
    expect(JSON.stringify(unbound.result.raw).toLowerCase()).toMatch(/unbound/)
    expect(JSON.stringify(unbound.result.raw).toLowerCase()).toMatch(/not.?examined/)
    expect(one(unbound.result, "release:sbom").reason).not.toMatch(/coverage|completeness/i)
    const failed = await analyze(root.path, stage(root.path, (draft) => {
      const flipped = Buffer.from(draft.provenanceSig)
      flipped[2] ^= 0xff
      draft.provenanceSig = flipped
      draft.signatures = [{ keyid: draft.keyid, sig: flipped }]
    }).input)
    expect(one(failed.result, "release:provenance").status).toBe("fail")
    expect(one(failed.result, "release:sbom").reason).toBe("artifact-binding-unavailable")
    const mismatched = await analyze(root.path, stage(root.path, (draft) => { draft.byproducts = byproduct(draft, "c".repeat(64)); restate(draft) }).input)
    expect(one(mismatched.result, "release:sbom").status).toBe("fail")
    const nameless = await analyze(root.path, stage(root.path, (draft) => { draft.byproducts = [{ name: draft.paths.sbom }]; restate(draft) }).input)
    expect(one(nameless.result, "release:sbom").status).toBe("fail")
    const wrongName = await analyze(root.path, stage(root.path, (draft) => { draft.byproducts = [{ name: "other/sbom.json", digest: { sha256: sha256(draft.sbom) } }]; restate(draft) }).input)
    expect(one(wrongName.result, "release:sbom").status).toBe("not-run")
    expect(one(wrongName.result, "release:sbom").reason).toBe("artifact-binding-unavailable")
    for (const sbom of [syftDoc("cyclonedx"), syftDoc("syft", false, true), syftDoc("syft", true, false)]) {
      const item = one((await analyze(root.path, stage(root.path, (draft) => bindSbom(draft, sbom)).input)).result, "release:sbom")
      expect(item.status).toBe("not-run")
      expect(item.reason).toBe("unsupported-format")
    }
    const bound = await analyze(root.path, stage(root.path).input)
    expect(one(bound.result, "release:sbom").status).toBe("pass")
    const raw = JSON.stringify(bound.result.raw)
    expect(raw).toContain(CLAIMS[3])
    expect(raw).not.toMatch(/syft source describes|coverage complete|completeness verified/i)
  })

  test("artifact acquisition errors cannot become waived omissions and unsigned DSSE fails", async () => {
    await using root = await tmpdir()
    const unreadable = await analyze(root.path, { artifact: "absent.bin" })
    for (const id of FIVE) expect(one(unreadable.result, id)).toMatchObject({ status: "acquisition-error", reason: "ENOENT" })
    const staged = stage(root.path)
    if (!staged.input.provenance) throw new Error("fixture provenance missing")
    write(root.path, staged.input.provenance, JSON.stringify({ payloadType: PAYLOAD_TYPE, payload: staged.payloadBytes.toString("base64"), signatures: [] }))
    expect(one((await analyze(root.path, staged.input)).result, "release:provenance")).toMatchObject({ status: "fail", reason: "signature-mismatch" })
  })

  test("missing input is five not-runs and each omitted path is evidence-missing", async () => {
    await using root = await tmpdir()
    const absent = await analyze(root.path)
    expect(absent.result.checks.map((item) => item.id)).toEqual([...FIVE, EVAL])
    for (const id of FIVE) {
      const item = one(absent.result, id)
      expectShape(item)
      expect(item.status).toBe("not-run")
      expect(item.reason).toBe("artifact-unavailable")
    }
    expectEval(absent.result)
    for (const field of ["signature", "provenance", "updater", "sbom", "notes"] as const) {
      const item = one((await analyze(root.path, stage(root.path, (draft) => { draft.omit.add(field) }).input)).result, field === "signature" ? "release:signing" : `release:${field}`)
      expect(item.status).toBe("not-run")
      expect(item.reason).toBe("evidence-missing")
    }
  })

  test("empty or invalid notes are acquisition errors and genuine notes only prove presence", async () => {
    await using root = await tmpdir()
    for (const notes of [Buffer.alloc(0), Buffer.from(" \n\t", "utf8"), Buffer.from([0xff, 0xfe, 0xfd])]) {
      const item = one((await analyze(root.path, stage(root.path, (draft) => { draft.notes = notes }).input)).result, "release:notes")
      expect(item.status).toBe("acquisition-error")
    }
    const result = (await analyze(root.path, stage(root.path).input)).result
    expect(one(result, "release:notes").status).toBe("pass")
    const raw = JSON.stringify(result.raw)
    expect(raw).toContain("notes supplied for candidate")
    expect(raw).not.toMatch(/semantic quality|behavioral claim|behavioural eval passed/i)
  })
})

type EnvelopeSig = { keyid: string; sig: Buffer }
type Subject = { name: string; digest: Record<string, string> }
type Paths = { artifact: string; pem: string; signature: string; provenance: string; updater: string; sbom: string; notes: string }
type Draft = {
  privateKey: KeyObject
  pem: string
  fingerprint: string
  artifact: Buffer
  signature: Buffer
  payloadType: string
  payloadBytes: Buffer
  payloadB64: string
  provenanceSig: Buffer
  keyid: string
  signatures: EnvelopeSig[]
  updater: string
  sbom: Buffer
  notes: Buffer
  omitSigner: boolean
  omit: Set<"signature" | "provenance" | "updater" | "sbom" | "notes">
  paths: Paths
  statementType: string
  predicateType: string
  includeBuild: boolean
  includeRun: boolean
  subjects: Subject[]
  byproducts: Array<Record<string, unknown>>
}

function stage(root: string, adjust?: (draft: Draft) => void) {
  const id = seq
  seq += 1
  const paths: Paths = {
    artifact: `c${id}/dist/app.bin`, pem: `c${id}/keys/release.pem`, signature: `c${id}/proofs/app.sig`,
    provenance: `c${id}/proofs/app.intoto.json`, updater: `c${id}/proofs/latest.yml`, sbom: `c${id}/proofs/sbom.syft.json`, notes: `c${id}/proofs/notes.txt`,
  }
  const { publicKey, privateKey } = generateKeyPairSync("ed25519")
  const pem = publicKey.export({ type: "spki", format: "pem" })
  if (typeof pem !== "string") throw new Error("expected spki pem")
  const artifact = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(`#!/bin/sh\necho EXECUTED > '${join(root, "executed.marker")}'\n`, "utf8")])
  const sbom = syftDoc("syft")
  const draft: Draft = {
    privateKey, pem, fingerprint: createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex"),
    artifact, signature: sign(null, artifact, privateKey), payloadType: PAYLOAD_TYPE, payloadBytes: Buffer.alloc(0), payloadB64: "",
    provenanceSig: Buffer.alloc(0), keyid: "advisory", signatures: [], updater: updaterYaml([{ url: "app.bin", sha512: sha512b64(artifact) }]),
    sbom, notes: Buffer.from("Candidate notes supplied for review.\n", "utf8"), omitSigner: false, omit: new Set(), paths,
    statementType: STATEMENT, predicateType: SLSA, includeBuild: true, includeRun: true,
    subjects: [{ name: paths.artifact, digest: { sha256: sha256(artifact) } }], byproducts: [{ name: paths.sbom, digest: { sha256: sha256(sbom) } }],
  }
  restate(draft)
  adjust?.(draft)
  write(root, paths.artifact, draft.artifact)
  write(root, paths.pem, draft.pem)
  write(root, paths.signature, draft.signature)
  write(root, paths.provenance, JSON.stringify({
    payloadType: draft.payloadType,
    payload: draft.payloadB64,
    signatures: draft.signatures.map((item) => ({ keyid: item.keyid, sig: Buffer.from(item.sig).toString("base64") })),
  }))
  write(root, paths.updater, draft.updater)
  write(root, paths.sbom, draft.sbom)
  write(root, paths.notes, draft.notes)
  const input: ReviewReleaseEvidence.Input = {
    artifact: paths.artifact,
    ...(draft.omitSigner ? {} : { signer: { publicKey: paths.pem, sha256: draft.fingerprint } }),
    ...(draft.omit.has("signature") ? {} : { signature: paths.signature }),
    ...(draft.omit.has("provenance") ? {} : { provenance: paths.provenance }),
    ...(draft.omit.has("updater") ? {} : { updater: paths.updater }),
    ...(draft.omit.has("sbom") ? {} : { sbom: paths.sbom }),
    ...(draft.omit.has("notes") ? {} : { notes: paths.notes }),
  }
  return { input, artifact: draft.artifact, signature: draft.signature, payloadBytes: draft.payloadBytes }
}

function restate(draft: Draft) {
  const predicate: Record<string, unknown> = {}
  if (draft.includeBuild) predicate.buildDefinition = { buildType: "https://example.test/build/v1", externalParameters: { label: "caf\u00e9" } }
  if (draft.includeRun) predicate.runDetails = { builder: { id: "https://example.test/builder/v1" }, byproducts: draft.byproducts }
  draft.payloadBytes = Buffer.from(JSON.stringify({ _type: draft.statementType, subject: draft.subjects, predicateType: draft.predicateType, predicate }), "utf8")
  draft.payloadB64 = draft.payloadBytes.toString("base64")
  const pae = dssePae(draft.payloadType, draft.payloadBytes)
  draft.provenanceSig = draft.privateKey.asymmetricKeyType === "ed25519" ? sign(null, pae, draft.privateKey) : sign("sha256", pae, draft.privateKey)
  draft.signatures = [{ keyid: draft.keyid, sig: draft.provenanceSig }]
}

function bindSbom(draft: Draft, sbom: Buffer) {
  draft.sbom = sbom
  draft.byproducts = byproduct(draft, sha256(sbom))
  restate(draft)
}

function byproduct(draft: Draft, digest: string) {
  return [{ name: draft.paths.sbom, digest: { sha256: digest } }]
}

function many(draft: Draft, count: number) {
  const bad = Array.from({ length: count - 1 }, (_, index) => {
    const flipped = Buffer.from(draft.provenanceSig)
    flipped[0] ^= 0xff
    flipped[1] = index
    return { keyid: draft.fingerprint, sig: flipped }
  })
  return [...bad, { keyid: "unauthenticated-advisory", sig: Buffer.from(draft.provenanceSig) }]
}

function syftDoc(name: string, artifacts = true, source = true) {
  const doc: Record<string, unknown> = { descriptor: { name } }
  if (artifacts) doc.artifacts = []
  if (source) doc.source = { type: "directory" }
  return Buffer.from(JSON.stringify(doc))
}

function dssePae(payloadType: string, payloadBytes: Uint8Array) {
  const typeBytes = Buffer.from(payloadType, "utf8")
  return Buffer.concat([
    Buffer.from(`DSSEv1 ${String(typeBytes.byteLength)} `, "ascii"), typeBytes,
    Buffer.from(` ${String(payloadBytes.byteLength)} `, "ascii"), Buffer.from(payloadBytes),
  ])
}

function updaterYaml(entries: ReadonlyArray<{ url: string; sha512?: string }>) {
  const files = entries.map((entry) => entry.sha512 === undefined ? `  - url: ${JSON.stringify(entry.url)}` : `  - url: ${JSON.stringify(entry.url)}\n    sha512: ${JSON.stringify(entry.sha512)}`).join("\n")
  return `version: "1.2.3"\nfiles:\n${files}\n`
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex")
}

function sha512b64(bytes: Uint8Array) {
  return createHash("sha512").update(bytes).digest().toString("base64")
}

function write(root: string, rel: string, data: Uint8Array | string) {
  const file = join(root, rel)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, data)
}

async function analyze(root: string, input?: ReviewReleaseEvidence.Input) {
  const captured = await Effect.runPromise(ReviewReleaseEvidence.capture(root, input))
  return { captured, result: await Effect.runPromise(ReviewReleaseChecks.run(captured)) }
}
