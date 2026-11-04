import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { prepareProbe } from "./adapter-probe.mjs"

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
