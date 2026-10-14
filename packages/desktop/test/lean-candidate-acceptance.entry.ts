// Node entry for the packaged acceptance: Playwright's Electron launch never connects from Bun 1.3.14 (it times out),
// so lean-candidate-package.test.ts bundles this file for Node and hands it the candidate it already verified.
import { readFile } from "node:fs/promises"
import { proveNativeCandidate } from "./lean-candidate-acceptance.fixture"

const input = process.argv[2]
if (!input) throw new Error("LEAN_CANDIDATE_ACCEPTANCE_INPUT_REQUIRED")
if (process.versions.bun) throw new Error("LEAN_CANDIDATE_ACCEPTANCE_REQUIRES_NODE")
await proveNativeCandidate(JSON.parse(await readFile(input, "utf8")))
// Playwright connection handles can outlive the owned apps; acceptance is complete, so end this runner explicitly.
process.exit(0)
