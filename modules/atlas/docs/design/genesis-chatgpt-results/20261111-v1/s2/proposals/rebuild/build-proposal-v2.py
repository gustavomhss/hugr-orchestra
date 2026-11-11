from pathlib import Path
import difflib
import hashlib
import json

root = Path(__file__).parent
source_path = 'modules/atlas/packages/adapter-io/src/ownership-rebuild.ts'
test_path = 'modules/atlas/packages/adapter-io/test/ownership-rebuild.test.ts'
source = (root / 'sources' / source_path.replace('/', '__')).read_text()
tests = (root / 'sources' / test_path.replace('/', '__')).read_text()

patched = source.replace(
    '    const mandatory = new Set(recipe.mandatoryInputs ?? recipe.declaredInputs)\n',
    '    const mandatory = new Set(recipe.mandatoryInputs ?? recipe.declaredInputs)\n'
    '    if (!recipe.declaredInputs.includes(recipe.recipeInputKey) || !mandatory.has(recipe.recipeInputKey))\n'
    '      return hold("malformed-ownership", [entry.key, recipe.recipeInputKey])\n',
    1,
)
patched = patched.replace(
    '    if (live !== undefined) capturedBytes.set(key, new Uint8Array(live))\n',
    '    if (live === undefined) return hold("ownership-input-unavailable", [key])\n'
    '    capturedBytes.set(key, new Uint8Array(live))\n',
    1,
)
old_snapshot = '''  const snapshotForRecipe = (): OwnershipRecipeInput => ({
    captured: new Map([...captured].map(([snapshotKey, snapshotValue]) => [snapshotKey, copyObservation(snapshotValue)] as [string, OwnershipInputObservation])),
    bytes: new Map([...capturedBytes].map(([snapshotKey, snapshotValue]) => [snapshotKey, new Uint8Array(snapshotValue)] as [string, Uint8Array])),
    lists: new Map([...initialMembers].map(([snapshotKey, snapshotValue]) => [snapshotKey, [...snapshotValue]] as [string, readonly string[]])),
    dependencies: new Map(),
  })
  const snapshotForRecipeInput = (dependencies: ReadonlyMap<string, Hash>): OwnershipRecipeInput => ({ ...snapshotForRecipe(), dependencies })
'''
new_snapshot = '''  const snapshotForRecipeInput = (inputs: readonly OwnershipInput[], dependencies: ReadonlyMap<string, Hash>): OwnershipRecipeInput => {
    const keys = new Set(inputs.map((input) => input.key))
    return {
      captured: new Map([...captured].filter(([key]) => keys.has(key)).map(([key, value]) => [key, copyObservation(value)] as [string, OwnershipInputObservation])),
      bytes: new Map([...capturedBytes].filter(([key]) => keys.has(key)).map(([key, value]) => [key, new Uint8Array(value)] as [string, Uint8Array])),
      lists: new Map([...initialMembers].filter(([dir]) => keys.has(`members:${dir}`)).map(([dir, members]) => [dir, [...members]] as [string, readonly string[]])),
      dependencies: new Map(dependencies),
    }
  }
'''
assert old_snapshot in patched
patched = patched.replace(old_snapshot, new_snapshot, 1)
patched = patched.replace('recipe.run(snapshotForRecipeInput(dependencies))', 'recipe.run(snapshotForRecipeInput(candidateInputs, dependencies))', 1)

