import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { asHash, id } from "@atlas/kernel"
import { prepareNativePackage, publishNativePackage } from "../src/genesis-native.js"
import type { PreparedNativePackage } from "../src/genesis-native.js"
import { validateNativeBinding } from "../src/genesis-native-binding.js"
import type { NativeBinding } from "../src/genesis-native-binding.js"
import { nativeRecord, validateNativePackage, validateNativeReadQuery } from "../src/genesis-native-format.js"
import type { NativeArtifact, NativePackage } from "../src/genesis-native-format.js"
import { nativeBlobSha, nativeSha256 } from "../src/genesis-native-io.js"
import { ownershipFixture } from "./harness/ownership-fixture.js"

const prior = { actor: process.env.ATLAS_ACTOR, token: process.env.ATLAS_RATIFY_TOKEN }
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  if (prior.actor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = prior.actor
  if (prior.token === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = prior.token
})

/** Existing isolated policy/SCIP/Git fixture. All review identities and responses below are
 * synthetic TEST DATA, never runtime release evidence or claims of independent judgment. */
function fixture() {
  process.env.ATLAS_ACTOR = "alice"
  delete process.env.ATLAS_RATIFY_TOKEN
  const base = ownershipFixture()
  cleanups.push(base.cleanup)
  const write = (path: string, content: string | Uint8Array) => {
    mkdirSync(dirname(join(base.repoPath, path)), { recursive: true })
    writeFileSync(join(base.repoPath, path), content)
  }
  const reference = (path: string) => ({ payload_path: path, sha256: nativeSha256(readFileSync(join(base.repoPath, path))) })
  for (const name of ["recipe", "protocol", "oracle", "request", "response", "semantic-a", "semantic-b"])
    write(`native/${name}.md`, `Synthetic test evidence: ${name}.\n`)
  write("src/native-nav.ts", "export const nativeNavigation = 1\n")
  const artifact = (key: string, path: string, layer: NativeArtifact["layer"], need: NativeArtifact["need"], sourcePath: string): NativeArtifact => {
    const body = new TextEncoder().encode(`\ufeff# Native fixture\r\n## Use\r\nCafe\u0301: ${key}.\r\n`)
    write(`native/${path}`, body)
    const source = readFileSync(join(base.repoPath, sourcePath))
    return {
      key, scope: "core", title: key, layer, need,
      body: { path, encoding: "utf-8", byte_length: body.length, sha256: nativeSha256(body) },
      authority: { scope: "core", basis: "Explicit synthetic test fixture" }, validity: "supported", gaps: [], evidence: ["test-fixture"],
      input_keys: [`file:${sourcePath}`, "file:native/recipe.md"],
      source_refs: [{ commit: "1".repeat(40), path: sourcePath, git_blob_sha: nativeBlobSha(source), sha256: nativeSha256(source) }],
      recipe_ref: reference("native/recipe.md"), build_dependencies: [], navigation: [],
      producer_request_ref: reference("native/request.md"), producer_response_ref: reference("native/response.md"),
      semantic_review_refs: [reference("native/semantic-a.md"), reference("native/semantic-b.md")], runtime_receipt_refs: [],
    }
  }
  const pack: NativePackage = {
    schema: "genesis-native-package/v1", campaign: "fixture", protocol_epoch: "fixture", results_epoch: "fixture", session: "S4",
    source_revision: "1".repeat(40), protocol_ref: reference("native/protocol.md"), scope: "core", package_state: "IN_PROGRESS",
    contract: { criteria: ["fixture-source-binding"], oracle_ref: reference("native/oracle.md") },
    required_artifact_keys: ["evidence", "entry", "navigation"],
    artifacts: [artifact("evidence", "bodies/evidence.md", 1, "evidence", "src/util.ts"), artifact("entry", "bodies/entry.md", 4, "entry", "src/util.ts"), artifact("navigation", "bodies/navigation.md", 2, "component", "src/native-nav.ts")],
    roots: { entry: "entry" }, missing_required_artifact_keys: [], known_limits: ["Synthetic test data only"],
  }
  pack.artifacts[1]!.build_dependencies = [{ key: "evidence", same_package: true }]
  pack.artifacts[1]!.navigation = ["navigation"]
  const save = () => write("native/native-package.json", JSON.stringify(pack))
  const prepare = () => { save(); return prepareNativePackage(base.repoPath, "native/native-package.json") }
  const approval = (prepared: PreparedNativePackage): NativeBinding => {
    write("native/binding-request.json", JSON.stringify(prepared))
    const reviewers = ["synthetic-fixture-reviewer-a", "synthetic-fixture-reviewer-b"]
    return {
      schema: "genesis-native-binding-approval/v1", purpose: "runtime-import-binding",
      candidate_id: prepared.candidate_id, contract: prepared.candidate.contract, reviewers,
      decisions: reviewers.map((reviewer, index) => {
        write(`native/binding-response-${index}.txt`, `Synthetic binding fixture for ${reviewer}; ${prepared.candidate_id}.\n`)
        return {
          reviewer, decision_id: `sha256:${reference(`native/binding-response-${index}.txt`).sha256}`, decision_id_kind: "response-sha256", purpose: "runtime-import-binding", candidate_id: prepared.candidate_id,
          contract: prepared.candidate.contract, verdict: "PASS", criteria: prepared.candidate.criteria.map((id) => ({ id, verdict: "PASS" })),
          entries: prepared.candidate.entries.map((entry) => ({ key: entry.key, result: entry.artifact.result, inputs: entry.inputs_id })),
          request_ref: reference("native/binding-request.json"), response_ref: reference(`native/binding-response-${index}.txt`),
        }
      }),
    }
  }
  return { ...base, write, pack, prepare, save, approval }
}

