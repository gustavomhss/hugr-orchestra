import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Deferred, Effect, Exit, Fiber, Scope } from "effect"
import { TestClock } from "effect/testing"
import { AgentV2 } from "@orchestra/core/agent"
import { ReviewTools } from "@orchestra/core/review/tools"
import { ReviewProbe } from "@orchestra/core/review-toolkit/probe"
import { ReviewScratch } from "@orchestra/core/review-toolkit/scratch-copy"
import { CodeIndexShard } from "@orchestra/core/research-toolkit/code-index/shard"
import { CodeIndexStore } from "@orchestra/core/research-toolkit/code-index/store"
import { ResearchToolkit } from "@orchestra/core/research-toolkit/index"
import { Tool } from "@orchestra/core/tool/tool"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { decoded, prepared, retained, run, seed, sourcePath, sourceText } from "./fixture/lucy-code-tools"
import { ReviewBindingV2 } from "../src/v2/tools/review-binding"

// The production registry and real Git/rg/SQLite paths. No new implementation import is needed for this RED gate.

test("registered review search and locate retain captured bytes after live worktree and HEAD change", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  yield* ReviewTools.bind(made.sessionID, made.binding)
  yield* ReviewTools.readCode(made.sessionID)
  yield* Effect.promise(() => Bun.write(path.join(made.directory, sourcePath), "export const liveOnly = 99\n"))
  yield* made.git(["add", "-A"])
  yield* made.git(["commit", "-q", "-m", "later"])
  const search = decoded(yield* made.call("code_search", { pattern: "capturedValue" }))
  expect(search.result.basis.basis.commit).toBe(made.commit)
  expect(search.result.matches).toEqual([expect.objectContaining({ path: sourcePath, text: sourceText.trim() })])
  expect(yield* retained(made, search.evidence)).toContain("capturedValue")
  const locate = decoded(yield* made.call("code_locate", { terms: ["capturedValue"] }))
  expect(locate.result.ranges).toContainEqual(expect.objectContaining({ path: sourcePath }))
  expect(locate.result.basis.basis.commit).toBe(made.commit)
  expect(locate.result.basis.coverage.complete).toBe(false)
  const text = yield* retained(made, locate.evidence)
  expect(text).toContain(sourceText.trim())
  expect(text).not.toContain("liveOnly")
})))

test("registered review query uses compatible prepared SQLite at the captured commit", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  yield* prepared(made)
  yield* ReviewTools.bind(made.sessionID, made.binding)
  yield* Effect.promise(() => Bun.write(path.join(made.directory, sourcePath), "export const liveOnly = 99\n"))
  const page = decoded(yield* made.call("code_query", { op: "symbols", name: "capturedValue" }))
  expect(page.result.hits).toContainEqual(expect.objectContaining({ range: expect.objectContaining({ path: sourcePath }) }))
  expect(page.result.basis.basis.commit).toBe(made.commit)
  expect(page.result.basis.freshness).toBe("fresh")
  expect(yield* retained(made, page.evidence)).toContain("capturedValue")
})))

test("a byte-identical prepared shard is reusable by another captured commit without rewriting its manifest", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  const plan = yield* prepared(made)
  const shards = plan.shards.map((entry) => ({ id: entry.shard.id, key: entry.key }))
  const limits = { commits: 4, bytes: 10_000_000 }
  yield* CodeIndexStore.retain(plan.dir, { commit: made.commit, at: 1, shards }, limits)
  yield* Effect.promise(() => Bun.write(path.join(made.directory, "README.md"), "Unrelated documentation.\n"))
  yield* made.git(["add", "-A"])
  yield* made.git(["commit", "-q", "-m", "docs"])
  const next = yield* made.git(["rev-parse", "HEAD"])
  yield* CodeIndexStore.retain(plan.dir, { commit: next, at: 2, shards }, limits)
  const before = yield* Effect.promise(() => Bun.file(path.join(plan.dir, "commits.json")).text())
  const copy = yield* ReviewScratch.create({ worktree: made.directory, revision: next })
  yield* ReviewTools.bind(made.sessionID, {
    ...made.binding, codeSource: Effect.succeed({ directory: copy.root, worktree: made.directory, commit: next }),
  })
  const page = decoded(yield* made.call("code_query", { op: "symbols", name: "capturedValue" }))
  expect(page.result.basis.basis.commit).toBe(next)
  expect(page.result.hits).toHaveLength(1)
  expect(yield* Effect.promise(() => Bun.file(path.join(plan.dir, "commits.json")).text())).toBe(before)
})))

