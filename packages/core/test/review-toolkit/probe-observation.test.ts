import { expect } from "bun:test"
import path from "path"
import { mkdir, writeFile } from "fs/promises"
import { Effect, Exit } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ProbeRun } from "../../src/research-toolkit/probe/run"
import { ReviewProbe, ReviewScratch } from "../../src/review-toolkit"
import { expectSpawn } from "../fixture/omni-expect"
import { git } from "../fixture/git"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { jail } from "../lib/sandbox-host"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
// Refusals always run. Confined cases run when a jail exists; Linux without one fails closed instead of skipping the file.
const confined = process.platform === "linux" || jail ? it.live : it.live.skip

const repo = Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  const root = path.join(dir.path, "repo")
  await mkdir(path.join(root, "src"), { recursive: true })
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "probe@example.com")
  await git(root, "config", "user.name", "Probe")
  await writeFile(path.join(root, "package.json"), "{}\n")
  await writeFile(path.join(root, "bunfig.toml"), "[test]\n")
  await writeFile(path.join(root, "src", "a.ts"), "export const limit = 1\n")
  await writeFile(path.join(root, "src", "a.test.ts"), `import { test } from "bun:test"\ntest("limit", () => {})\n`)
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "base")
  return { dir, root }
}), (fixture) => Effect.promise(() => fixture.dir[Symbol.asyncDispose]()))

function watch(ledger: ReviewProbe.Ledger, blow?: string) {
  const calls: ReviewProbe.Observed[][] = []
  const observe = (items: ReadonlyArray<ReviewProbe.Observed>) => {
    expect(items, "observer must see only the new attempt").toHaveLength(1)
    expect(items, "observer must not receive the ledger array").not.toBe(ledger.observed)
    const item = items[0]
    const observed = ledger.observed.at(-1)
    if (!item || !observed) throw new Error("settled observation missing")
    expect(item).toBe(observed)
    calls.push([...items])
    if (blow && items[0]?.candidate === blow) throw new Error("observer-after-settlement")
  }
  return { calls, observe }
}

const script = (candidate: string, text: string): ReviewProbe.Input => ({
  candidate,
  option: "probe:script",
  target: { script: { language: "js", text } },
})

it.live("a refusal is settled once, observed as only that attempt, and does not consume a run", () =>
  Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const ledger = ReviewProbe.ledger()
      const seen = watch(ledger)
      const shared: ReviewProbe.Context = {
        reviewID: "review_observe", head, offered: { c1: ["probe:script"] }, cap: 3, hunks: [],
        ledger, observe: seen.observe, timeoutSeconds: 60,
      }
      const unknown = yield* ReviewProbe.run(script("missing", "console.log(1)"), shared)
      expect(unknown.result).toMatchObject({
        status: "not-run",
        reason: "refused: candidate-unknown: missing",
        tree: head.digest,
        excerpt: "refused: candidate-unknown: missing",
      })
      expect(unknown.result.uri).toStartWith("review-probe:review_observe/")
      expect(seen.calls[0]).toEqual([{ candidate: "missing", option: "probe:script", result: unknown.result }])
      const denied = yield* ReviewProbe.run({ candidate: "c1", option: "probe:regress", target: {} }, shared)
      expect(denied.result).toMatchObject({
        status: "not-run",
        reason: "refused: option-not-offered: probe:regress",
        tree: head.digest,
        excerpt: "refused: option-not-offered: probe:regress",
      })
      expect(seen.calls).toHaveLength(2)
      expect(seen.calls[1]).toEqual([{ candidate: "c1", option: "probe:regress", result: denied.result }])
      expect(seen.calls[1][0]).not.toBe(seen.calls[0][0])
      expect(ledger.observed).toEqual([seen.calls[0][0], seen.calls[1][0]])
      expect(ledger.runs.size).toBe(0)
      expect(ledger.attempts.size).toBe(0)
    }))
  }), 120_000,
)