describe("Genesis native adapter", () => {
  it("validates CLI read selection, byte limits, allowed fields and the explicit historical flag", () => {
    const query = { scope: "core", key: "entry", maxBytes: 4096 }
    expect(validateNativeReadQuery(query)).toEqual(query)
    for (const invalid of [
      { ...query, need: "entry" }, { scope: "core", maxBytes: 4096 }, { ...query, maxBytes: 0 },
      { ...query, maxBytes: "4096" }, { ...query, historical: false }, { ...query, arbitrary: true },
      { scope: "core", need: "invented", maxBytes: 4096 },
    ]) expect(() => validateNativeReadQuery(invalid)).toThrow()
  })
  it("prepares exact bytes and actual kernel input versions without publishing or treating navigation as build", () => {
    const f = fixture()
    const prepared = f.prepare()
    expect(prepared.candidate_id).toBe(id(prepared.candidate))
    expect(f.prepare()).toEqual(prepared)
    const entry = prepared.candidate.entries[1]!
    const result = nativeRecord(f.store.get(entry.artifact.result), "result")
    const body = nativeRecord(f.store.get(asHash(String(result.body))), "body")
    expect(body.bytes).toEqual(Array.from(readFileSync(join(f.repoPath, "native/bodies/entry.md"))))
    const input = entry.inputs.find((input) => input.key === "file:src/util.ts")!
    expect(input.version).toBe(f.current(input.key))
    expect(input.version).not.toBe(f.pack.artifacts[0]!.source_refs[0]!.sha256)
    expect(entry.dependencies.map((dependency) => dependency.key)).toEqual(["evidence"])
    expect(entry.artifact.navigation).toEqual(["navigation"])
    expect(f.runtime().ownership.read({ scope: "core", need: "entry", maxBytes: 4096 }).kind).toBe("hold")
  })

  const malformed: [string, (pack: NativePackage) => void][] = [
    ["duplicate artifact", (pack) => { pack.artifacts.push(pack.artifacts[0]!) }],
    ["duplicate criterion", (pack) => { pack.contract.criteria.push(pack.contract.criteria[0]!) }],
    ["string layer", (pack) => { Object.assign(pack.artifacts[0]!, { layer: "1" }) }],
    ["unknown need", (pack) => { Object.assign(pack.artifacts[0]!, { need: "invented" }) }],
    ["invalid validity", (pack) => { Object.assign(pack.artifacts[0]!, { validity: "pass" }) }],
    ["missing required", (pack) => { pack.required_artifact_keys.push("missing") }],
    ["required unreachable", (pack) => { pack.artifacts[1]!.navigation = [] }],
    ["wrong root need", (pack) => { pack.roots = { evidence: "entry" } }],
    ["source without input", (pack) => { pack.artifacts[0]!.input_keys = ["file:native/recipe.md"] }],
    ["recipe without input", (pack) => { pack.artifacts[0]!.input_keys = ["file:src/util.ts"] }],
    ["unfilled reference", (pack) => { Object.assign(pack.artifacts[0]!, { recipe_ref: null }) }],
    ["source traversal", (pack) => { pack.artifacts[0]!.source_refs[0]!.path = "../outside" }],
    ["body traversal", (pack) => { pack.artifacts[0]!.body.path = "../outside" }],
    ["cycle", (pack) => { pack.artifacts[0]!.build_dependencies = [{ key: "entry", same_package: true }] }],
    ["out of order", (pack) => { pack.artifacts.reverse() }],
    ["unsupported input", (pack) => { pack.artifacts[0]!.input_keys.push("arbitrary:value") }],
    ["external dependency", (pack) => { Object.assign(pack.artifacts[1]!.build_dependencies[0]!, { package_ref: pack.protocol_ref }) }],
  ]
  it.each(malformed)("refuses malformed transport: %s", (_, mutate) => {
    const f = fixture()
    mutate(f.pack)
    expect(() => validateNativePackage(f.pack)).toThrow()
  })

  it("rejects body lengths/hashes, source hashes/blob identities, reference drift and invalid UTF-8", () => {
    const f = fixture()
    f.pack.artifacts[0]!.body.byte_length++
    expect(() => f.prepare()).toThrow("native-body-drift")
    f.pack.artifacts[0]!.body.byte_length--
    f.pack.artifacts[0]!.source_refs[0]!.git_blob_sha = "0".repeat(40)
    expect(() => f.prepare()).toThrow("native-source-drift")
    f.pack.artifacts[0]!.source_refs[0]!.git_blob_sha = nativeBlobSha(readFileSync(join(f.repoPath, "src/util.ts")))
    f.write("native/semantic-a.md", "changed review bytes")
    expect(() => f.prepare()).toThrow("native-reference-drift")
    f.write("native/semantic-a.md", "Synthetic test evidence: semantic-a.\n")
    const bytes = new Uint8Array([255])
    f.write("native/bodies/evidence.md", bytes)
    f.pack.artifacts[0]!.body.sha256 = nativeSha256(bytes)
    f.pack.artifacts[0]!.body.byte_length = 1
    expect(() => f.prepare()).toThrow()
  })

  it("rejects final and ancestor symlinks, unavailable membership and oversized observed source files", () => {
    const f = fixture()
    const path = join(f.repoPath, "native/bodies/evidence.md")
    rmSync(path)
    symlinkSync("entry.md", path)
    expect(() => f.prepare()).toThrow("native-file-kind")
    rmSync(path)
    rmSync(join(f.repoPath, "native/bodies"), { recursive: true })
    symlinkSync(join(f.repoPath, "src"), join(f.repoPath, "native/bodies"), "dir")
    expect(() => f.prepare()).toThrow("native-file-kind")
    const g = fixture()
    g.pack.artifacts[0]!.input_keys.push("members:missing-directory")
    expect(() => g.prepare()).toThrow("native-input-absent")
    g.pack.artifacts[0]!.input_keys.pop()
    g.write("src/util.ts", new Uint8Array(256001))
    expect(() => g.prepare()).toThrow("native-file-limit")
  })

  it("requires two exact new binding decisions, all criteria and every input/result pair", () => {
    const f = fixture()
    const prepared = f.prepare()
    const binding = f.approval(prepared)
    expect(validateNativeBinding(binding, prepared)).toEqual(binding)
    const variants: ((copy: NativeBinding) => void)[] = [
      (copy) => { copy.reviewers[1] = copy.reviewers[0]! },
      (copy) => { copy.decisions[1]!.reviewer = copy.decisions[0]!.reviewer },
      (copy) => { copy.decisions[0]!.candidate_id = "0".repeat(64) },
      (copy) => { copy.decisions[0]!.contract = "0".repeat(64) },
      (copy) => { copy.decisions[0]!.criteria.pop() },
      (copy) => { copy.decisions[0]!.entries[0]!.result = "0".repeat(64) },
      (copy) => { copy.decisions[0]!.entries[0]!.inputs = "0".repeat(64) },
      (copy) => { copy.decisions[0]!.entries.pop() },
      (copy) => { Object.assign(copy.decisions[0]!, { purpose: "semantic-acceptance" }) },
      (copy) => { Object.assign(copy.decisions[0]!, { verdict: "HOLD" }) },
    ]
    variants.forEach((mutate) => {
      const copy = structuredClone(binding)
      mutate(copy)
      expect(() => validateNativeBinding(copy, prepared)).toThrow()
    })
  })

  it("preserves authority identity and keeps a blocked navigation artifact from being published", async () => {
    const f = fixture()
    const before = f.prepare()
    f.pack.artifacts[0]!.authority = { scope: "core", basis: "Changed synthetic authority basis" }
    f.pack.artifacts[2]!.validity = "blocked"
    f.pack.artifacts[2]!.gaps = ["Synthetic unresolved gap"]
    const prepared = f.prepare()
    expect(prepared.candidate.entries[0]!.artifact.result).not.toBe(before.candidate.entries[0]!.artifact.result)
    f.write("native/approval.json", JSON.stringify(f.approval(prepared)))
    expect(await publishNativePackage(f.repoPath, prepared, "native/approval.json"))
      .toMatchObject({ kind: "hold", stage: "ownership-validation", refusal: { reason: "ownership-blocked" } })
    expect(f.runtime().ownership.read({ scope: "core", need: "entry", maxBytes: 4096 }).kind).toBe("hold")
  })

  it("refuses changed bytes and authority absence; real governed publication then supports real index/read", async () => {
    const f = fixture()
    const prepared = f.prepare()
    f.write("native/approval.json", JSON.stringify(f.approval(prepared)))
    const refused = await publishNativePackage(f.repoPath, prepared, "native/approval.json")
    expect(refused).toMatchObject({ kind: "hold", stage: "governed-check" })
    expect(f.runtime().ownership.read({ scope: "core", need: "entry", maxBytes: 4096 }).kind).toBe("hold")
    process.env.ATLAS_RATIFY_TOKEN = "explicit-synthetic-fixture-token"
    const published = await publishNativePackage(f.repoPath, prepared, "native/approval.json")
    expect(published).toMatchObject({ kind: "publication-attempt", emission: { ok: true, data: { emitted: true } } })
    expect(f.runtime().ownership.index("core", "entry")).toMatchObject({ kind: "index", key: "entry", bodiesReturned: false })
    const query = { scope: "core", need: "entry" as const, maxBytes: 4096 }
    expect(f.runtime().ownership.read(query)).toMatchObject({ kind: "ready", body: readFileSync(join(f.repoPath, "native/bodies/entry.md"), "utf8"), checked: ["evidence", "entry"] })
    f.write("src/native-nav.ts", "export const nativeNavigation = 2\n")
    expect(f.runtime().ownership.read(query).kind).toBe("ready")
    expect(f.runtime().ownership.read({ scope: "core", key: "navigation", maxBytes: 4096 })).toMatchObject({ kind: "hold", reason: "ownership-input-changed" })
    f.write("src/util.ts", "export const changed = true\n")
    expect(f.runtime().ownership.read(query)).toMatchObject({ kind: "hold", reason: "ownership-input-changed" })
    await expect(publishNativePackage(f.repoPath, prepared, "native/approval.json")).rejects.toThrow("native-source-drift")
  })
})
