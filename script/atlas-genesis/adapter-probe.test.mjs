import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { prepareProbe, selectTracePath } from "./adapter-probe.mjs"

test("probe preparation records file identities/revision, never persisted claims or answers", () => {
  const directory = mkdtempSync(join(tmpdir(), "atlas-probe-"))
  try {
    const rows = ["a", "b", "c"].map((name) => [name, {
      primaryAnchor: `packages/core/src/${name}.ts`, derivedAt: "a".repeat(40), claims: ["private answer"],
    }])
    writeFileSync(join(directory, "staging.json"), JSON.stringify({ current: rows }))
    prepareProbe(join(directory, "staging.json"), join(directory, "out"))
    assert.deepEqual(JSON.parse(readFileSync(join(directory, "out/manifest.json"), "utf8")), {
      revision: "a".repeat(40), paths: rows.map((row) => row[1].primaryAnchor),
    })
    rows[0][1].primaryAnchor = "packages/../../private.ts"
    writeFileSync(join(directory, "staging.json"), JSON.stringify({ current: rows }))
    assert.throws(() => prepareProbe(join(directory, "staging.json"), join(directory, "out")), /contained/)
    writeFileSync(join(directory, "staging.json"), JSON.stringify({ current: [] }))
    assert.throws(() => prepareProbe(join(directory, "staging.json"), join(directory, "out")), /three durable/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test("a single trace selects only a verified prepared file and preserves the original default", () => {
  const manifest = { paths: ["packages/schema/src/schema.ts", "packages/core/src/effect/layer-node.ts", "packages/core/src/flag/flag.ts"] }
  assert.equal(selectTracePath(manifest), manifest.paths[1])
  assert.equal(selectTracePath(manifest, manifest.paths[2]), manifest.paths[2])
  assert.throws(() => selectTracePath(manifest, "packages/core/src/other.ts"), /not a prepared candidate/)
  assert.throws(() => selectTracePath({ paths: [] }), /missing contained/)
  assert.throws(() => selectTracePath({ paths: ["packages/../../private.ts", ...manifest.paths.slice(1)] }), /missing contained/)
  assert.throws(() => selectTracePath({ paths: [manifest.paths[0], manifest.paths[0], manifest.paths[2]] }), /missing contained/)
})
