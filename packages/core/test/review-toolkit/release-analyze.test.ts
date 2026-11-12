import { expect } from "bun:test"
import { createHash } from "node:crypto"
import path from "path"
import { mkdir, readFile, readdir, writeFile } from "fs/promises"
import { Effect } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import { ReviewReleaseEvidence } from "../../src/review-toolkit/release-evidence"
import { testEffect } from "../lib/effect"
import { expectSpawn } from "../fixture/omni-expect"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { tmpdir } from "../fixture/tmpdir"

const it = testEffect(LayerNode.compile(AppProcess.node))
const V1 = "artifact-v1-UNIQUE"
const V2 = "artifact-v2-UNIQUE"
const N1 = "notes-v1-UNIQUE"
const N2 = "notes-v2-UNIQUE"
const sha = (text: string) => createHash("sha256").update(text).digest("hex")

const repo = Effect.acquireRelease(
  Effect.gen(function* () {
    const dir = yield* Effect.promise(() => tmpdir())
    const root = path.join(dir.path, "repo")
    const store = path.join(dir.path, "store")
    yield* Effect.promise(async () => {
      await mkdir(path.join(root, "src"), { recursive: true })
      await mkdir(store)
      await writeFile(path.join(root, "package.json"), "{}\n")
      await writeFile(path.join(root, "src", "a.ts"), "export const n = 1\n")
    })
    for (const args of [["init", "-q"], ["config", "user.email", "release@example.com"], ["config", "user.name", "Release"], ["add", "."], ["commit", "-q", "-m", "base"]]) {
      const result = yield* ResearchProcess.run({ command: "git", args, cwd: root, env: ResearchProcess.environment(), timeoutMs: 10_000, maxBytes: 4096 })
      expect(result.exitCode).toBe(0)
    }
    yield* Effect.promise(() => writeFile(path.join(root, ".git", "info", "exclude"), "dist/\n"))
    return { dir, root, store }
  }),
  (fixture) => Effect.promise(() => fixture.dir[Symbol.asyncDispose]()),
)

const analyze = (
  fixture: { root: string; store: string },
  profile: string,
  release?: ReviewReleaseEvidence.Captured,
) =>
  ReviewAnalyze.run({
    worktree: fixture.root,
    base: "HEAD",
    head: "HEAD",
    tier: "standard",
    profile,
    ...(release === undefined ? {} : { release }),
    store: fixture.store,
    changed: {},
    trusted: true,
    lane: "no-build",
    packs: [],
    scope: "diff",
  })

const releaseChecks = (checks: ReadonlyArray<ReviewAnalyze.Check>) => checks.filter((check) => check.id.startsWith("release:"))

const retained = async (store: string, uri: string) => {
  const match = /^review:([0-9a-f-]{36})\/(.+)$/.exec(uri)
  expect(match).not.toBeNull()
  expect(uri).not.toBe("raw/release.json")
  expect(uri.endsWith("/raw/release.json")).toBe(true)
  return Bun.file(path.join(store, match![1], match![2])).text()
}

it.live("retains v1 release evidence after live overwrite", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    const artifact = path.join(fixture.root, "dist", "app.bin")
    const notes = path.join(fixture.root, "dist", "notes.txt")
    yield* Effect.promise(() => mkdir(path.dirname(artifact), { recursive: true }))
    yield* Effect.promise(() => writeFile(artifact, V1))
    yield* Effect.promise(() => writeFile(notes, N1))
    const cap = yield* ReviewReleaseEvidence.capture(fixture.root, { artifact: "dist/app.bin", notes: "dist/notes.txt" })
    const artifactFile = cap.files.artifact
    const notesFile = cap.files.notes
    expect(artifactFile && "sha256" in artifactFile && artifactFile.sha256).toBe(sha(V1))
    expect(notesFile && "sha256" in notesFile && notesFile.sha256).toBe(sha(N1))
    yield* Effect.promise(() => writeFile(artifact, V2))
    yield* Effect.promise(() => writeFile(notes, N2))
    const result = yield* analyze(fixture, "release", cap)
    const checks = releaseChecks(result.checks)
    expect(checks).toHaveLength(6)
    const uri = checks[0]?.uri ?? ""
    expect(checks.every((check) => check.uri === uri)).toBe(true)
    const byId = new Map(checks.map((check) => [check.id, check]))
    expect(byId.get("release:notes")?.status).toBe("pass")
    for (const id of ["release:provenance", "release:signing", "release:updater", "release:sbom"]) {
      expect(byId.get(id)?.status).toBe("not-run")
    }
    expect(byId.get("release:behavioural-eval")?.status).toBe("not-run")
    expect(byId.get("release:behavioural-eval")?.reason).toContain("owner-permission")
    for (const check of checks) {
      expect(check.reason).toContain(cap.identity)
      expect(check.reason).toContain(uri)
    }
    const raw = yield* Effect.promise(() => retained(fixture.store, uri))
    expect(raw).toContain(cap.identity)
    expect(raw).toContain(sha(V1))
    expect(raw).toContain(sha(N1))
    expect(raw).not.toContain(sha(V2))
    expect(raw).not.toContain(V1)
    expect(raw).not.toContain(V2)
    expect(yield* Effect.promise(() => readFile(artifact, "utf8"))).toBe(V2)
    expect(yield* Effect.promise(() => readFile(notes, "utf8"))).toBe(N2)
    expect(artifactFile && "bytes" in artifactFile && Buffer.from(artifactFile.bytes).toString()).toBe(V1)
  }))

it.live("missing release capture is five artifact-unavailable checks plus eval", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    const result = yield* analyze(fixture, "release")
    const checks = releaseChecks(result.checks)
    expect(checks).toHaveLength(6)
    const proofs = checks.filter((check) => check.id !== "release:behavioural-eval")
    expect(proofs).toHaveLength(5)
    expect(proofs.every((check) => check.status === "not-run" && check.reason?.includes("artifact-unavailable"))).toBe(true)
    expect(checks.find((check) => check.id === "release:behavioural-eval")?.reason).toContain("owner-permission")
    const uri = checks[0]?.uri ?? ""
    expect(checks.every((check) => check.uri === uri)).toBe(true)
    const raw = yield* Effect.promise(() => retained(fixture.store, uri))
    expect(raw.length).toBeGreaterThan(0)
    expect(raw).not.toContain(V1)
  }))

it.live("ordinary code profile ignores a provided release capture", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    const cap = yield* ReviewReleaseEvidence.capture(fixture.root, { artifact: "dist/app.bin", notes: "dist/notes.txt" })
    const result = yield* analyze(fixture, "code", cap)
    expect(releaseChecks(result.checks)).toHaveLength(0)
    const names = yield* Effect.promise(() => readdir(fixture.store, { recursive: true }))
    expect(names.some((name) => String(name).endsWith("release.json"))).toBe(false)
  }))