test("reviewing an older prepared commit does not update the cache retention order", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  const plan = yield* prepared(made)
  const shards = plan.shards.map((entry) => ({ id: entry.shard.id, key: entry.key }))
  const limits = { commits: 4, bytes: 10_000_000 }
  yield* CodeIndexStore.retain(plan.dir, { commit: made.commit, at: 1, shards }, limits)
  yield* CodeIndexStore.retain(plan.dir, { commit: "f".repeat(40), at: 2, shards }, limits)
  const before = yield* Effect.promise(() => Bun.file(path.join(plan.dir, "commits.json")).text())
  yield* ReviewTools.bind(made.sessionID, made.binding)
  expect(decoded(yield* made.call("code_query", { op: "symbols", name: "capturedValue" })).result.hits).toHaveLength(1)
  expect(yield* Effect.promise(() => Bun.file(path.join(plan.dir, "commits.json")).text())).toBe(before)
})))

for (const altered of ["metadata", "digest", "path"] as const) {
  test(`registered review query refuses incompatible cached ${altered}`, () => run(Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const made = yield* seed
    yield* prepared(made, altered)
    yield* ReviewTools.bind(made.sessionID, made.binding)
    const result = yield* made.call("code_query", { op: "symbols", name: "capturedValue" })
    expect(result.type).toBe("error")
    expect(String(result.value)).toContain("index_unavailable")
  })))
}

test("a missing prepared review index refuses without creating a cache", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  yield* ReviewTools.bind(made.sessionID, made.binding)
  const root = yield* ResearchToolkit.Root
  const before = yield* Effect.promise(() => fs.readdir(root))
  const result = yield* made.call("code_query", { op: "symbols", name: "capturedValue" })
  expect(result.type).toBe("error")
  expect(String(result.value)).toContain("index_unavailable")
  expect(yield* Effect.promise(() => fs.readdir(root))).toEqual(before)
})))

test("an omitted semantic commit remains unavailable to review index queries", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  const source = yield* made.binding.codeSource
  yield* ReviewTools.bind(made.sessionID, { ...made.binding, codeSource: Effect.succeed({ directory: source.directory, worktree: source.worktree }) })
  const result = yield* made.call("code_query", { op: "symbols", name: "capturedValue" })
  expect(result.type).toBe("error")
  expect(String(result.value)).toContain("index_unavailable")
})))

test("a host-owned tree without a semantic commit supports immutable review search and locate", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  const git = yield* CodeIndexShard.captured(made.directory, made.commit)
  const tree = (yield* git.run(["rev-parse", "--verify", `${made.commit}^{tree}`])).toString("utf8").trim()
  expect(tree).not.toBe(made.commit)
  const probe = (yield* made.copies).head.root
  // This is the actual governed binding seam, which omits headCommit. The fixture never supplies source.tree itself.
  const binding = yield* ReviewBindingV2.reviewBinding({
    worktree: made.directory, diff: "", cache: made.cache, lenses: [], ledger: ReviewProbe.ledger(), copies: made.copies,
  })({ sessionID: made.sessionID, role: "lead", retained: "review:test/code.json", cap: 0 })
  yield* ReviewTools.bind(made.sessionID, binding)
  const source = yield* ReviewTools.readCode(made.sessionID)
  expect(source.source).toMatchObject({ tree })
  expect(source.source.commit).toBeUndefined()
  yield* Effect.promise(async () => {
    await Bun.write(path.join(made.directory, sourcePath), "export const liveOnly = 99\n")
    await Bun.write(path.join(probe, sourcePath), "export const probeOnly = 123\n")
  })
  const search = decoded(yield* made.call("code_search", { pattern: "capturedValue" }))
  expect(search.result.matches).toEqual([expect.objectContaining({ path: sourcePath, text: sourceText.trim() })])
  expect(search.result.basis.basis.commit).toBe("unversioned")
  expect(search.result.basis.basis.commit).not.toBe(tree)
  const searchText = yield* retained(made, search.evidence)
  expect(searchText).toContain(tree)
  expect(searchText).not.toContain("probeOnly")
  expect(searchText).not.toContain("liveOnly")
  const locate = decoded(yield* made.call("code_locate", { terms: ["capturedValue"] }))
  expect(locate.result.ranges).toContainEqual(expect.objectContaining({ path: sourcePath }))
  expect(locate.result.basis.basis.commit).toBe("unversioned")
  const text = yield* retained(made, locate.evidence)
  expect(text).toContain(sourceText.trim())
  expect(text).toContain(tree)
  expect(text).not.toContain("probeOnly")
  expect(text).not.toContain("liveOnly")
  const query = yield* made.call("code_query", { op: "symbols", name: "capturedValue" })
  expect(query.type).toBe("error")
  expect(String(query.value)).toContain("index_unavailable")
})))

