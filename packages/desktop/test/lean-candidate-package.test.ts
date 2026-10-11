import { test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { desktop, packagedCandidate, repository, requireNativeCI, verifyCandidateArchive } from "./lean-candidate-archive.fixture"
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
  // Verified under Bun (Bun.Glob/git receipts), then driven under Node: Playwright cannot launch Electron from Bun.
  const candidate = await packagedCandidate()
  const scratch = await mkdtemp(path.join(os.tmpdir(), "lean-candidate-acceptance-"))
  try {
    const built = await Bun.build({ target: "node", format: "esm", entrypoints: [path.join(import.meta.dir, "lean-candidate-acceptance.entry.ts")],
      outdir: scratch, naming: "acceptance.mjs" })
    if (!built.success) throw new AggregateError(built.logs, "Node acceptance bundle failed")
    await writeFile(path.join(scratch, "candidate.json"), JSON.stringify(candidate))
    // Output is the recorder's sanitized projection; the child inherits this step's env and owns its launch allowlist.
    const child = Bun.spawn(["node", path.join(scratch, "acceptance.mjs"), path.join(scratch, "candidate.json")], {
      cwd: desktop, env: { ...process.env, LEAN_CANDIDATE_DESKTOP: desktop }, stdout: "inherit", stderr: "inherit",
      timeout: 1_150_000, killSignal: "SIGKILL" })
    const code = await child.exited
    if (code !== 0 || child.signalCode) throw new Error(`Node packaged acceptance failed: ${code}/${child.signalCode}`)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}, 1200000)
