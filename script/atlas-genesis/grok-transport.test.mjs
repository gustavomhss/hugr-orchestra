import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fixtureTransport } from "./grok-transport.mjs"

test("the actual compiled ModelClient socket preserves large prompts and rejects the old reopening transport", async (t) => {
  const out = mkdtempSync(join(tmpdir(), "atlas-grok-transport-"))
  t.after(() => rmSync(out, { recursive: true, force: true }))
  const receipt = await fixtureTransport(out)
  assert(receipt.bytes > 131072)
  assert.equal(receipt.regularStdin, true)
  assert.equal(receipt.promptUnlinked, true)
})
