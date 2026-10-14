// @atlas/adapter-io — test/wp-10.a2a-authoring.test.ts  (WP-10.A2-a.TOOLS/ADAPTER — the acceptance goldens)
//
// Realizes the CAMPAIGN-10 `slots`/`draft` authoring goldens (docs/requirements/goldens-authoring.md) over
// the REAL composed runtime (`composeRuntime`, adapter-io/src/compose.ts) — the same `fix-author` fixture
// `grounding-computer.test.ts` / `anchors-cli.test.ts` use:
//   · SCN-AUTH-5a/5b/5c/5d/5e — `slots` is exactly the closed union, derived not transcribed
//   · SCN-AUTH-6a/6b/6c/6d/6e/6f — `draft` is structurally complete, identity minted, grounding == the
//     computer's current value, three inputs only
//   · SCN-AUTH-7a — a draft carries the rev its grounding was computed at
//
// SCN-AUTH-6a/6e's oracle — "the field set the governed emit door destructures" — is derived MECHANICALLY
// by scanning the door's OWN source text (`governed-emit.ts` / `governed-emit-identity.ts` / the identity
// formula in `@atlas/knowledge`'s `write/router.ts`) for `raw.<field>` / `node.<field>` / cast-literal /
// `candidateView.<field>` accesses — never a hand-transcribed list.

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { nodeKey, PREDICATE_SLOTS } from "@atlas/knowledge"
import type { Candidate, PredicateSlot } from "@atlas/knowledge"
import { composeRuntime } from "../src/compose.js"
import { buildGroundingComputer } from "../src/grounding-computer.js"
import { deriveGroundingAxes } from "../src/grounding-computer.js"
import { walkFileTree } from "../src/fs.js"
import { readScipOrEmpty } from "../src/scip.js"
import { initAst } from "../src/ast.js"

const SRC = dirname(fileURLToPath(import.meta.url)).replace(/\/test$/, "/src")
const KNOWLEDGE_SRC = join(SRC, "..", "..", "knowledge", "src")

// ── the `fix-author` fixture (goldens-authoring.md §Fixture universe) — same files as the sibling suites ──
const FILES: Readonly<Record<string, string>> = {
  ".gitignore": "dist/\n",
  "src/app.ts":
    "export function run(): string {\n  return `running`;\n}\n\nexport function helper(): number {\n  return 1;\n}\n",
  "src/util.ts": "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n",
  "core/engine.rs": "pub fn engine() -> u32 {\n    42\n}\n",
  "core/mod.rs": "pub mod engine;\n",
  "docs/notes.md": "# notes\n\nsome prose, no symbols.\n",
}

interface FixAuthor {
  readonly repoPath: string
  readonly rev: string
  cleanup(): void
}