test("another actor cannot borrow an active review binding through registered CODE tools", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  const observed = { source: 0, retained: 0 }
  yield* ReviewTools.bind(made.sessionID, {
    ...made.binding,
    codeSource: Effect.suspend(() => { observed.source += 1; return made.binding.codeSource }),
    retain: (artifact) => Effect.sync(() => { observed.retained += 1 }).pipe(Effect.andThen(made.binding.retain(artifact))),
  })
  for (const agent of ["maestro", "general"]) {
    for (const [name, input] of [
      ["code_search", { pattern: "capturedValue" }],
      ["code_query", { op: "symbols", name: "capturedValue" }],
      ["code_locate", { terms: ["capturedValue"] }],
    ] as const) {
      const result = yield* made.call(name, input, agent)
      expect(result.type).toBe("error")
      expect(String(result.value)).toContain("runs only")
    }
  }
  expect(observed).toEqual({ source: 0, retained: 0 })
})))

test("review CODE permission denial precedes source acquisition and retention", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  const observed = { source: 0, retained: 0 }
  yield* ReviewTools.bind(made.sessionID, {
    ...made.binding,
    codeSource: Effect.suspend(() => { observed.source += 1; return made.binding.codeSource }),
    retain: (artifact) => Effect.sync(() => { observed.retained += 1 }).pipe(Effect.andThen(made.binding.retain(artifact))),
  })
  const agents = yield* AgentV2.Service
  yield* agents.transform((draft) => draft.update(AgentV2.ID.make("lucy"), (agent) => {
    agent.permissions.push({ action: "code_*", resource: "*", effect: "deny" })
  }))
  for (const [name, input] of [
    ["code_search", { pattern: "capturedValue" }],
    ["code_query", { op: "symbols", name: "capturedValue" }],
    ["code_locate", { terms: ["capturedValue"] }],
  ] as const) {
    const result = yield* made.call(name, input)
    expect(result.type).toBe("error")
    expect(String(result.value)).toContain("was not permitted")
  }
  expect(observed).toEqual({ source: 0, retained: 0 })
})))

test("registered review CODE refuses traversal and foreign absolute paths", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  yield* ReviewTools.bind(made.sessionID, made.binding)
  for (const outside of ["../outside.ts", path.join(path.dirname(made.directory), "outside.ts")]) {
    for (const [name, input] of [
      ["code_search", { pattern: "private", paths: [outside] }],
      ["code_query", { op: "symbols", path: outside }],
      ["code_locate", { terms: ["private"], paths: [outside] }],
    ] as const) {
      const result = yield* made.call(name, input)
      expect(result.type).toBe("error")
      expect(String(result.value)).toContain("reference_invalid")
    }
  }
})))

test("CODE cannot observe a temporarily modified probe scratch copy", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  yield* ReviewTools.bind(made.sessionID, made.binding)
  const probe = (yield* made.copies).head.root
  yield* Effect.promise(() => Bun.write(path.join(probe, sourcePath), "export const probeOnly = 123\n"))
  const result = decoded(yield* made.call("code_search", { pattern: "capturedValue" }))
  expect(result.result.matches).toEqual([expect.objectContaining({ path: sourcePath, text: sourceText.trim() })])
  expect(yield* Effect.promise(() => Bun.file(path.join(probe, sourcePath)).text())).toContain("probeOnly")
  expect(yield* retained(made, result.evidence)).not.toContain("probeOnly")
})))

