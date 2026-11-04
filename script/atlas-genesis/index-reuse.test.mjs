import assert from "node:assert/strict"
import { test } from "node:test"
import { requireReusableChanges, requireUnchangedDocuments } from "./index-reuse.mjs"

test("reuse accepts identical trees and the closed maintenance scope, not source/dependency changes", () => {
  requireReusableChanges([])
  const allowed = ["modules/atlas/packages/cli/src/mine.ts", "script/atlas-genesis/grok-text.sh",
    ".github/workflows/atlas-genesis.yml", ".orchestra/skills/atlas-maintenance/SKILL.md", "docs/guides/atlas-genesis.md"]
  requireReusableChanges(allowed)
  // Positive controls against every claimed excluded scope: adding one real source path must refuse.
  for (const path of ["packages/schema/src/schema.ts", "modules/relay/lib/main.py", "native/omni/src/lib.rs",
    "package.json", "bun.lock", "tsconfig.json", "modules/atlas-elsewhere/index.ts",
    "docs/guides/atlas-genesis.md\npackages/core/src/index.ts"]) {
    assert.throws(() => requireReusableChanges([...allowed, path]), /indexed or unreviewed paths changed/)
  }
  assert.throws(() => requireReusableChanges(["modules/atlas/../../packages/core/src/index.ts"]), /invalid change list/)
  assert.throws(() => requireReusableChanges(undefined), /invalid change list/)
})

test("a maintenance exemption cannot hide a path actually present in the restored index", () => {
  const path = "modules/atlas/packages/cli/src/mine.ts"
  requireUnchangedDocuments([path], [{ relativePath: "packages/schema/src/schema.ts" }])
  assert.throws(() => requireUnchangedDocuments([path], [{ relativePath: path }]), /indexed document changed/)
  assert.throws(() => requireUnchangedDocuments([], []), /missing indexed document list/)
})