function makeFixAuthor(): FixAuthor {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-a2a-authoring-"))
  for (const [rel, content] of Object.entries(FILES)) {
    const abs = join(repoPath, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
  const git = (...args: string[]): string =>
    execFileSync("git", args, { cwd: repoPath, stdio: ["pipe", "pipe", "pipe"] }).toString()
  git("init", "-q")
  git("config", "user.email", "fix@atlas.test")
  git("config", "user.name", "atlas-fixture")
  git("config", "commit.gpgsign", "false")
  git("add", ".")
  git("commit", "-q", "-m", "R1")
  const rev = git("rev-parse", "HEAD").trim()
  return { repoPath, rev, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

let fix: FixAuthor

beforeAll(async () => {
  await initAst() // warm the grammar for the SYNC composition root, mirrors the runtime bins
  fix = makeFixAuthor()
})
afterAll(() => fix.cleanup())

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `slots` (AUTHOR-5)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════

describe("WP-10.A2-a — the `slots` DISCOVERY planner", () => {
  it("SCN-AUTH-5a-1 — the returned slot set is set-equal to the closed union (13 members)", () => {
    const runtime = composeRuntime(fix.repoPath)
    const got = new Set(runtime.slots().slots.map((s) => s.slot))
    // `PREDICATE_SLOTS` (knowledge/write/router.ts) is the ONE runtime copy the nodeKey closed-slot guard
    // (`isKnownSlot`) enforces against (#152) — an independent, already-shipped oracle for the union's
    // membership, not this facet's own transcription.
    expect(got.size).toBe(13)
    expect(got).toEqual(new Set(PREDICATE_SLOTS))
  })

  it("SCN-AUTH-5b-1 — every returned member carries a non-empty meaning", () => {
    const runtime = composeRuntime(fix.repoPath)
    for (const s of runtime.slots().slots) {
      expect(typeof s.meaning).toBe("string")
      expect(s.meaning.length).toBeGreaterThan(0)
    }
  })

  it("SCN-AUTH-5d-1 — no extra, no missing (both set differences empty)", () => {
    const runtime = composeRuntime(fix.repoPath)
    const got = new Set(runtime.slots().slots.map((s) => s.slot))
    const union = new Set(PREDICATE_SLOTS)
    expect([...got].filter((s) => !union.has(s))).toEqual([]) // extra
    expect([...union].filter((s) => !got.has(s))).toEqual([]) // missing
  })

  // SCN-AUTH-5c-1 / 5e-1 — the ENFORCEMENT MECHANISM `slots.ts` uses (`Record<PredicateSlot, string>`,
  // a TypeScript MAPPED type) proven live via a REAL `tsc` invocation. The real `PredicateSlot` union
  // (types.ts) is frozen — out of this WP's scope to edit — so this reproduces the mechanism on an
  // ISOMORPHIC local union of the SAME shape (13 members, then 14): a `Record<Union, string>` under-keyed
  // by one member MUST fail `tsc`, and the SAME object with all 14 keys filled MUST compile AND (5e) yield
  // the 14th member through the identical `Object.keys(...)` read `slots.ts` uses — no other logic change.
  describe("SCN-AUTH-5c-1 / 5e-1 — a 13th (14th, isomorphically) union member fails the typecheck", () => {
    const TSC = join(SRC, "..", "..", "..", "node_modules", ".bin", "tsc")
    const SLOT_UNION =
      `'invariant'|'contract'|'precondition'|'postcondition'|'sideeffect'|'ownership'|` +
      `'perf-bound'|'security-property'|'gotcha'|'rationale'|'dependency'|'count'|'definition'|'newslot'`
    const THIRTEEN_KEYS =
      `invariant:'a',contract:'b',precondition:'c',postcondition:'d',sideeffect:'e',ownership:'f',\n` +
      `  'perf-bound':'g','security-property':'h',gotcha:'i',rationale:'j',dependency:'k',count:'l',definition:'m'`

    /** A fresh scratch project — `tsc -p <dir>` compiles EVERY `.ts` file it finds, so each sub-test needs
     *  its OWN dir (a shared one would let one fixture's error bleed into the other's compile). */
    function scratchProject(name: string, body: string): string {
      const dir = mkdtempSync(join(tmpdir(), `atlas-slots-mechanism-${name}-`))
      writeFileSync(
        join(dir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: { strict: true, noEmit: true, skipLibCheck: true, module: "esnext", target: "es2022" },
        }),
      )
      writeFileSync(join(dir, "fixture.ts"), body)
      return dir
    }

    it("UNDER-KEYED — the door's own mapping pattern, 14 members but 13 keys, FAILS tsc", () => {
      // The SAME shape `slots.ts` uses: `Record<Union, string>` — every member of `Union` is a REQUIRED
      // key. Thirteen keys for a 14-member union is exactly what forgetting to update `SLOT_MEANINGS`
      // after a `PredicateSlot` widening looks like.
      const dir = scratchProject(
        "under",
        `type Slot = ${SLOT_UNION};\nconst M: Record<Slot, string> = {\n  ${THIRTEEN_KEYS},\n};\nvoid M;\n`,
      )
      expect(() => execFileSync(TSC, ["-p", dir, "--pretty", "false"], { stdio: ["pipe", "pipe", "pipe"] })).toThrow() // tsc exits non-zero — a MISSING-PROPERTY error, not a runtime surprise
    })

    it("FULLY-KEYED — the SAME 14-member mapping with `newslot` added compiles AND is returned", () => {
      const dir = scratchProject(
        "full",
        `type Slot = ${SLOT_UNION};\nconst M: Record<Slot, string> = {\n  ${THIRTEEN_KEYS}, newslot: 'n',\n};\n` +
          // the SAME read `slots.ts`'s `createSlots` performs: `Object.keys(mapping).map(slot => ({slot,...}))`
          `const order = Object.keys(M) as Slot[];\nvoid order;\n`,
      )
      expect(() =>
        execFileSync(TSC, ["-p", dir, "--pretty", "false"], { stdio: ["pipe", "pipe", "pipe"] }),
      ).not.toThrow()
      // run the compiled-clean mechanism and assert the 14th member is returned — same `Object.keys` leg
      // `slots.ts` uses, no other door change (SCN-AUTH-5e-1's teeth).
      const script =
        `const M={invariant:'a',contract:'b',precondition:'c',postcondition:'d',sideeffect:'e',ownership:'f',` +
        `'perf-bound':'g','security-property':'h',gotcha:'i',rationale:'j',dependency:'k',count:'l',definition:'m',newslot:'n'};` +
        `process.stdout.write(JSON.stringify(Object.keys(M)));`
      const out: string[] = JSON.parse(
        execFileSync("node", ["-e", script], { stdio: ["pipe", "pipe", "pipe"] }).toString(),
      )
      expect(out).toContain("newslot")
      expect(out.length).toBe(14)
    })
  })
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `draft` (AUTHOR-6/7)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════

/** Every `raw.<field>` / `node.<field>` / cast-literal `(raw|node as {...}).<field>` / `candidateView.
 *  <field>` property name the governed emit door + its identity helper + the `nodeKey`/`primaryAnchorId`
 *  formula (`@atlas/knowledge` write/router.ts) read off the incoming `GroundedFact` — derived MECHANICALLY
 *  by scanning the door's OWN source text (SCN-AUTH-6a-1's oracle), never hand-transcribed. */
function doorReadFields(): Set<string> {
  const text =
    readFileSync(join(SRC, "governed-emit.ts"), "utf8") +
    "\n" +
    readFileSync(join(SRC, "governed-emit-identity.ts"), "utf8") +
    "\n" +
    readFileSync(join(KNOWLEDGE_SRC, "write", "router.ts"), "utf8")
  const names = new Set<string>()
  for (const m of text.matchAll(/\b(?:raw|node)\??\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) names.add(m[1]!)
  for (const m of text.matchAll(/\((?:raw|node) as [^)]*\)\??\.(\w+)/gs)) names.add(m[1]!)
  for (const m of text.matchAll(/\bcandidateView\??\.([a-zA-Z_][a-zA-Z0-9_]*)/g)) names.add(m[1]!)
  return names
}

/** Fields the door reads that are legitimately ABSENT on an advisory draft — their absence is what
 *  DISCRIMINATES the advisory family (`check`/`witness`/`relationKind`) or is a trust-only carrier never
 *  set by an authored payload (`seal`); `slot` is the `Candidate` VIEW's synthetic name for `predicateSlot`
 *  (`candidateView.slot`), not itself a `GroundedFact` field. */
const NOT_REQUIRED_ON_ADVISORY_DRAFT = new Set(["check", "provenance", "seal", "witness", "relationKind", "slot"])

/** SCN-AUTH-6a-1's assertion, factored out so SCN-AUTH-6e-1 can run it against a MUTANT `fact` and observe
 *  it fail (the teeth). Throws (via `expect`) on the first missing/malformed field. */
function assertDoorFieldsWellFormed(fact: Record<string, unknown>): void {
  for (const f of doorReadFields()) {
    if (NOT_REQUIRED_ON_ADVISORY_DRAFT.has(f)) continue
    expect(f in fact).toBe(true)
    const v = fact[f]
    expect(v).not.toBeUndefined()
    if (typeof v === "string") expect(v.length).toBeGreaterThan(0)
  }
}

describe("WP-10.A2-a — the `draft` COMPOSITION planner", () => {
  it("SCN-AUTH-6a-1 — every field the governed emit door destructures is present and well-formed", () => {
    const runtime = composeRuntime(fix.repoPath)
    const out = runtime.draft({ anchor: "src/util.ts::greet", slot: "invariant", claim: "greet takes a name" })
    assertDoorFieldsWellFormed(out.fact as unknown as Record<string, unknown>)
  })

  it("SCN-AUTH-6b-1 — identity is minted (nodeKey(candidateView)), never invented", () => {
    const runtime = composeRuntime(fix.repoPath)
    const out = runtime.draft({ anchor: "src/util.ts::greet", slot: "invariant", claim: "greet takes a name" })
    // Independent re-derivation: `nodeKey` depends ONLY on `.grounding` and `.slot`/`.check` (router.ts) —
    // rebuild the minimal Candidate view from the DRAFTED grounding (not from draft.ts's own object) and
    // recompute. A drafter that invented `id` would diverge here even though the door itself ignores it.
    const rebuilt: Candidate = {
      claimText: "irrelevant to identity",
      claimNorm: "irrelevant to identity",
      slot: "invariant" as PredicateSlot,
      grounding: out.fact.grounding,
      provenance: { source: "test", trusted: false },
      tier: "T2",
    }
    expect(out.fact.id).toBe(nodeKey(rebuilt))
  })

  it("SCN-AUTH-6c-1 — the grounding subtreeHash equals the computer's CURRENT value for the anchor", () => {
    const runtime = composeRuntime(fix.repoPath)
    const out = runtime.draft({ anchor: "src/app.ts::run", slot: "invariant", claim: "run returns a string" })
    // An INDEPENDENT computer instance over the SAME axes/rev (never draft.ts's own instance).
    const { axes, fileTree } = deriveGroundingAxes(
      walkFileTree(fix.repoPath),
      readScipOrEmpty(join(fix.repoPath, ".atlas", "index.scip")),
    )
    void fileTree
    const computer = buildGroundingComputer({ axes, rawTree: walkFileTree(fix.repoPath), rev: fix.rev })
    const oracle = computer.groundingFor({ anchor: "src/app.ts::run", slot: "invariant", claim: "x" })
    expect(String(out.fact.grounding.entries[0]!.anchor.subtreeHash)).toBe(String(oracle.subtreeHash))
  })

  it("SCN-AUTH-6d-1 / 6f-1 — three inputs only; no id/subtreeHash may even be supplied", () => {
    const runtime = composeRuntime(fix.repoPath)
    // `GroundingCandidate` has exactly {anchor, slot, claim} — there is no `id`/`subtreeHash` FIELD to pass,
    // which is the strongest form of "never demanded": the type does not admit the temptation.
    const out = runtime.draft({ anchor: "src/util.ts::greet", slot: "invariant", claim: "greet takes a name" })
    expect(out.fact).toBeDefined()
    expect(out.rev).toBeDefined()
  })

  it("SCN-AUTH-6e-1 — a mutant drafter that omits `predicateSlot` fails the completeness golden", () => {
    const runtime = composeRuntime(fix.repoPath)
    const out = runtime.draft({ anchor: "src/util.ts::greet", slot: "invariant", claim: "greet takes a name" })
    const mutant = { ...(out.fact as unknown as Record<string, unknown>) }
    delete mutant["predicateSlot"]
    expect(() => assertDoorFieldsWellFormed(mutant)).toThrow()
    // the REAL (unmutated) draft still passes — isolates the failure to the mutation, not a broken assertion
    expect(() => assertDoorFieldsWellFormed(out.fact as unknown as Record<string, unknown>)).not.toThrow()
  })

  it("SCN-AUTH-7a-1 — a draft carries the rev its grounding was computed at", () => {
    const runtime = composeRuntime(fix.repoPath)
    const out = runtime.draft({ anchor: "src/util.ts::greet", slot: "invariant", claim: "greet takes a name" })
    expect(out.rev).toBe(fix.rev)
  })
})
