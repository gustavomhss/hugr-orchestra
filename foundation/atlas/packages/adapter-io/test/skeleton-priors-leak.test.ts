// @atlas/adapter-io — test/skeleton-priors-leak.test.ts  (#197 — the #182 ordering priors are a per-fold view)
//
// `createSkeletonSource` keeps ONE instance-lived, path-keyed `priors` map that `unitPrior(qualifiedPath)`
// reads. `workingTreeAxes` populates it from the current fold. Before the #197 fix it was `.set()`-only —
// never cleared — so a `(repo, rev)` folded EARLIER on the same source instance leaked its priors at any path
// a LATER fold did not re-state: `unitPrior(pathX)` returned a prior from a DIFFERENT tree that has no such
// unit. On the shipped path this is dormant (`atlas mine` builds one source per process for one (repo, HEAD)
// — mine.ts), but the cache is meant to be a per-fold view, not an accumulator across folds.
//
// This drives the leak GIT-FREE by injecting `walkFileTree`: one source instance folds repo A then repo B
// (both on the HEAD/working-tree leg, distinct memo keys), whose folds produce DISJOINT prior key sets. After
// folding B, none of A's prior keys may still be readable through `unitPrior`. Removing the `priors.clear()`
// turns the leak assertion RED (see the mutation note).

import { describe, it, expect } from "vitest"
import type { FileTree, ScipOutput } from "@atlas/index"
import { createSkeletonSource } from "../src/skeleton-source.js"
import { foldAstUnitsWithPriors, initAst } from "../src/ast.js"
import { beforeAll } from "vitest"

beforeAll(async () => {
  await initAst()
}, 60_000)

// Each file holds a function with a NESTED arrow — the shape that yields #182 sub-unit ordering priors.
const FILE_A = [
  "export function alpha(name: string): string {",
  "  const inner = (s: string): string => s.toUpperCase();",
  "  return inner(name);",
  "}",
  "",
].join("\n")
const FILE_B = [
  "export function beta(name: string): string {",
  "  const helper = (s: string): string => s.trim();",
  "  return helper(name);",
  "}",
  "",
].join("\n")

const treeFor = (relPath: string, content: string): FileTree => ({
  path: ".",
  children: [{ path: "src", children: [{ path: relPath, children: [], content }] }],
})

const TREE_A = treeFor("src/aaa.ts", FILE_A)
const TREE_B = treeFor("src/bbb.ts", FILE_B)
const NO_SCIP: ScipOutput = { documents: [] }

// A walk that returns a DIFFERENT tree per repo path — the two working-tree repos one instance can be asked for.
const walkFor = (repoPath: string): FileTree => (repoPath === "repoA" ? TREE_A : TREE_B)

describe("#197 — createSkeletonSource priors are a per-fold view, not an accumulator across folds", () => {
  it("folding repo B after repo A on ONE instance does not leak A`s priors through unitPrior", () => {
    // Enumerate the prior keys each tree's fold produces, so the assertions name real keys (not guesses).
    const aKeys = [...foldAstUnitsWithPriors(TREE_A).priors.keys()]
    const bKeys = [...foldAstUnitsWithPriors(TREE_B).priors.keys()]
    expect(aKeys.length).toBeGreaterThan(0) // NOT VACUOUS: the fold must actually produce priors
    expect(bKeys.length).toBeGreaterThan(0)
    expect(aKeys.some((k) => bKeys.includes(k))).toBe(false) // disjoint key sets ⇒ a leak is observable

    const source = createSkeletonSource("unused", { walkFileTree: walkFor, readScip: () => NO_SCIP })
    source.skeleton("repoA", "HEAD") // fold A ⇒ priors hold A's keys
    source.skeleton("repoB", "HEAD") // fold B ⇒ #197 fix RESETS to B's keys only

    // B's priors are readable (the fold still works — this is the fix not being a blunt wipe).
    for (const k of bKeys) expect(source.unitPrior(k)).toBeDefined()
    // A's priors are GONE — none leaks through. ⚑ Deleting `priors.clear()` (skeleton-source.ts) makes at
    // least one of these read A's stale prior instead of undefined, turning this RED.
    for (const k of aKeys) expect(source.unitPrior(k)).toBeUndefined()
  })
})
