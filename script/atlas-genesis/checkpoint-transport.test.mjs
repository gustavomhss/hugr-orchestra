import { test } from "node:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { refusedTransport } from "./checkpoint-transport.mjs"

test("protected compiled command withholds stdout on upload failure and terminates its exact model child", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "atlas-checkpoint-transport-"))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  await refusedTransport(directory)
})
