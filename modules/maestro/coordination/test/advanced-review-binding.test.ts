import { expect, test } from "bun:test"
import path from "path"
import { mkdir, rm, writeFile } from "fs/promises"
import { Effect, Schema } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { SessionSchema } from "@orchestra/core/session/schema"
import { AppProcess } from "@orchestra/core/process"
import { ReviewProbe } from "@orchestra/core/review-toolkit/probe"
import { ReviewScratch } from "@orchestra/core/review-toolkit/scratch-copy"
import { expectSpawn } from "../../../../packages/core/test/fixture/omni-expect"
import { git } from "../../../../packages/core/test/fixture/git"
import { tmpdir } from "../../../../packages/core/test/fixture/tmpdir"
import { jail } from "../../../../packages/core/test/lib/sandbox-host"
import { ReviewBindingV2 } from "../src/v2/tools/review-binding"

const layer = LayerNode.compile(LayerNode.group([AppProcess.node]))
const IDS = ["probe:property", "probe:interleave", "probe:mutants"] as const
const live = jail ? test : test.skip
const RUST = "pub fn add(left: u64, right: u64) -> u64 { left + right }\n"

const repo = () => Effect.acquireRelease(Effect.promise(async () => {
  const dir = await tmpdir()
  const root = path.join(dir.path, "repo")
  await mkdir(path.join(root, "src"), { recursive: true })
  await git(root, "init", "-q")
  await git(root, "config", "user.email", "probe@example.com")
  await git(root, "config", "user.name", "Probe")
  await writeFile(path.join(root, "Cargo.toml"), "[package]\nname = \"probe_fixture\"\nversion = \"0.1.0\"\nedition = \"2021\"\n")
  await writeFile(path.join(root, "src", "lib.rs"), RUST)
  await writeFile(path.join(root, "src", "a.ts"), "export const value = 0\n")
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "base")
  await writeFile(path.join(root, "src", "a.ts"), "export const value = 1\n")
  await git(root, "add", ".")
  await git(root, "commit", "-q", "-m", "head")
  return { dir, root }
}), (made) => Effect.promise(() => rm(made.dir.path, { recursive: true, force: true })))

const pair = (root: string) => Effect.all({
  head: ReviewScratch.create({ worktree: root, revision: "HEAD" }),
  base: ReviewScratch.create({ worktree: root, revision: "HEAD~1" }),
}).pipe(Effect.provide(layer))

live("verifier advanced offers make real copies and missing targets stay named not-run", async () => {
  expectSpawn(import.meta.path)
  const state = { copies: 0 }
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const made = yield* repo()
    for (const id of IDS) {
      const ledger = ReviewProbe.ledger()
      const cached = yield* Effect.cached(Effect.gen(function* () {
        state.copies += 1
        return yield* pair(made.root)
      }))
      const bound = yield* ReviewBindingV2.reviewBinding({
        worktree: made.root, diff: "", cache: id, lenses: [], ledger, copies: cached,
      })({ sessionID: SessionSchema.ID.make(`ses_advanced_${id.slice(6)}`), retained: "review:retained", role: "verifier", offered: { c1: [id] }, cap: 1 })
      if (!bound.probe) throw new Error(`probe missing for ${id}`)
      const input = Schema.decodeUnknownSync(ReviewProbe.Input)({ candidate: "c1", option: id, target: {} }, { onExcessProperty: "error" })
      const out = yield* ReviewProbe.run(input, bound.probe)
      expect(out.result.status).toBe("not-run")
      expect(out.result.reason ?? "").toContain("target-missing")
      expect(out.result.reason ?? "").toContain(id.slice("probe:".length))
      expect(out.result.reason).not.toBe("not-built")
      expect(ledger.observed.some((item) => item.option === id && item.result.uri === out.result.uri)).toBe(true)
    }
  })).pipe(Effect.provide(layer)))
  expect(state.copies).toBe(IDS.length)
})

test("lens advanced offers do not make copies or a probe", async () => {
  const state = { copies: 0 }
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const cached = yield* Effect.cached(Effect.gen(function* () {
      state.copies += 1
      return yield* pair("/no/such-review-tree")
    }))
    const bound = yield* ReviewBindingV2.reviewBinding({
      worktree: "/no/such-review-tree", diff: "", cache: "lens", lenses: [], ledger: ReviewProbe.ledger(), copies: cached,
    })({ sessionID: SessionSchema.ID.make("ses_advanced_lens"), retained: "review:retained", role: "lens", lens: "correctness-logic", offered: { c1: [...IDS] }, cap: 1 })
    expect(bound.probe).toBeUndefined()
    expect("probeUnavailable" in bound).toBe(false)
  })).pipe(Effect.provide(layer)))
  expect(state.copies).toBe(0)
})