test("a substituted scratch directory link cannot alter the captured CODE source", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  yield* ReviewTools.bind(made.sessionID, made.binding)
  const copy = (yield* made.copies).head.root
  yield* Effect.promise(async () => {
    const external = path.join(made.directory, "private")
    await fs.mkdir(external)
    await fs.writeFile(path.join(external, "a.ts"), "external-private-token\n")
    await fs.rm(path.join(copy, "src"), { recursive: true })
    await fs.symlink(external, path.join(copy, "src"), process.platform === "win32" ? "junction" : "dir")
  })
  const result = decoded(yield* made.call("code_search", { pattern: "capturedValue" }))
  expect(result.result.matches).toEqual([expect.objectContaining({ path: sourcePath, text: sourceText.trim() })])
  expect(result.result.basis.basis.commit).toBe(made.commit)
  expect(yield* retained(made, result.evidence)).not.toContain("external-private-token")
  const locate = decoded(yield* made.call("code_locate", { terms: ["capturedValue"] }))
  expect(locate.result.ranges).toContainEqual(expect.objectContaining({ path: sourcePath }))
  expect(yield* retained(made, locate.evidence)).not.toContain("external-private-token")
})))

test("missing and closed review bindings refuse through the registered CODE route", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  const missing = yield* made.call("code_search", { pattern: "capturedValue" })
  expect(missing.type).toBe("error")
  expect(String(missing.value)).toContain("review-code-binding-missing")
  yield* Effect.scoped(ReviewTools.bind(made.sessionID, made.binding))
  const closed = yield* made.call("code_locate", { terms: ["capturedValue"] })
  expect(closed.type).toBe("error")
  expect(String(closed.value)).toContain("review-code-binding-missing")
})))

test("failed source acquisition never falls back to the live Location", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  yield* ReviewTools.bind(made.sessionID, {
    ...made.binding, codeSource: Effect.fail(new Tool.Failure({ message: "fixture capture timeout" })),
  })
  const result = yield* made.call("code_search", { pattern: "capturedValue" })
  expect(result.type).toBe("error")
  expect(String(result.value)).toContain("review-code-source-unavailable")
})))

test("cancelling a registered CODE call interrupts pending source acquisition", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  const reading = yield* Deferred.make<void>()
  const released = yield* Deferred.make<void>()
  yield* ReviewTools.bind(made.sessionID, {
    ...made.binding,
    codeSource: Deferred.succeed(reading, undefined).pipe(
      Effect.andThen(Effect.never), Effect.ensuring(Deferred.succeed(released, undefined)),
    ),
  })
  const pending = yield* made.call("code_search", { pattern: "capturedValue" }).pipe(Effect.forkChild)
  const reached = yield* Effect.raceFirst(Deferred.await(reading).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)))
  expect(reached).toBe(true)
  expect(pending.pollUnsafe()).toBeUndefined()
  yield* Fiber.interrupt(pending)
  expect(yield* Deferred.isDone(released)).toBe(true)
})))

test("the host CODE deadline interrupts a pending source at 60 seconds", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  yield* Effect.gen(function* () {
    const reading = yield* Deferred.make<void>()
    const released = yield* Deferred.make<void>()
    yield* ReviewTools.bind(made.sessionID, {
      ...made.binding,
      codeSource: Deferred.succeed(reading, undefined).pipe(
        Effect.andThen(Effect.never), Effect.ensuring(Deferred.succeed(released, undefined)),
      ),
    })
    const pending = yield* made.call("code_search", { pattern: "capturedValue" }).pipe(Effect.forkChild)
    const reached = yield* Effect.raceFirst(Deferred.await(reading).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)))
    expect(reached).toBe(true)
    yield* TestClock.adjust("59 seconds")
    expect(pending.pollUnsafe()).toBeUndefined()
    yield* TestClock.adjust("1 second")
    expect(pending.pollUnsafe()).toBeDefined()
    const result = yield* Fiber.join(pending)
    expect(result.type).toBe("error")
    expect(String(result.value)).toContain("review-code-timeout")
    expect(yield* Deferred.isDone(released)).toBe(true)
  }).pipe(Effect.provide(TestClock.layer()))
})))

