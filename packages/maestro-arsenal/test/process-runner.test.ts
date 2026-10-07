// The process-runner injection point (WP3): an injected runner carries every arsenal process, with arsenal's own
// caps, timeouts and error names; without one arsenal keeps Bun.spawn. With the omni flag on, the runner core injects
// (omni run through the core loader) runs a real process; core is reached by path because arsenal cannot depend on it.
import { afterEach, describe, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runProcess } from "../src/engine/process.ts"
import { processBytes, PROCESS_BYTES } from "../src/governance/process.ts"
import { processRunner, setProcessRunner, type ProcessRequest, type ProcessResult } from "../src/process-runner.ts"

const context = {
  directory: tmpdir(),
  stateDirectory: tmpdir(),
  projectID: "process-runner-test",
  authorize: async () => {},
}
const empty = new Uint8Array()
const result = (overrides: Partial<ProcessResult> = {}): ProcessResult => ({
  stdout: new TextEncoder().encode("from runner"),
  stderr: empty,
  exitCode: 0,
  timedOut: false,
  overflow: false,
  ...overrides,
})

afterEach(() => setProcessRunner(undefined))

describe("arsenal process runner", () => {
  test("engine and governance processes go through the injected runner, with their caps and timeouts", async () => {
    const requests: ProcessRequest[] = []
    setProcessRunner(async (request) => {
      requests.push(request)
      return result()
    })
    expect((await runProcess(["git", "status"], context.directory, context, "in")).stdout).toBe("from runner")
    expect((await processBytes(context, context.directory, ["git", "log"], "stdin")).toString()).toBe("from runner")
    expect(requests.map((request) => request.argv.at(-1))).toEqual(["status", "log"])
    expect(requests.map((request) => [request.input, request.timeoutMs, request.maxOutputBytes])).toEqual([
      ["in", 30000, 8_000_000],
      ["stdin", 15000, PROCESS_BYTES],
    ])
    expect(requests[0].env.GIT_TERMINAL_PROMPT).toBe("0")
    expect(Object.values(requests[1].env).every((value) => typeof value === "string")).toBe(true)
  })

  test("runner outcomes keep arsenal's failure names", async () => {
    setProcessRunner(async () => result({ overflow: true }))
    await expect(runProcess(["git"], context.directory, context)).rejects.toThrow("output exceeds 8MB")
    await expect(processBytes(context, context.directory, ["git"])).rejects.toThrow("PROCESS_OUTPUT_OVERFLOW")
    setProcessRunner(async () => result({ timedOut: true }))
    await expect(runProcess(["git"], context.directory, context)).rejects.toThrow()
    await expect(processBytes(context, context.directory, ["git"])).rejects.toThrow("PROCESS_TIMEOUT")
    setProcessRunner(async () => result({ exitCode: 3, stderr: new TextEncoder().encode("bad") }))
    await expect(processBytes(context, context.directory, ["git"])).rejects.toThrow(
      "PROCESS_ACQUISITION_FAILED: git (3): bad",
    )
    setProcessRunner(async () => Promise.reject(new Error("not found")))
    await expect(runProcess(["git"], context.directory, context)).rejects.toThrow("not found")
    await expect(processBytes(context, context.directory, ["git"])).rejects.toThrow("PROCESS_LAUNCH_FAILED: not found")
  })

  test("without a runner arsenal spawns on its own", async () => {
    expect(processRunner()).toBeUndefined()
    const out = await runProcess([process.execPath, "-e", "process.stdout.write('own')"], context.directory, context)
    expect(out.stdout).toBe("own")
  })

  test.skipIf((process.env.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER ?? "0") === "0")(
    "core's omni runner, installed when core loads arsenal, runs real processes",
    async () => {
      const core = (await import(join(import.meta.dir, "..", "..", "core", "src", "tool", "maestro-arsenal.ts"))) as {
        MaestroArsenal: { loadArsenal(): Promise<unknown> }
      }
      await core.MaestroArsenal.loadArsenal()
      expect(processRunner()).toBeDefined()
      const out = await runProcess(
        [process.execPath, "-e", "process.stdout.write('via omni')"],
        context.directory,
        context,
      )
      expect(out.stdout).toBe("via omni")
      const big = [process.execPath, "-e", `process.stdout.write("x".repeat(${PROCESS_BYTES + 1}))`]
      await expect(processBytes(context, context.directory, big)).rejects.toThrow("PROCESS_OUTPUT_OVERFLOW")
    },
    30_000,
  )
})
