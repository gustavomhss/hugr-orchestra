import { test } from "bun:test"
import assert from "node:assert/strict"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { desktop, requireNativeCI, verifyCandidateArchive } from "./lean-candidate-archive.fixture"

// No portable green/skip can stand in for the native packaged-app acceptance proof.
requireNativeCI()

test("candidate proof and helpers typecheck through the standard desktop package command", async () => {
  const errors: unknown[] = []
  const scratch = await mkdtemp(path.join(desktop, "node_modules/.lean-candidate-types-"))
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
  } catch (error) { errors.push(error) }
  try { await rm(scratch, { recursive: true, force: true }) } catch (error) { errors.push(error) }
  if (errors.length) throw new AggregateError(errors, "Candidate typecheck primary and cleanup diagnostics")
}, 150000)

test("candidate app.asar preserves compiled production entries, fonts, x64 PTY and all pinned Lean notices", async () => {
  await verifyCandidateArchive()
}, 120000)

test("actual packaged candidate: owned backend/PTY, native Go30, renderer profiles and retained preferences", async () => {
  const { proveNativeCandidate } = await import("./lean-candidate-acceptance.fixture")
  await proveNativeCandidate()
}, 1200000)
