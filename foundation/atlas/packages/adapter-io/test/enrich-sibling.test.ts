// @atlas/adapter-io — test/enrich-sibling.test.ts  (ENRICH arm, A4-LEVER.md — the cross-unit precision fix)
//
// WHAT WAS WRONG. The symbol-arm reader shows the model ONE unit's bytes. A fact whose truth depends on a
// SIBLING unit's bytes/type is therefore manufactured plausible-but-false (#201): measured in A4-LEVER.md,
// every false fact on the symbol arm was this cross-unit trap (createInit needing RawTerritory's type,
// keyArb needing KEY_TOKENS's contents). `a4-enrich-fix.json` proved the fix 2/2: show the referenced
// sibling as CONTEXT and the fact flips TRUE.
//
// WHAT THESE CASES PIN, and the two invariants that make the fix SOUND rather than a grounding leak:
//   1. `createUnitSiblingReader` resolves the minimal same-file context set by identifier BFS — the sibling
//      a target references, never an unrelated unit, never the target itself.
//   2. Enrichment is a `build`-only concern: the evidence span and the grounding anchor are BYTE-IDENTICAL
//      to the bare arm's. A related unit is what the model SEES, never what the fact is anchored to
//      (KNOW-15g). This is asserted by comparing the enriched factory's span digest to the bare one's — if
//      enrichment ever widened the anchor, they would differ.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import { asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { Candidate, MinedSignals } from "@atlas/genesis"

import { initAst } from "../src/ast.js"
import { createPromptFactory, shippedEnrichedTemplatePath, PromptError } from "../src/prompt.js"
import { createUnitSourceReader, createUnitSiblingReader } from "../src/unit-source.js"

beforeAll(async () => {
  await initAst()
}, 60_000)

const repos: string[] = []
afterEach(() => {
  while (repos.length > 0) rmSync(repos.pop()!, { recursive: true, force: true })
})

function repoWith(files: Readonly<Record<string, string>>): string {
  const d = mkdtempSync(join(tmpdir(), "atlas-enrich-"))
  repos.push(d)
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(d, rel)
    mkdirSync(join(abs, ".."), { recursive: true })
    writeFileSync(abs, body)
  }
  return d
}

const NO_SIGNALS: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }
const siteAt = (qualifiedPath: string, kind: StructRef["kind"] = "symbol"): StructRef => ({
  kind,
  qualifiedPath,
  subtreeHash: asSubtreeHash("st-enrich-fixture"),
})
const candAt = (qualifiedPath: string, kind: StructRef["kind"] = "symbol"): Candidate => ({
  site: siteAt(qualifiedPath, kind),
  signals: NO_SIGNALS,
  ppr: 0,
  rank: 1,
})

// The exact cross-unit shape from A4-LEVER: `createInit` mentions the type `RawTerritory` (a sibling unit)
// and does NOT mention `noise` (an unrelated one). The `::` chains are the ones `ast.ts` mints, written out
// literally (probed) so a change to the minting rule fails here loudly.
const FILE = `type RawTerritory = { path: string };
export function createInit(t: RawTerritory): number { return 1; }
function noise(): void { return; }
`
const P_FILE = "src/init.ts"
const P_TARGET = "src/init.ts::function_declaration:0:createInit"
const P_SIBLING_CHAIN = "type_alias_declaration:0:RawTerritory"
const P_NOISE_CHAIN = "function_declaration:0:noise"

describe("ENRICH — createUnitSiblingReader resolves the minimal same-file context set", () => {
  it("pulls in the referenced sibling (RawTerritory), excludes the unrelated unit and the target itself", () => {
    const repo = repoWith({ [P_FILE]: FILE })
    const siblings = createUnitSiblingReader(repo).readSiblings(siteAt(P_TARGET))
    const names = siblings.map((s) => s.name)
    expect(names).toContain(P_SIBLING_CHAIN) //   the sibling whose TYPE the target depends on
    expect(names).not.toContain(P_NOISE_CHAIN) // an unrelated unit is never context
    // the target is shown separately as the anchored unit — never listed as its own context
    expect(names).not.toContain("function_declaration:0:createInit")
    // the bytes are the sibling's OWN, re-derivable
    const raw = siblings.find((s) => s.name === P_SIBLING_CHAIN)
    expect(raw?.content).toBe("type RawTerritory = { path: string };")
  })

  it("a whole-file anchor has no siblings (empty, total)", () => {
    const repo = repoWith({ [P_FILE]: FILE })
    expect(createUnitSiblingReader(repo).readSiblings(siteAt(P_FILE, "file"))).toEqual([])
  })

  it("an unresolvable file yields no siblings, never a throw", () => {
    const repo = repoWith({ [P_FILE]: FILE })
    expect(createUnitSiblingReader(repo).readSiblings(siteAt("src/gone.ts::function_declaration:0:x"))).toEqual([])
  })
})

describe("ENRICH — the enriched prompt shows the sibling as CONTEXT without moving the anchor", () => {
  it("build() interpolates the related sibling; the bare arm does not", () => {
    const repo = repoWith({ [P_FILE]: FILE })
    const enriched = createPromptFactory({
      source: createUnitSourceReader(repo),
      related: createUnitSiblingReader(repo),
      templatePath: shippedEnrichedTemplatePath(),
    })
    const bare = createPromptFactory({ source: createUnitSourceReader(repo) })

    const enrichedPrompt = enriched.build(candAt(P_TARGET))
    expect(enrichedPrompt).toContain(`<related-unit name="${P_SIBLING_CHAIN}">`)
    expect(enrichedPrompt).toContain("type RawTerritory = { path: string };") // the sibling's bytes are shown
    expect(enrichedPrompt).toContain("function createInit") //                    the target is still shown

    expect(bare.build(candAt(P_TARGET))).not.toContain("<related-unit") //        the default arm is unchanged
  })

  it("the evidence span is BYTE-IDENTICAL across arms — enrichment never widens the anchor (KNOW-15g)", () => {
    const repo = repoWith({ [P_FILE]: FILE })
    const enriched = createPromptFactory({
      source: createUnitSourceReader(repo),
      related: createUnitSiblingReader(repo),
      templatePath: shippedEnrichedTemplatePath(),
    })
    const bare = createPromptFactory({ source: createUnitSourceReader(repo) })
    const cand = candAt(P_TARGET)

    const enrichedSpan = enriched.evidenceSpan(cand)
    const bareSpan = bare.evidenceSpan(cand)
    expect(enrichedSpan).not.toBeNull()
    // same content hash AND same byte range ⇒ the fact is anchored to the target unit alone, both arms
    expect(String(enrichedSpan?.contentHash)).toBe(String(bareSpan?.contentHash))
    expect(enrichedSpan?.start).toBe(bareSpan?.start)
    expect(enrichedSpan?.end).toBe(bareSpan?.end)
  })

  it("injecting a sibling reader against a template with no {{RELATED}} slot is refused at load", () => {
    const repo = repoWith({ [P_FILE]: FILE })
    // the SHIPPED bare template has {{SOURCE}} but no {{RELATED}} — the enriched context would be dropped
    expect(() =>
      createPromptFactory({ source: createUnitSourceReader(repo), related: createUnitSiblingReader(repo) }),
    ).toThrow(PromptError)
  })
})
