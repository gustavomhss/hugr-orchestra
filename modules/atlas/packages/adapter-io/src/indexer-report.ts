// @atlas/adapter-io — src/indexer-report.ts  (the `atlas doctor index` diagnosis: which indexer THIS repo needs)
//
// THE HOLE THIS CLOSES. `axes.edges` is derived from SCIP occurrences and from nothing else, so a repository
// with no `.atlas/index.scip` has zero edges ⇒ zero structural seeds ⇒ `atlas mine` visits ZERO sites. That
// was true of every real repository, including this one, because Atlas consumed a `.scip` index it neither
// produced nor told anyone how to produce: `planIndexers` — the whole dispatch — had ZERO production callers
// and existed only for its own test. This module is the production caller, and the reason `doctor` is where
// it lands is that `doctor` is already the surface a user reaches for when a command returned nothing.
//
// ATLAS PLANS, THE OPERATOR RUNS. Nothing here spawns a process. Shelling an external binary over the
// repository is the same class as the model-command path, where the rule is that Atlas names no vendor
// command of its own and runs only what the operator explicitly configured; and the `$0`-LLM,
// operator-owns-the-environment claim is truer when the SCIP dependency is VISIBLE than when it is hidden
// behind an automatic invocation that fails opaquely the moment the binary is absent. So the output of this
// module is a PLAN plus the state of the dump, and every command in it is a string.

import { join } from "node:path"
import type { FileTree } from "@atlas/index"
import { walkFileTree } from "./fs.js"
import { HONEST_HOLE, SCIP_INDEX_REL, planIndexers, readScip } from "./scip.js"
import type { IndexerPlan, LangId } from "./scip.js"

/**
 * File extension → the `LangId` whose indexer owns it. DERIVED FROM WHAT THE CONFIGURED TOOLS ACTUALLY
 * INDEX, not from a wish-list: the JavaScript family maps to `ts` because `scip-typescript` is the binary
 * that indexes it (one program, one dump), and no extension maps to a language `LangId` does not already
 * name. An extension absent from this table is simply not a language Atlas has an opinion about — it is
 * NOT reported as a hole, because "Atlas has no indexer for Ruby" and "that file is a PNG" are different
 * statements and only the first is a diagnosis.
 */
const EXT_LANG: Readonly<Record<string, LangId>> = {
  ts: "ts",
  tsx: "ts",
  mts: "ts",
  cts: "ts",
  js: "ts",
  jsx: "ts",
  mjs: "ts",
  cjs: "ts",
  py: "py",
  pyi: "py",
  go: "go",
  java: "java",
  rs: "rust",
  rb: "rb",
}

/** The state of the dump the readers open. Three CASES, because a user staring at `0 sites` needs to tell
 *  "there is no index" from "there is an index and it is unreadable" from "there is an index and it is
 *  simply small". `readScipOrEmpty` deliberately folds the first two together (it degrades, never throws);
 *  a DIAGNOSTIC must not, so this reads through the throwing `readScip` and keeps the reason. */
export type ScipState =
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable"; readonly reason: string }
  | { readonly kind: "present"; readonly documents: number }

/** One language actually present in the repository, with the plan that covers it. `files` is the count of
 *  git-TRACKED files carrying one of that language's extensions (the same tracked set the index is built
 *  from — an ignored or untracked file is in neither). */
export interface PlannedLang {
  readonly plan: IndexerPlan
  readonly files: number
}

/** What `atlas doctor index` reports for one repository. Pure data — the CLI owns every rendered byte. */
export interface IndexPlanReport {
  /** Repo-relative path of the ONE dump every reader opens (`SCIP_INDEX_REL`). */
  readonly scipRel: string
  readonly scip: ScipState
  /** Languages present WITH a configured indexer, ascending by `LangId` (deterministic). */
  readonly configured: readonly PlannedLang[]
  /** Languages present with NO configured indexer — the `honest-hole` set. Their files are in the
   *  `FileTree` and they contribute NO edges; naming them is the whole point, because "Atlas has no
   *  indexer for this language" and "Atlas found nothing here" are indistinguishable without it. */
  readonly holes: readonly PlannedLang[]
}

/** The lower-cased final extension of a repo-relative path, or `''` (a dotfile / no dot in the basename). */
function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1)
  const dot = base.lastIndexOf(".")
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ""
}

/** Tally tracked FILE leaves by language over the walked tree. A `FileTree` file is a leaf carrying
 *  `content`; directory nodes carry `children` and no content, so the two can never be confused. */
function tallyLangs(tree: FileTree, into: Map<LangId, number> = new Map()): Map<LangId, number> {
  if (tree.content !== undefined) {
    const lang = EXT_LANG[extensionOf(tree.path)]
    if (lang !== undefined) into.set(lang, (into.get(lang) ?? 0) + 1)
  }
  for (const child of tree.children) tallyLangs(child, into)
  return into
}

/** The dump's state at `scipPath`. TOTAL — a missing file, a device/FIFO symlink (`scip.ts` `scipBytes`
 *  refuses those BEFORE reading, since the read would never return) and a corrupt protobuf all land as a
 *  reported state, never a throw: a diagnostic that crashes on the thing it is diagnosing is not one. */
function scipState(scipPath: string): ScipState {
  try {
    return { kind: "present", documents: readScip(scipPath).documents.length }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    return /ENOENT/.test(reason) ? { kind: "absent" } : { kind: "unreadable", reason }
  }
}

/**
 * Diagnose the SCIP indexing of the repository at `repoPath` (`atlas doctor index`). READ-ONLY and
 * process-free: it walks the git-tracked tree, routes the languages it finds through the REAL
 * {@link planIndexers} dispatch — never a second copy of it — and reads the dump if there is one.
 *
 * The languages are DERIVED, never asked for: the user whose `mine` returned 0 sites does not know which
 * `LangId` Atlas thinks their repository is, and asking them would make the answer their guess rather than
 * a measurement. Ascending `LangId` order keeps two runs on one tree byte-identical.
 */
export function reportIndexPlan(repoPath: string): IndexPlanReport {
  const counts = tallyLangs(walkFileTree(repoPath))
  const langs = [...counts.keys()].sort()
  const present = planIndexers(langs).map((plan) => ({ plan, files: counts.get(plan.lang) ?? 0 }))
  return {
    scipRel: SCIP_INDEX_REL,
    scip: scipState(join(repoPath, SCIP_INDEX_REL)),
    configured: present.filter((p) => p.plan.tool !== HONEST_HOLE),
    holes: present.filter((p) => p.plan.tool === HONEST_HOLE),
  }
}