fixture_path = 'modules/atlas/packages/adapter-io/test/fixtures/ownership-rebuild-fixture.ts'
boundary_path = 'modules/atlas/packages/adapter-io/test/ownership-rebuild-boundaries.test.ts'
fixture_start = tests.index('const SCOPE =')
tests_start = tests.index('describe("G2.2 incremental rebuild"')
fixture_body = tests[fixture_start:tests_start]
fixture_body = fixture_body.replace('const SCOPE =', 'export const SCOPE =', 1)
fixture_body = fixture_body.replace('const present =', 'export const present =', 1)
fixture_body = fixture_body.replace('function bodyFrom(', 'export function bodyFrom(', 1)
fixture_body = fixture_body.replace('function zamiFixture(', 'export function zamiFixture(', 1)
fixture_imports = '''// Shared synthetic CAS/recipe fixture for incremental rebuild and capture-boundary tests.
// These reviews are mechanical fixtures, never independent semantic acceptance.
import { createStore, id } from "@atlas/kernel"
import type { StoreApi, CasObject } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { OwnershipArtifact, OwnershipInput, OwnershipManifest, OwnershipReceipt, OwnershipResult, OwnershipReview } from "@atlas/knowledge"
import { rebuildOwnershipUpdate } from "../../src/ownership-rebuild.js"
import type { OwnershipRecipe, OwnershipRecipeInput, OwnershipRebuildRequest } from "../../src/ownership-rebuild.js"
import type { OwnershipInputObservation } from "../../src/ownership-input.js"

'''
fixture = fixture_imports + fixture_body
main_imports = '''import { describe, expect, it } from "vitest"
import { createStore, id } from "@atlas/kernel"
import type { OwnershipArtifact, OwnershipManifest, OwnershipReceipt } from "@atlas/knowledge"
import { readOwnership } from "@atlas/knowledge"
import { rebuildOwnershipUpdate } from "../src/ownership-rebuild.js"
import type { OwnershipInputObservation } from "../src/ownership-input.js"
import { SCOPE, bodyFrom, present, zamiFixture } from "./fixtures/ownership-rebuild-fixture.js"

type Obs = OwnershipInputObservation

'''
patched_tests = tests[:tests.index('import { describe')] + main_imports + tests[tests_start:]
boundaries = '''// Native producer preparation regressions. All review decisions here are synthetic test data.
import { describe, expect, it } from "vitest"
import { SCOPE, present, zamiFixture } from "./fixtures/ownership-rebuild-fixture.js"

describe("G2.2 captured recipe boundaries", () => {
  it("RB-21 recipes receive only their receipt-bound external inputs", () => {
    const f = zamiFixture()
    f.observations.set("file:intent-a.md", present("intent-2"))
    const seen: { captured: string[]; bytes: string[]; lists: string[]; dependencies: string[] }[] = []
    const recipes = f.buildRecipes({ a: f.recipeFor("a", (input) => {
      seen.push({
        captured: [...input.captured.keys()].sort(),
        bytes: [...input.bytes.keys()].sort(),
        lists: [...input.lists.keys()].sort(),
        dependencies: [...input.dependencies.keys()].sort(),
      })
      return f.runFor("a")(input)
    }) })
    expect(f.rebuild({ recipes })).toMatchObject({ kind: "candidate", calls: ["a", "m"] })
    expect(seen).toEqual([{
      captured: ["file:intent-a.md", "file:recipe-a.ts"],
      bytes: ["file:intent-a.md", "file:recipe-a.ts"],
      lists: [],
      dependencies: ["z"],
    }])
  })

  it("RB-22 another artifact cannot supply an omitted recipe identity binding", () => {
    const f = zamiFixture()
    const a = f.artifact("a",
      [{ key: "file:intent-a.md", version: "intent-1" }],
      f.baseline.built.get("a")!.receipt.dependencies,
      f.baseline.bodies.get("a")!, SCOPE, "fixture recipe a")
    const i = f.artifact("i",
      [...f.inputsFor("i"), { key: "file:recipe-a.ts", version: "recipe-a-1" }],
      [], f.baseline.bodies.get("i")!, SCOPE, "fixture recipe i")
    const manifest = f.store.put({ ...f.baseline.manifest,
      entries: f.baseline.manifest.entries.map((entry) => entry.key === "a"
        ? { key: "a", artifact: a.ref }
        : entry.key === "i" ? { key: "i", artifact: i.ref } : entry),
    })
    const recipes = f.buildRecipes({
      a: f.recipeFor("a", undefined, { mandatoryInputs: ["file:intent-a.md"] }),
      i: f.recipeFor("i", undefined, {
        declaredInputs: [...f.declared.get("i")!, "file:recipe-a.ts"],
        mandatoryInputs: [...f.declared.get("i")!, "file:recipe-a.ts"],
      }),
    })
    expect(f.rebuild({ manifest, recipes })).toMatchObject({
      kind: "hold", reason: "malformed-ownership", evidence: ["a", "file:recipe-a.ts"],
    })
    expect(f.executed).toEqual([])
  })

  it.each(["unchanged", "changed"] as const)("RB-23 missing captured file bytes refuses %s inputs before dispatch", (state) => {
    const f = zamiFixture()
    if (state === "changed") f.observations.set("file:intent-a.md", present("intent-2"))
    const evaluations: string[] = []
    const result = f.rebuild({
      readCapturedBytes: (key) => key === "file:intent-a.md" ? undefined : f.readCapturedBytes(key),
      evaluate: (input) => { evaluations.push(input.key); return f.evaluate(input) },
    })
    expect(result).toMatchObject({
      kind: "hold", reason: "ownership-input-unavailable", evidence: ["file:intent-a.md"],
    })
    expect(f.executed).toEqual([])
    expect(evaluations).toEqual([])
    expect(result).not.toHaveProperty("manifest")
  })
})
'''

