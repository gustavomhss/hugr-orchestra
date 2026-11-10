export * as ReviewZizmorAnalyze from "./zizmor-analyze"

import { Effect } from "effect"
import { Probe } from "../research-toolkit/probe/types"
import { ReviewSarif } from "./sarif"
import { ReviewPackZizmor } from "./packs/zizmor"
import type { ReviewAnalyze } from "./analyze"

/** Native audit runs only against a host-owned workflow projection, never the copied repository's config. */
export const run = Effect.fnUntraced(function* (
  pack: ReviewAnalyze.Pack,
  context: ReviewAnalyze.RunContext,
  hooks: ReviewAnalyze.ZizmorHooks,
) {
  if (pack.output.format !== "sarif" || pack.template !== ReviewPackZizmor.templateId)
    return hooks.only(hooks.check(pack, "not-run", `template unknown: ${pack.template}`))
  const selection = hooks.drops(context.catalog, pack.id, ReviewPackZizmor.RULES)
  if (selection.status !== "ok") return hooks.only(hooks.check(pack, "not-run", selection.reason))
  // The adapter cannot disable one native rule. Partial exclusion stops before locate and before the CLI.
  if (selection.dropped.length) return hooks.only(hooks.check(pack, "not-run", "native-rule-selection-unsupported"))
  const located = yield* ReviewPackZizmor.locate()
  if ("absent" in located) return hooks.only(hooks.check(pack, "not-run", located.absent))
  const scan = (copied: ReviewAnalyze.Copy, side: "head" | "base") => Effect.scoped(Effect.gen(function* () {
    if ("failed" in copied) return { status: "not-run" as const, reason: copied.failed }
    const snapshot = copied.snapshot
    const selected = yield* Effect.tryPromise({
      try: () => hooks.select(snapshot.root, context.input, side),
      catch: (error) => error,
    }).pipe(Effect.uninterruptible, Effect.catch((error) => Effect.succeed({ refused: hooks.unavailable(error) })))
    if ("refused" in selected) return { status: "not-run" as const, reason: selected.refused }
    if (!selected.files.length) {
      if (side === "head") return { status: "not-run" as const, reason: "no-input" }
      const uri = yield* context.write("raw/zizmor-base.sarif", JSON.stringify({ invoked: false, reason: "no-eligible-workflow-input" }))
      return { status: "ok" as const, results: [], uri, emptyBase: true as const }
    }
    const staging = yield* hooks.stage(snapshot.scratch)
    if (typeof staging !== "string") return staging
    const projected = yield* ReviewPackZizmor.prepare({ root: snapshot.root, files: selected.files, scratch: staging }).pipe(
      Effect.catch((error) => Effect.succeed({ status: "not-run" as const, reason: hooks.unavailable(error) })),
    )
    if (projected.status !== "ok") return { status: "not-run" as const, reason: projected.reason }
    const built = ReviewPackZizmor.argv(located.executable, projected)
    if (built.status !== "ok") return { status: "not-run" as const, reason: built.reason }
    const pathMap = yield* context.write(`raw/zizmor-${side}-paths.json`, JSON.stringify({
      version: "zizmor-projection-v1", paths: projected.paths,
    }))
    const ran = yield* hooks.confine({
      argv: built.argv, cwd: projected.root, write: [], env: ReviewPackZizmor.environment(projected.root),
      timeoutMs: hooks.scanMs, maxBytes: Probe.Limits.outputBytes,
    })
    if ("denied" in ran) return { status: "not-run" as const, reason: ran.denied }
    const uri = yield* context.write(`raw/zizmor-${side}.sarif`, ran.outcome.stdout.data)
    const settled = ReviewPackZizmor.settle(ran.outcome, { root: projected.root, paths: projected.paths, rules: ReviewPackZizmor.RULES })
    if (settled.status !== "ok") return { status: settled.status, reason: `${settled.reason}; path map: ${pathMap}`, uri }
    return { status: "ok" as const, results: settled.results, uri, pathMap }
  }))
  const head = yield* scan(yield* context.head, "head")
  if (head.status !== "ok") return hooks.only(hooks.check(pack, head.status, head.reason, "uri" in head ? head.uri : undefined))
  const base = yield* scan(yield* context.base, "base")
  if (base.status !== "ok") return hooks.only(hooks.check(pack, base.status, `base: ${base.reason}`, "uri" in base ? base.uri : undefined))
  const lookup = hooks.lookup(context.catalog)
  const onChanged = (file: string, line: number, endLine?: number) =>
    (context.input.changed[file] ?? []).some((range) => line <= range.end && (endLine ?? line) >= range.start)
  const coverage = [
    "pathMap" in head ? `head path map: ${head.pathMap}` : undefined,
    "pathMap" in base ? `base path map: ${base.pathMap}` : undefined,
    "emptyBase" in base ? "base: no eligible workflow input; no base scanner invocation" : undefined,
  ].filter((entry) => entry !== undefined).join("; ")
  const headPage = ReviewSarif.bind(head.results, lookup, onChanged)
  if ("failed" in headPage) return hooks.only(hooks.check(pack, "acquisition-error", headPage.failed, head.uri))
  const basePage = ReviewSarif.bind(base.results, lookup)
  if ("failed" in basePage) return hooks.only(hooks.check(pack, "acquisition-error", `base: ${basePage.failed}`, "uri" in base ? base.uri : undefined))
  return {
    checks: [hooks.check(pack, head.results.length ? "fail" : "pass", coverage, head.uri)],
    head: headPage.items,
    base: basePage.items,
  } satisfies ReviewAnalyze.Outcome
})
