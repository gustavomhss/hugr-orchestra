// @atlas/cli — src/doctor-index.ts  (the `atlas doctor index` payload renderer)
//
// The fifth doctor leg's bytes. It is a SEPARATE module from `doctor.ts` because it is a separate KIND of
// leg: the other four read the injected `DoctorSource` (the durable store); this one reads the file tree and
// the dump, and touches the `DoctorApi` not at all. Keeping it here leaves the frozen `DoctorApi` — four
// read legs, no more — exactly as it was, and leaves this file free to grow the prose the diagnosis needs.
//
// PURE: an `IndexPlanReport` in, a deterministic block of lines out. No fs, no spawn, no clock.

import type { IndexPlanReport, PlannedLang, ScipState } from "@atlas/adapter-io"

/** The follow-up for THIS leg. Deliberately not `DOCTOR_GUIDANCE.next` (which points at `atlas-emit`, the
 *  persist door for a `RegroundPlan`): there is no plan to persist here, and the honest next step is that
 *  the operator runs the printed command themselves. Atlas does not run it — see the module header of
 *  `adapter-io/src/indexer-report.ts` for why that is a decision and not an omission. */
export const INDEX_NEXT =
  "Atlas does NOT run indexers — run the command(s) above yourself from the repository root, then re-run atlas mine"

/** The dump's line. Names the CONSEQUENCE, not just the state: a reader who is here because `mine` visited
 *  0 sites needs the sentence that connects "no dump" to "no edges", once, in the place they are looking. */
function scipLine(scip: ScipState, rel: string): string {
  switch (scip.kind) {
    case "present":
      return `scip: present at ${rel} — ${scip.documents} indexed document(s)`
    case "unreadable":
      return `scip: UNREADABLE at ${rel} — ${scip.reason}; the readers degrade to a files-only index (0 edges)`
    case "absent":
      return (
        `scip: ABSENT at ${rel} — axes.edges is derived from SCIP occurrences and nothing else, so this ` +
        "repository has 0 edges, 0 structural seeds and `atlas mine` visits 0 sites"
      )
  }
}

/** One configured language: what is present, which pinned binary covers it, how to check the installed one,
 *  and the command to run. Three lines because they are three different acts. */
function configuredLines(p: PlannedLang): string[] {
  const { lang, tool, version, args } = p.plan
  return [
    `lang: ${lang} — ${p.files} tracked file(s) — indexer ${tool}, pinned ${version ?? "unpinned"}`,
    `  verify: ${tool} --version    # must print ${version ?? "the pinned release"}`,
    `  run:    ${tool} ${args.join(" ")}`,
  ]
}

/** One honest hole, NAMED. Without this line "Atlas has no indexer for this language" and "Atlas found
 *  nothing in this language" render identically — which is the confusion the sentinel exists to prevent. */
function holeLine(p: PlannedLang): string {
  return (
    `lang: ${p.plan.lang} — ${p.files} tracked file(s) — ${p.plan.tool}: NO indexer is configured for this ` +
    "language. Its files are in the FileTree; it contributes NO edges, and nothing you install changes that"
  )
}

/**
 * The `doctor index` payload block. Reports, for the repository the command ran in: the state of the one
 * dump, every language actually present with its pinned indexer and copy-pasteable command, and every
 * language that is an honest hole.
 *
 * THE CLOBBER NOTE is not decoration. `planIndexers` is per-language and `mergeScip` exists to fold their
 * outputs, but NO shipped path calls it: `compose.ts`, `wire.ts` and `skeleton-source.ts` each read exactly
 * ONE dump at `.atlas/index.scip`. So in a repository spanning two indexed languages the second command
 * overwrites the first, and the honest place to say so is next to the two commands being printed.
 */
export function renderIndexPlan(r: IndexPlanReport): string {
  const lines = [scipLine(r.scip, r.scipRel)]
  for (const p of r.configured) lines.push(...configuredLines(p))
  for (const p of r.holes) lines.push(holeLine(p))
  if (r.configured.length === 0 && r.holes.length === 0) {
    lines.push("lang: none — no tracked file in this repository is in a language Atlas has an indexer for")
  }
  if (r.configured.length > 1) {
    lines.push(
      `note: Atlas reads exactly ONE dump (${r.scipRel}), so the second command above OVERWRITES the first — ` +
        "no shipped path merges per-language dumps (mergeScip has no production caller)",
    )
  }
  return lines.join("\n")
}
