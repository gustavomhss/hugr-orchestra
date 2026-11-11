import { expect, test } from "bun:test"
import { Effect, type Scope } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { BackendToolkit } from "../../src/backend-toolkit"
import { ReviewCatalog } from "../../src/review/catalog"
import { jscpd } from "../../src/review/catalog/jscpd"
import type { ReviewAnalyze } from "../../src/review-toolkit/analyze"
import { ReviewJscpdAnalyze } from "../../src/review-toolkit/jscpd-analyze"
import { ReviewPackJscpd } from "../../src/review-toolkit/packs/jscpd"
import { ReviewSarif } from "../../src/review-toolkit/sarif"

const node = LayerNode.compile(LayerNode.group([AppProcess.node]))
const run = <A, E>(effect: Effect.Effect<A, E, AppProcess.Service | Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect).pipe(Effect.provide(node)))
const ROOT = "/review/root"
const lookup: ReviewSarif.Lookup = (pack, rule) =>
  pack === "jscpd" && rule === ReviewPackJscpd.RULE
    ? { class: "change.duplication", lens: "change", severity: "P3", status: "probation", triage: "candidate" }
    : undefined

test("a dropped rule or an unavailable base does not invoke and never returns clean", async () => {
  let calls = 0
  const confine = () => {
    calls += 1
    return Effect.die("invoked")
  }
  const dropped = await run(ReviewJscpdAnalyze.run(jscpd.pack, context([{ ...jscpd.rules[0], status: "dropped" }]), confine, lookup))
  expect(calls).toBe(0)
  expect(dropped.checks[0]).toMatchObject({ status: "not-run", reason: "no-active-rules", workspaceExecuted: false })
  expect(dropped.head).toEqual([])
  expect(dropped.base).toEqual([])
  const packDropped = await run(ReviewJscpdAnalyze.run({ ...jscpd.pack, status: "dropped" }, context(jscpd.rules), confine, lookup))
  expect(calls).toBe(0)
  expect(packDropped.checks[0].reason).toBe("no-active-rules")
  const missingBase = await run(ReviewJscpdAnalyze.run(jscpd.pack, context(jscpd.rules, { failed: "scratch: base-missing" }), confine, lookup))
  expect(calls).toBe(0)
  expect(missingBase.checks[0]).toMatchObject({ status: "not-run", reason: "base: scratch: base-missing" })
  expect(missingBase.checks[0].status).not.toBe("pass")
  expect(missingBase.head).toEqual([])
})

test("an unqualified or absent runtime is named and does not fetch", async () => {
  const copied = context(jscpd.rules)
  const check = await run(ReviewJscpdAnalyze.run(jscpd.pack, { ...copied, base: copied.head }, () => Effect.die("invoked"), lookup).pipe(
    Effect.provideService(BackendToolkit.Target, { unsupported: "libc-musl" }),
  ))
  expect(check.checks[0]).toMatchObject({ status: "not-run", reason: "native-runtime-unqualified", workspaceExecuted: false })
  expect(check.head).toEqual([])
  if (process.platform !== "linux" || process.arch !== "x64") {
    expect(await Effect.runPromise(ReviewPackJscpd.locate())).toEqual({ absent: "jscpd unsupported: native-runtime-unqualified" })
    return
  }
  const unqualified = await Effect.runPromise(ReviewPackJscpd.locate().pipe(
    Effect.provideService(BackendToolkit.Target, { target: "darwin-arm64" }),
  ))
  expect(unqualified).toEqual({ absent: "jscpd unsupported: native-runtime-unqualified" })
  const unsupported = await Effect.runPromise(ReviewPackJscpd.locate().pipe(
    Effect.provideService(BackendToolkit.Target, { unsupported: "libc-musl" }),
  ))
  expect(unsupported).toEqual({ absent: "jscpd unsupported: native-runtime-unqualified" })
  const absent = await Effect.runPromise(ReviewPackJscpd.locate().pipe(
    Effect.provideService(BackendToolkit.Target, { target: "linux-x64" }),
    Effect.provideService(BackendToolkit.Root, "/review/jscpd-absent-root"),
  ))
  expect(absent).toEqual({ absent: "jscpd absent" })
})

function context(rules: ReviewCatalog.Catalog["rules"], base: ReviewAnalyze.Copy = { failed: "unused" }): ReviewAnalyze.RunContext {
  return {
    catalog: { ...ReviewCatalog.current, rules },
    input: { worktree: ROOT, base: "base", tier: "standard", store: "/review/artifacts", trusted: false, lane: "no-build", packs: ["jscpd"], scope: "diff", changed: { "a.js": [{ start: 4, end: 4 }] } },
    write: () => Effect.die("write"),
    head: Effect.succeed({ snapshot: { root: ROOT, origin: ROOT, kind: "commit" as const, revision: "fixture", files: 2, dependencyRoots: [], scratch: "/review", digest: "fixture" } }),
    base: Effect.succeed(base),
  }
}
