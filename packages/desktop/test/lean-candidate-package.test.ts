import { test } from "bun:test"
import os from "node:os"
import { repository, requireNativeCI, verifyCandidateArchive } from "./lean-candidate-archive.fixture"
import { CandidateRecorder } from "./lean-candidate-record.fixture"

// No portable green/skip can stand in for the native packaged-app acceptance proof.
requireNativeCI()

test("candidate proof and helpers typecheck through the standard desktop package command", async () => {
  const { typecheckCandidateProof } = await import("./lean-candidate-types.fixture")
  await typecheckCandidateProof()
}, 150000)

test("candidate app.asar preserves compiled production entries, fonts, x64 PTY and all pinned Lean notices", async () => {
  const recorder = new CandidateRecorder()
  recorder.protectPath(repository, "repository")
  recorder.protectPath(os.homedir(), "runner-home")
  recorder.protectPath(os.tmpdir(), "runner-temp")
  try { await verifyCandidateArchive() }
  catch (error) {
    recorder.fail("primary", "candidate archive verification", error)
    throw recorder.publicError("Candidate archive verification diagnostics")
  }
}, 120000)

test("actual packaged candidate: owned backend/PTY, native Go30, renderer profiles and retained preferences", async () => {
  const { proveNativeCandidate } = await import("./lean-candidate-acceptance.fixture")
  await proveNativeCandidate()
}, 1200000)
