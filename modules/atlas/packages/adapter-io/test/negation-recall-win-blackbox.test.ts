// @atlas/adapter-io — test/negation-recall-win-blackbox.test.ts  (ADR-0016 M2b — the recall win, end to end)
//
// The whole point of M2b, proven THROUGH THE REAL COMPOSITION ROOT (`composeRuntime().promote`, the promote
// leg #96 wires the negation door on). ONE repository, ONE staged negation, ONE scope S = `src/pay` that has:
//   · an UNRELATED static hole (`src/pay/a.ts` references `missingHelper`, which no doc defines);
//   · a NON-ESCAPING resolvable target X (`greet`, defined in `src/lib`, referenced only as a call CALLEE
//     outside S — so it never escapes and has no caller inside S);
//   · NO dynamic-reach channel in S.
// The #99b shipped door abstains `scope-open` on it (any hole in S ⇒ ~0 recall). ADR-0016's target-relative
// gate ADMITS it. This suite runs BOTH over the same inputs:
//   · CONTROL (the shipped fallback): the promote door WITHOUT the two v2 legs abstains `scope-open`.
//   · v2 (the recall win): `composeRuntime().promote` — which wires the legs once `initAst()` has warmed the
//     grammars — ADMITS the negation into governed knowledge.
// TEETH: the CONTROL vs v2 disjunction IS the mutation — strip the escape legs (the M2b wiring) and v2 reverts
// to the CONTROL's `scope-open` abstention. Also directly asserted: the fallback's `holeSources() ∩ S` fires.

import { describe, it, expect, afterEach, beforeAll } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { execFileSync } from "node:child_process"
import { create } from "@bufbuild/protobuf"
import {
  serializeSCIP,
  IndexSchema,
  MetadataSchema,
  ToolInfoSchema,
  DocumentSchema,
  OccurrenceSchema,
  SymbolRole,
} from "@c4312/scip"
import { asHash } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { CurrentNode, NegationNode, StoreProjection } from "@atlas/knowledge"
import { build, createSymbolReverse, nodeHashOfPath } from "@atlas/index"
import { composeRuntime } from "../src/compose.js"
import { createGovernedEmit } from "../src/governed-emit.js"
import { createGovernedPromote } from "../src/governed-promote.js"
import { createDiskStore } from "../src/store.js"
import { walkFileTree } from "../src/fs.js"
import { foldAstUnits, initAst } from "../src/ast.js"
import { readScipOrEmpty } from "../src/scip.js"
import { edgeModelVersion } from "../src/wire.js"

const AT = asHash("cafe")
const ACTOR = "pay@atlas.test"
const S = "src/pay"
// The negation target — `greet`'s src-form symbol (no dist form here ⇒ canon is identity). It must equal the
// DEFINITION occurrence's symbol byte-for-byte (that is how `resolves`/`reverseCallers` key it).
const GREET = "scip-typescript npm r 0.0.0 src/`util.ts`/greet#"
const MISSING = "scip-typescript npm r 0.0.0 src/`nowhere.ts`/missingHelper#" // no def ⇒ the unrelated hole

const UTIL = "export function greet(): number {\n  return 1;\n}\n"
const OTHER = "import { greet } from './util';\nexport function useIt(): number {\n  return greet();\n}\n" // callee ⇒ safe
const PAY = "export function pay(): number {\n  return missingHelper();\n}\n" // hole; no greet ref; no dyn channel

/** The 0-based [row, col, endCol] of the `n`-th occurrence of `needle` in `content` (SCIP range shape). */
function rangeOf(content: string, needle: string, n = 1): [number, number, number] {
  const lines = content.split("\n")
  let seen = 0
  for (let row = 0; row < lines.length; row++) {
    let from = 0
    for (;;) {
      const col = lines[row]!.indexOf(needle, from)
      if (col < 0) break
      if (++seen === n) return [row, col, col + needle.length]
      from = col + 1
    }
  }
  throw new Error(`needle ${needle}#${n} not found`)
}

interface Repo {
  repoPath: string
  scipPath: string
  cleanup(): void
}

/** A governed repo: real git tree (source committed) + `.atlas/policy.json` + `.atlas/index.scip` (WITH ranges)
 *  + ONE staged negation over S targeting `greet`. `.atlas/` is written AFTER the commit ⇒ untracked ⇒ trusted. */