test("one CODE deadline covers source acquisition and later evidence retention together", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  const source = yield* made.binding.codeSource
  yield* Effect.gen(function* () {
    const reading = yield* Deferred.make<void>()
    const releaseSource = yield* Deferred.make<void>()
    const retaining = yield* Deferred.make<void>()
    const released = yield* Deferred.make<void>()
    yield* ReviewTools.bind(made.sessionID, {
      ...made.binding,
      codeSource: Deferred.succeed(reading, undefined).pipe(Effect.andThen(Deferred.await(releaseSource)), Effect.as(source)),
      retain: () => Deferred.succeed(retaining, undefined).pipe(
        Effect.andThen(Effect.never), Effect.ensuring(Deferred.succeed(released, undefined)),
      ),
    })
    const pending = yield* made.call("code_search", { pattern: "capturedValue" }).pipe(Effect.forkChild)
    expect(yield* Effect.raceFirst(Deferred.await(reading).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)))).toBe(true)
    yield* TestClock.adjust("50 seconds")
    yield* Deferred.succeed(releaseSource, undefined)
    expect(yield* Effect.raceFirst(Deferred.await(retaining).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)))).toBe(true)
    yield* TestClock.adjust("9 seconds")
    expect(pending.pollUnsafe()).toBeUndefined()
    yield* TestClock.adjust("1 second")
    expect(pending.pollUnsafe()).toBeDefined()
    const result = yield* Fiber.join(pending)
    expect(result.type).toBe("error")
    expect(String(result.value)).toContain("review-code-timeout")
    expect(yield* Deferred.isDone(released)).toBe(true)
  }).pipe(Effect.provide(TestClock.layer()))
})))

test("cancelling a CODE call during retention interrupts retention before delivery", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  const retaining = yield* Deferred.make<void>()
  const released = yield* Deferred.make<void>()
  yield* ReviewTools.bind(made.sessionID, {
    ...made.binding,
    retain: () => Deferred.succeed(retaining, undefined).pipe(
      Effect.andThen(Effect.never), Effect.ensuring(Deferred.succeed(released, undefined)),
    ),
  })
  const pending = yield* made.call("code_search", { pattern: "capturedValue" }).pipe(Effect.forkChild)
  expect(yield* Effect.raceFirst(Deferred.await(retaining).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)))).toBe(true)
  expect(pending.pollUnsafe()).toBeUndefined()
  yield* Fiber.interrupt(pending)
  expect(yield* Deferred.isDone(released)).toBe(true)
})))

test("closing the binding during evidence retention prevents successful CODE delivery", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  const retaining = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const scope = yield* Scope.make()
  yield* ReviewTools.bind(made.sessionID, {
    ...made.binding,
    retain: (artifact) => Deferred.succeed(retaining, undefined).pipe(
      Effect.andThen(Deferred.await(release)), Effect.andThen(made.binding.retain(artifact)),
    ),
  }).pipe(Effect.provideService(Scope.Scope, scope))
  const pending = yield* made.call("code_search", { pattern: "capturedValue" }).pipe(Effect.forkChild)
  // The baseline returns the wrong-seat refusal. Joining the result must not hang waiting for an unentered callback.
  const reached = yield* Effect.raceFirst(Deferred.await(retaining).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)))
  yield* Scope.close(scope, Exit.void)
  yield* Deferred.succeed(release, undefined)
  expect(reached).toBe(true)
  const result = yield* Fiber.join(pending)
  expect(result.type).toBe("error")
  expect(String(result.value)).toContain("review-code-binding-missing")
})))

test("replacing a binding during evidence retention cannot revive an old CODE call", () => run(Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const made = yield* seed
  const retaining = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const scope = yield* Scope.make()
  yield* ReviewTools.bind(made.sessionID, {
    ...made.binding,
    retain: (artifact) => Deferred.succeed(retaining, undefined).pipe(
      Effect.andThen(Deferred.await(release)), Effect.andThen(made.binding.retain(artifact)),
    ),
  }).pipe(Effect.provideService(Scope.Scope, scope))
  const pending = yield* made.call("code_search", { pattern: "capturedValue" }).pipe(Effect.forkChild)
  const reached = yield* Effect.raceFirst(Deferred.await(retaining).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)))
  yield* Scope.close(scope, Exit.void)
  yield* ReviewTools.bind(made.sessionID, { ...made.binding })
  yield* Deferred.succeed(release, undefined)
  expect(reached).toBe(true)
  const result = yield* Fiber.join(pending)
  expect(result.type).toBe("error")
  expect(String(result.value)).toContain("review-code-binding-missing")
})))
