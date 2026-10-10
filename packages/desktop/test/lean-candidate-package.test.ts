import { test } from "bun:test"
import { requireNativeCI, verifyCandidateArchive } from "./lean-candidate-archive.fixture"

// No portable green/skip can stand in for the native packaged-app acceptance proof.
requireNativeCI()

test("candidate app.asar preserves compiled production entries, fonts, x64 PTY and all pinned Lean notices", async () => {
  await verifyCandidateArchive()
}, 120000)
