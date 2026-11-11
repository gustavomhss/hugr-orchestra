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

new_tests = '''  it("RB-21 recipes receive only their receipt-bound external inputs", () => {
    const f = zamiFixture()
    f.observations.set("file:intent-a.md", present("intent-2"))
    const seen: { captured: string[]; bytes: string[]; lists: string[]; dependencies: string[] }[] = []
    const recipes = f.buildRecipes({ a: f.recipeFor("a", (input) => {
      seen.push({ captured: [...input.captured.keys()].sort(), bytes: [...input.bytes.keys()].sort(), lists: [...input.lists.keys()].sort(), dependencies: [...input.dependencies.keys()].sort() })
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
    const a = f.artifact("a", [{ key: "file:intent-a.md", version: "intent-1" }], f.baseline.built.get("a")!.receipt.dependencies, f.baseline.bodies.get("a")!, SCOPE, "fixture recipe a")
    const i = f.artifact("i", [...f.inputsFor("i"), { key: "file:recipe-a.ts", version: "recipe-a-1" }], [], f.baseline.bodies.get("i")!, SCOPE, "fixture recipe i")
    const manifest = f.store.put({ ...f.baseline.manifest, entries: f.baseline.manifest.entries.map((entry) => entry.key === "a" ? { key: "a", artifact: a.ref } : entry.key === "i" ? { key: "i", artifact: i.ref } : entry) })
    const recipes = f.buildRecipes({
      a: f.recipeFor("a", undefined, { mandatoryInputs: ["file:intent-a.md"] }),
      i: f.recipeFor("i", undefined, { declaredInputs: [...f.declared.get("i")!, "file:recipe-a.ts"], mandatoryInputs: [...f.declared.get("i")!, "file:recipe-a.ts"] }),
    })
    expect(f.rebuild({ manifest, recipes })).toMatchObject({ kind: "hold", reason: "malformed-ownership", evidence: ["a", "file:recipe-a.ts"] })
    expect(f.executed).toEqual([])
  })
  it("RB-23 missing captured file bytes prevents recipe execution", () => {
    const f = zamiFixture()
    f.observations.set("file:intent-a.md", present("intent-2"))
    const result = f.rebuild({ readCapturedBytes: (key) => key === "file:intent-a.md" ? undefined : f.readCapturedBytes(key) })
    expect(result).toMatchObject({ kind: "hold", reason: "ownership-input-unavailable", evidence: ["file:intent-a.md"] })
    expect(f.executed).toEqual([])
  })
'''
marker = '})\n\ndescribe("G2.2 concurrency", () => {'
assert marker in tests
patched_tests = tests.replace(marker, new_tests + marker, 1)
patch = ''.join(difflib.unified_diff(source.splitlines(keepends=True), patched.splitlines(keepends=True), fromfile='a/'+source_path, tofile='b/'+source_path))
patch += ''.join(difflib.unified_diff(tests.splitlines(keepends=True), patched_tests.splitlines(keepends=True), fromfile='a/'+test_path, tofile='b/'+test_path))
(root / 'ownership-rebuild-boundaries.patch').write_text(patch)
metadata = {
    'state': 'DRAFT_NOT_APPLIED_NOT_EXECUTED',
    'source_revision': '1cde2ff7a71bcf7aecb5d030917b577165135d38',
    'changed_paths': [source_path, test_path],
    'fixes': ['scope-recipe-capture-to-bound-inputs', 'require-mandatory-recipe-identity-input', 'refuse-missing-captured-file-bytes'],
    'test_execution': 'NOT_RUN',
    'typecheck_execution': 'NOT_RUN',
    'patch_sha256': hashlib.sha256(patch.encode()).hexdigest(),
    'patch_bytes': len(patch.encode()),
    'integration_gate': 'S1 ownership contract + S5 shared-file conflict clearance + CI policy',
}
(root / 'patch-metadata.json').write_text(json.dumps(metadata, indent=2)+'\n')
print(json.dumps(metadata, indent=2))
