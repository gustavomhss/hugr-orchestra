import { expect, test } from "bun:test"
import { cpSync, mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { BUN, ROOT } from "../../omni/campaign/lib.ts"
import { run, settle } from "../../omni/campaign/v7-attribution.ts"

// This Linux benchmark needs the release binaries supplied by test:ci's omni flag; ordinary suites skip explicitly.
const native = test.skipIf(process.platform !== "linux" || process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER !== "1")

native("V7 attribution: real Effect caller, bare binding, native exit/EOF/stop boundaries", async () => {
  const { Effect } = await import("effect")
  const { ChildProcess } = await import("effect/unstable/process")
  const { Omni } = await import("../src/omni.ts")
  const { OmniSpawner } = await import("../src/omni-spawner.ts")
  const binding = await Omni.load()
  const control = await Effect.runPromise(OmniSpawner.collect(binding, ChildProcess.make("git", ["rev-parse", "HEAD"]), {}))
  expect(control.exitCode).toBe(0)
  const result = await run()
  expect(result.app.count).toBe(1000)
  expect(result.bare.count).toBe(1000)
  expect(result.staged.count).toBe(1000)
}, 900_000)

native("V7 Linux syscall attribution (unprivileged native strace)", async () => {
  await run(true)
}, 900_000)

native("V7 unchanged 1000-pair quiet real AppProcess KPI and baseline mutation", async () => {
  await settle()
  const { run } = await import("../../omni/campaign/v7-overhead.ts")
  const result = await run({ quiet: true })
  console.log("V7_KPI " + JSON.stringify(result))
  expect(result.timingKpiRun).toBe(true)
  expect(result.pass).toBe(true)
  // Compile the exact pre-fix inventory in a disposable source tree. Never build Rust on the owner's machine.
  if (process.env.CI !== "true" || process.platform !== "linux") throw new Error("Mutation requires native Linux CI")
  const scratch = mkdtempSync(path.join(os.tmpdir(), "omni-inventory-mutation-"))
  try {
    const source = path.join(ROOT, "packages/omni")
    cpSync(source, scratch, { recursive: true, filter: (file) =>
      !path.relative(source, file).split(path.sep).some((part) => ["target", "node_modules", "logs", ".git"].includes(part)) })
    const file = path.join(scratch, "crates/omni-supervisor/src/unix/procs.rs")
    const current = await Bun.file(file).text()
    const first = current.indexOf("    // Avoid reading and parsing stat for unrelated processes.")
    const last = current.indexOf("    let Some(st) = stat(pid)?", first)
    expect(first).toBeGreaterThan(0)
    expect(last).toBeGreaterThan(first)
    const baseline = current.slice(0, first) + current.slice(last)
    const hash = Bun.spawn(["git", "hash-object", "--stdin"], { cwd: ROOT, stdin: Buffer.from(baseline), stdout: "pipe" })
    expect((await new Response(hash.stdout).text()).trim()).toBe("ad9169b6fe48afc06aee30cb2e1072d2daf5771c")
    expect(await hash.exited).toBe(0)
    await Bun.write(file, baseline)
    const build = Bun.spawn(["cargo", "build", "--release", "-p", "omni-supervisor"], { cwd: scratch, stdout: "inherit", stderr: "inherit" })
    expect(await build.exited).toBe(0)
    await settle()
    const mutation = Bun.spawn([BUN, path.join(source, "campaign/v7-overhead.ts"), "--quiet"], {
      cwd: ROOT, env: { ...process.env, HUGR_OMNI_SUPERVISOR: path.join(scratch, "target/release/hugr-omni-supervisor") },
      stdout: "pipe", stderr: "pipe",
    })
    const [stdout, stderr, exit] = await Promise.all([
      new Response(mutation.stdout).text(), new Response(mutation.stderr).text(), mutation.exited,
    ])
    console.log("V7_MUTATION " + stdout + stderr)
    const verdicts = stdout.split("\n").filter((line) => line.startsWith("CAMPAIGN_VERDICT "))
    expect(verdicts.length).toBe(1)
    const verdict = JSON.parse(verdicts[0].slice("CAMPAIGN_VERDICT ".length)) as {
      scenario: string; timingKpiRun: boolean; pass: boolean
      counts: Record<string, { completed: number; spawns: number; delegations: number }>
    }
    expect(verdict.scenario).toBe("v7-overhead")
    expect(verdict.timingKpiRun).toBe(true)
    expect(verdict.counts).toEqual({ legacy: { completed: 1000, spawns: 0, delegations: 0 },
      omni: { completed: 1000, spawns: 1000, delegations: 0 } })
    expect(verdict.pass).toBe(false)
    expect(exit).toBe(1)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}, 1_800_000)