function makeRepo(): Repo {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-recall-win-"))
  const write = (rel: string, body: string): void => {
    const abs = join(repoPath, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  write("src/lib/util.ts", UTIL)
  write("src/lib/other.ts", OTHER)
  write("src/pay/a.ts", PAY)

  const git = (...args: string[]): void => void execFileSync("git", args, { cwd: repoPath, stdio: "pipe" })
  git("init", "-q")
  git("config", "user.email", ACTOR)
  git("config", "user.name", "atlas-recall")
  git("config", "commit.gpgsign", "false")
  git("add", ".")
  git("commit", "-q", "-m", "recall-win-fixture")

  const occ = (symbol: string, range: [number, number, number], def = false) =>
    create(OccurrenceSchema, { symbol, symbolRoles: def ? SymbolRole.Definition : 0, range })
  const index = create(IndexSchema, {
    // ADR-0016 item 2 — the v2 escape leg is enabled ONLY for the scip-typescript indexer; this fixture
    // simulates a scip-typescript dump, so it declares it (else the assembler degrades to the blanket fallback).
    metadata: create(MetadataSchema, { toolInfo: create(ToolInfoSchema, { name: "scip-typescript" }) }),
    documents: [
      create(DocumentSchema, {
        relativePath: "src/lib/util.ts",
        occurrences: [occ(GREET, rangeOf(UTIL, "greet"), true)],
      }),
      create(DocumentSchema, {
        relativePath: "src/lib/other.ts",
        occurrences: [occ(GREET, rangeOf(OTHER, "greet", 2))], // `greet()` — the CALLEE ⇒ safe ⇒ non-escaping
      }),
      create(DocumentSchema, {
        relativePath: "src/pay/a.ts",
        occurrences: [occ(MISSING, rangeOf(PAY, "missingHelper"))], // the UNRELATED hole in S
      }),
    ],
  })
  const atlasDir = join(repoPath, ".atlas")
  mkdirSync(atlasDir, { recursive: true })
  writeFileSync(
    join(atlasDir, "policy.json"),
    JSON.stringify({ t0Heuristic: { keywords: [] }, authz: { scopes: { [S]: [ACTOR] } } }),
  )
  const scipPath = join(atlasDir, "index.scip")
  writeFileSync(scipPath, serializeSCIP(index))

  stageNegation(repoPath)
  return { repoPath, scipPath, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

/** A well-formed T2 negation "greet is not `calls`-ed in src/pay", staged exactly as `mine` stages it. */
function negation(): NegationNode {
  return {
    kind: "negation",
    id: "ignored" as unknown as NegationNode["id"],
    tier: "T2",
    relationKind: "calls",
    target: GREET,
    scope: S,
    grounding: { entries: [] },
    edgeModel: "ignored",
    freshness: "FRESH",
    claims: [],
    authoring: "NEGATED",
  } as unknown as NegationNode
}

function stageNegation(repoPath: string): void {
  const store = createDiskStore(join(repoPath, ".atlas", "cas"))
  const contentHash = store.put(negation() as never) as unknown as string
  store.commitStaging<undefined>((p) => ({
    out: undefined,
    next: {
      current: new Map<string, CurrentNode>([
        ...p.current,
        [
          "nk-staged-neg",
          { nodeKey: "nk-staged-neg", family: "negation", contentHash, claims: [] } as unknown as CurrentNode,
        ],
      ]),
      cas: new Set<string>([...p.cas, contentHash]),
    } as unknown as StoreProjection,
    put: [],
  }))
}

let cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.forEach((c) => c())
  cleanups = []
})

describe("ADR-0016 M2b — the recall win end-to-end (v2 admits where the shipped blanket abstains)", () => {
  beforeAll(async () => {
    await initAst() // warm the grammars so `composeRuntime` can build the v2 escape/dynamic legs.
  })

  it("CONTROL (shipped fallback): the promote door WITHOUT the v2 legs ABSTAINS scope-open on S", () => {
    const repo = makeRepo()
    cleanups.push(repo.cleanup)
    const scipOutput = readScipOrEmpty(repo.scipPath)
    const axes = build(foldAstUnits(walkFileTree(repo.repoPath)), scipOutput)
    const symbolReverse = createSymbolReverse(scipOutput)
    // The fallback's blanket condition fires directly: S carries an unresolved hole.
    const holesUnderS = symbolReverse
      .holeSources()
      .map(String)
      .filter((h) => h === String(nodeHashOfPath("src/pay/a.ts")))
    expect(holesUnderS.length).toBeGreaterThan(0)

    const store = createDiskStore(join(repo.repoPath, ".atlas", "cas"))
    const fallbackDoor = createGovernedPromote({
      store,
      emit: createGovernedEmit({
        store,
        gate: { gateHolds: () => "HOLDS" } as never,
        policy: { t0Heuristic: { keywords: [] }, authz: { scopes: { [S]: [ACTOR] } } },
        actor: ACTOR,
        origin: "promoted",
        ratifyToken: "billy",
        // The four #99b deps, but NO v2 escape legs ⇒ the door runs the sound `holeSources() ∩ S` blanket.
        symbolReverse: () => symbolReverse,
        axes,
        nodeHashOfPath,
        edgeModel: edgeModelVersion(),
      }).emit,
    })
    const out = fallbackDoor.promote(AT as unknown as Hash)
    expect(out.candidates).toBe(1)
    expect(out.rows[0]!.settled).not.toBe(true)
    expect(out.rows[0]!.rejected ?? "").toContain("scope-open")
  })

  it(
    "v2 RECALL WIN: composeRuntime().promote ADMITS the SAME negation (¬escape ∧ no dynamic-reach ∧ no " +
      "caller in S) — the recall the shipped blanket throws away",
    () => {
      const repo = makeRepo()
      cleanups.push(repo.cleanup)
      const prevToken = process.env.ATLAS_RATIFY_TOKEN
      process.env.ATLAS_RATIFY_TOKEN = "billy" // a promoted write full-ratifies (governed-emit-route.ts)
      try {
        const out = composeRuntime(repo.repoPath).promote(AT)
        expect(out.read).toBe(true)
        expect(out.candidates).toBe(1)
        // The recall win: ADMITTED where the CONTROL above abstained scope-open over byte-identical inputs.
        expect(out.rows[0]!.rejected ?? "").toBe("")
        expect(out.rows[0]!.settled).toBe(true)
      } finally {
        if (prevToken === undefined) delete process.env.ATLAS_RATIFY_TOKEN
        else process.env.ATLAS_RATIFY_TOKEN = prevToken
      }
    },
  )
})
