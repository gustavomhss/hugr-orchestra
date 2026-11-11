export * as ReviewJscpdAnalyze from "./jscpd-analyze"

import os from "node:os"
import path from "node:path"
import { mkdir, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises"
import { Effect } from "effect"
import { ReviewPackJscpd } from "./packs/jscpd"
import { ReviewNativeFiles } from "./native-files"
import { ReviewSarif } from "./sarif"
import type { ReviewAnalyze } from "./analyze"
import type { ResearchProcess } from "../research-toolkit/process"

// Head and base are both scanned. ReviewNoise owns base-identity and changed-line filtering.
// A missing side is never clean and never contributes candidates. The host cwd is outside the copy.

const CAP = 4 * 1024 * 1024
const SCAN_MS = 5 * 60_000
type Confine<R> = (input: Parameters<ReviewAnalyze.Confine>[0]) => Effect.Effect<{ outcome: ResearchProcess.Outcome } | { denied: string }, never, R>

export const run = Effect.fnUntraced(function* <R>(
  pack: ReviewAnalyze.Pack,
  context: ReviewAnalyze.RunContext,
  confine: Confine<R>,
  lookup: ReviewSarif.Lookup,
) {
  if (pack.output.format !== "sarif" || pack.template !== ReviewPackJscpd.templateId)
    return finished(pack, "not-run", `template unknown: ${pack.template}`)
  if (inactive(pack, context.catalog)) return finished(pack, "not-run", "no-active-rules")
  const headCopy = yield* context.head
  const baseCopy = yield* context.base
  if ("failed" in headCopy) return finished(pack, "not-run", headCopy.failed)
  if ("failed" in baseCopy) return finished(pack, "not-run", `base: ${baseCopy.failed}`)
  const located = yield* ReviewPackJscpd.locate()
  if ("absent" in located) return finished(pack, "not-run", located.absent === "jscpd unsupported: native-runtime-unqualified" ? "native-runtime-unqualified" : located.absent)
  const head = yield* scan(located.executable, headCopy.snapshot.root, "head", context.write, confine)
  if (head.status !== "ok") return finished(pack, head.status, head.reason, head.uri)
  const base = yield* scan(located.executable, baseCopy.snapshot.root, "base", context.write, confine)
  if (base.status !== "ok") return finished(pack, base.status, `base: ${base.reason}`, base.uri)
  const onChanged = (file: string, line: number, endLine?: number) =>
    (context.input.changed[file] ?? []).some((range) => line <= range.end && (endLine ?? line) >= range.start)
  const headPage = ReviewSarif.bind(head.results, lookup, onChanged)
  if ("failed" in headPage) return finished(pack, "acquisition-error", headPage.failed, head.uri)
  if (headPage.excluded.length) return finished(pack, "acquisition-error", "unknown-rule", head.uri)
  const basePage = ReviewSarif.bind(base.results, lookup)
  if ("failed" in basePage) return finished(pack, "acquisition-error", `base: ${basePage.failed}`, base.uri)
  if (basePage.excluded.length) return finished(pack, "acquisition-error", "base: unknown-rule", base.uri)
  return {
    checks: [{
      id: pack.id,
      pack: pack.id,
      version: pack.version,
      lane: pack.lane,
      status: head.results.length ? "fail" : "pass",
      workspaceExecuted: pack.lane !== "no-build",
      uri: head.uri,
    }],
    head: headPage.items,
    base: basePage.items,
  } satisfies ReviewAnalyze.Outcome
})

function scan<R>(
  executable: string,
  copy: string,
  side: "head" | "base",
  write: ReviewAnalyze.RunContext["write"],
  confine: Confine<R>,
) {
  return Effect.scoped(Effect.gen(function* () {
    const resolved = yield* Effect.tryPromise({ try: () => realpath(copy), catch: () => "host-context-invalid" }).pipe(
      Effect.map((root) => ({ root })),
      Effect.catch((reason) => Effect.succeed({ failed: reason })),
    )
    if ("failed" in resolved) return stopped("acquisition-error", resolved.failed)
    const made = yield* Effect.acquireRelease(
      Effect.tryPromise({ try: () => mkdtemp(path.join(os.tmpdir(), "jscpd-")), catch: () => "host-cwd-failed" }),
      (dir) => Effect.promise(() => rm(dir, { recursive: true, force: true })),
    ).pipe(Effect.map((dir) => ({ dir })), Effect.catch(() => Effect.succeed({ failed: "host-cwd-failed" as const })))
    if ("failed" in made) return stopped("acquisition-error", made.failed)
    const physical = yield* Effect.tryPromise({ try: () => realpath(made.dir), catch: () => "host-cwd-failed" }).pipe(
      Effect.map((root) => ({ root })),
      Effect.catch((reason) => Effect.succeed({ failed: reason })),
    )
    if ("failed" in physical) return stopped("acquisition-error", physical.failed)
    const home = physical.root
    if (!separated(resolved.root, home)) return stopped("acquisition-error", "host-cwd-inside-copy")
    const output = path.join(home, "out")
    const created = yield* Effect.tryPromise({ try: () => mkdir(output), catch: () => "host-cwd-failed" }).pipe(
      Effect.as({ ok: true as const }),
      Effect.catch((reason) => Effect.succeed({ failed: reason })),
    )
    if ("failed" in created) return stopped("acquisition-error", created.failed)
    const command = ReviewPackJscpd.argv(executable, resolved.root, output)
    const ran = yield* confine({
      argv: command,
      cwd: home,
      write: [output],
      env: ReviewPackJscpd.environment(home),
      timeoutMs: SCAN_MS,
      maxBytes: CAP,
    })
    if ("denied" in ran) return stopped("not-run", ran.denied)
    const log = yield* write(`raw/jscpd-${side}.log`, [
      `$ ${command.join(" ")}`,
      "stdout:",
      ran.outcome.stdout.data.toString("utf8"),
      "stderr:",
      ran.outcome.stderr.data.toString("utf8"),
    ].join("\n"))
    const report = yield* Effect.promise(() => readReport(path.join(output, ReviewPackJscpd.reportName)))
    const text = "text" in report ? report.text : ""
    const uri = text ? yield* write(`raw/jscpd-${side}.sarif`, text) : log
    const settled = ReviewPackJscpd.settle(ran.outcome, text, resolved.root)
    if (settled.status !== "ok") return stopped(settled.status, unread(settled.reason, report), uri)
    return { status: "ok" as const, results: settled.results, uri }
  }))
}

function inactive(pack: ReviewAnalyze.Pack, catalog: ReviewAnalyze.RunContext["catalog"]) {
  if (pack.status === "dropped") return true
  const rules = catalog.rules.filter((rule) => rule.pack === pack.id)
  if (rules.some((rule) => rule.rule === ReviewPackJscpd.RULE && rule.status === "dropped")) return true
  if (rules.some((rule) => rule.rule === "*" && rule.status === "dropped")) return true
  return false
}

function separated(root: string, home: string) {
  const flavor = ReviewNativeFiles.flavor(root)
  const fromRoot = flavor.relative(flavor.resolve(root), flavor.resolve(home))
  const fromHome = flavor.relative(flavor.resolve(home), flavor.resolve(root))
  return escapes(fromRoot, flavor) && escapes(fromHome, flavor)
}

function escapes(value: string, flavor: ReturnType<typeof ReviewNativeFiles.flavor>) {
  return value === ".." || value.startsWith(`..${flavor.sep}`) || flavor.isAbsolute(value)
}

async function readReport(file: string): Promise<{ text: string } | { reason: string }> {
  const info = await stat(file).catch(() => undefined)
  if (!info) return { reason: "missing-report" }
  if (!info.isFile() || info.size > CAP) return { reason: "too-large" }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(await readFile(file)) }
  } catch {
    return { reason: "unreadable-report" }
  }
}

function unread(settled: string, report: { text: string } | { reason: string }) {
  if (settled !== "missing-report" || "text" in report) return settled
  if (report.reason === "too-large") return "output cap"
  return report.reason
}

function stopped(status: "not-run" | "acquisition-error", reason: string, uri?: string) {
  return { status, reason, ...(uri === undefined ? {} : { uri }) }
}

function finished(pack: ReviewAnalyze.Pack, status: ReviewAnalyze.Status, reason?: string, uri?: string): ReviewAnalyze.Outcome {
  return {
    checks: [{
      id: pack.id,
      pack: pack.id,
      version: pack.version,
      lane: pack.lane,
      status,
      ...(reason === undefined ? {} : { reason }),
      workspaceExecuted: pack.lane !== "no-build",
      ...(uri === undefined ? {} : { uri }),
    }],
    head: [],
    base: [],
  }
}