files = [(source_path, source, patched), (test_path, tests, patched_tests), (fixture_path, '', fixture), (boundary_path, '', boundaries)]
patch = ''.join(''.join(difflib.unified_diff(old.splitlines(keepends=True), new.splitlines(keepends=True), fromfile='a/'+path if old else '/dev/null', tofile='b/'+path)) for path, old, new in files)
patch_path = root / 'ownership-rebuild-boundaries-v2.patch'
patch_path.write_text(patch)
preview = root / 'v2-preview'
for path, old, new in files:
    output = preview / path
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(new)

metadata = {
    'state': 'DRAFT_NOT_APPLIED_NOT_EXECUTED',
    'revision': 2,
    'supersedes': {'path': 'ownership-rebuild-boundaries.patch', 'sha256': hashlib.sha256((root/'ownership-rebuild-boundaries.patch').read_bytes()).hexdigest()},
    'source_revision': '1cde2ff7a71bcf7aecb5d030917b577165135d38',
    'changed_paths': [path for path, old, new in files],
    'fixes': ['scope-recipe-capture-to-bound-inputs', 'require-mandatory-recipe-identity-input', 'refuse-missing-captured-file-bytes'],
    'correction': 'Extract one existing synthetic fixture shared by original and new boundary tests; preserve all old assertions; explicitly cover missing captures with unchanged baseline.',
    'test_execution': 'NOT_RUN',
    'typecheck_execution': 'NOT_RUN',
    'guard_execution': 'NOT_RUN',
    'static_guard_line_counts': [{'path': path, 'before': len(old.split('\n')) if old else None, 'after': len(new.split('\n'))} for path, old, new in files],
    'original_assertion_block_unchanged': patched_tests[patched_tests.index('describe("G2.2 incremental rebuild"'):] == tests[tests_start:],
    'patch_sha256': hashlib.sha256(patch.encode()).hexdigest(),
    'patch_bytes': len(patch.encode()),
    'integration_gate': 'S1 ownership contract + S5 shared-file conflict clearance + CI policy',
    'ci_required_files': ['packages/adapter-io/test/ownership-rebuild.test.ts', 'packages/adapter-io/test/ownership-rebuild-boundaries.test.ts'],
}
(root / 'patch-metadata-v2.json').write_text(json.dumps(metadata, indent=2)+'\n')
print(json.dumps(metadata, indent=2))
