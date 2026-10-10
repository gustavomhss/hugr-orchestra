import assert from "node:assert/strict"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { CandidateRecorder } from "./lean-candidate-record.fixture"

export async function typecheckCandidateProof() {
  if (process.env.GITHUB_ACTIONS !== "true") throw new Error("LEAN_CANDIDATE_COMPILE_CI_REQUIRED")
  const desktop = path.resolve(import.meta.dir, "..")
  const recorder = new CandidateRecorder()
  recorder.protectPath(path.resolve(desktop, "../.."), "repository")
  const scratch = await mkdtemp(path.join(desktop, "node_modules/.lean-candidate-types-"))
  recorder.protectPath(scratch, "typecheck-scratch")
  try {
    const config = path.join(scratch, "tsconfig.json")
    await Bun.write(config, JSON.stringify({ extends: path.join(desktop, "tsconfig.json"),
      compilerOptions: { types: ["vite/client", "bun", "node", "electron"], tsBuildInfoFile: path.join(scratch, "proof.tsbuildinfo"),
        paths: { "@playwright/test": [path.resolve(desktop, "../app/node_modules/@playwright/test/index.d.ts")] } },
      references: [{ path: path.resolve(desktop, "../app") }],
      include: [path.join(desktop, "src"), path.join(desktop, "package.json"), path.join(import.meta.dir, "lean-candidate-*.ts")],
    }))
    const child = Bun.spawn([process.execPath, "typecheck", config], { cwd: desktop, stdout: "pipe", stderr: "pipe", timeout: 120000, killSignal: "SIGKILL" })
    const [out, error, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    assert.equal(code, 0, `Candidate proof typecheck: ${code}/${child.signalCode}\n${out}\n${error}`)
  } catch (error) { recorder.fail("primary", "candidate helper typecheck", error) }
  try { await rm(scratch, { recursive: true, force: true }) } catch (error) { recorder.fail("cleanup", "typecheck scratch removal", error) }
  if (recorder.failures.length) throw recorder.publicError("Candidate typecheck primary and cleanup diagnostics")
}