confined("a settled script is observed once, a throw is a fail, and a throwing observer still releases the permit", () =>
  Effect.gen(function* () {
    if (!jail) return yield* Effect.fail(new Error("conformance-missing"))
    expectSpawn(import.meta.path)
    const fixture = yield* repo
    yield* Effect.scoped(Effect.gen(function* () {
      const head = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const ledger = ReviewProbe.ledger()
      const seen = watch(ledger)
      const offered = { c1: ["probe:script"], c2: ["probe:script"] }
      const shared: ReviewProbe.Context = {
        reviewID: "review_observe", head, offered, cap: 3, hunks: [], ledger, observe: seen.observe, timeoutSeconds: 60,
      }
      const passed = yield* ReviewProbe.run(script("c1", "console.log('PROBE_OBSERVED')"), shared)
      expect(passed.result.status, passed.artifact.text).toBe("pass")
      expect(passed.result.tree).toBe(head.digest)
      expect(passed.result.uri).toStartWith("review-probe:review_observe/")
      expect(passed.result.excerpt).toContain("PROBE_OBSERVED")
      expect(passed.evidence).toMatchObject({ kind: "probe", option: "probe:script", uri: passed.result.uri })
      expect(seen.calls[0]?.[0].result).toBe(passed.result)
      const failed = yield* ReviewProbe.run(script("c2", "throw new Error('bad-control')"), shared)
      expect(failed.result.status, failed.artifact.text).toBe("fail")
      expect(failed.result.reason).toBeUndefined()
      expect(failed.evidence?.uri).toBe(failed.result.uri)
      expect(failed.result.tree).toBe(head.digest)
      expect(seen.calls[1]?.[0].result).toBe(failed.result)
      const repeat = yield* ReviewProbe.run(script("c1", "console.log('PROBE_OBSERVED')"), shared)
      expect(repeat.result).toMatchObject({
        status: "not-run",
        reason: "refused: repeat: probe:script already ran on c1 at this tree",
        tree: head.digest,
      })
      expect(repeat.result.status).not.toBe("pass")
      expect(repeat.evidence).toBeUndefined()
      expect(ledger.observed.map((item) => item.result.status)).toEqual(["pass", "fail", "not-run"])
      expect(ledger.attempts.get("c1")).toBe(1)
      expect(ledger.attempts.get("c2")).toBe(1)
      expect(seen.calls).toHaveLength(3)
      expect(seen.calls[2]?.[0].result).toBe(repeat.result)

      yield* Effect.promise(async () => {
        await writeFile(path.join(fixture.root, "bunfig.toml"), `[test]\npreload = ["./guard.ts"]\n`)
        await writeFile(path.join(fixture.root, "guard.ts"),
          `if (process.env.CI !== "true" && process.env.ORCHESTRA_LOCAL_TESTS !== "1") { console.error("${ProbeRun.GUARD}; tests run on GitHub Actions."); process.exit(1) }\n`)
      })
      const guardedHead = yield* ReviewScratch.create({ worktree: fixture.root, tree: true })
      const guardLedger = ReviewProbe.ledger()
      const guardSeen = watch(guardLedger)
      const guarded = yield* ReviewProbe.run({
        candidate: "guard", option: "probe:test", target: { test: { file: "src/a.test.ts", name: "limit" } },
      }, {
        reviewID: "review_observe", head: guardedHead, offered: { guard: ["probe:test"] }, cap: 2, hunks: [],
        ledger: guardLedger, observe: guardSeen.observe, timeoutSeconds: 60,
      })
      expect(guarded.result).toMatchObject({ status: "not-run", reason: `repo-guard: ${ProbeRun.GUARD}`, tree: guardedHead.digest })
      expect(guarded.evidence).toBeUndefined()
      expect(guardSeen.calls, "observer was not called with the settled attempt").toEqual([
        [{ candidate: "guard", option: "probe:test", result: guarded.result }],
      ])

      const blowLedger = ReviewProbe.ledger()
      const blow = watch(blowLedger, "c3")
      const exit = yield* ReviewProbe.run(script("c3", "console.log('PROBE_OBSERVED')"), {
        reviewID: "review_observe", head, offered: { c3: ["probe:script"] }, cap: 2, hunks: [],
        ledger: blowLedger, observe: blow.observe, timeoutSeconds: 60, queueSeconds: 15,
      }).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      expect(blow.calls, "observer was not called with the settled attempt").toHaveLength(1)
      expect(blow.calls[0]?.[0].result).toBe(blowLedger.observed[0]?.result)
      expect(blowLedger.observed[0]?.result.status).toBe("pass")
      const released = ReviewProbe.ledger()
      const releasedSeen = watch(released)
      const next = yield* ReviewProbe.run(script("c4", "console.log('PROBE_OBSERVED')"), {
        reviewID: "review_observe", head, offered: { c4: ["probe:script"] }, cap: 2, hunks: [],
        ledger: released, observe: releasedSeen.observe, timeoutSeconds: 60, queueSeconds: 15,
      })
      expect(next.result.status, next.result.reason ?? next.artifact.text).toBe("pass")
      expect(next.result.reason).not.toBe("busy")
      expect(releasedSeen.calls[0]?.[0].result).toBe(next.result)
    }))
  }), 180_000,
)
