// Process on both paths (WP3). Tree assertions use the nonce oracle and run only with the omni flag on: legacy kills
// the root alone, which is what omni fixes. Timing assertions bound a hang; they are not latency budgets.
import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import type { Readable } from "node:stream"
import { Readable as NodeReadable, Writable as NodeWritable } from "node:stream"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Process } from "@/util/process"
import { gone, reap, sweep, tree } from "../../../core/test/fixture/process-tree"
import { tmpdir } from "../fixture/fixture"

const mode = Flag.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER
const omni = mode !== "off"

function ready(stream: Readable | null, line: string) {
  return new Promise<void>((resolve, reject) => {
    if (!stream) return reject(new Error("no stdout"))
    let text = ""
    stream.on("data", (chunk: Buffer) => {
      text += chunk.toString()
      if (text.includes(line)) resolve()
    })
    stream.once("end", () => reject(new Error(`stdout ended before ${line}: ${text}`)))
  })
}

describe("util.process (omni)", () => {
  test.skipIf(!omni)(
    "abort stops the whole tree, grandchild included",
    async () => {
      const t = tree(2)
      try {
        const abort = new AbortController()
        const proc = Process.spawn([t.command, ...t.args], { stdout: "pipe", abort: abort.signal })
        await ready(proc.stdout, t.ready)
        abort.abort()
        expect(await proc.exited).not.toBe(0)
        expect(await gone(t.nonce)).toBe(0)
      } finally {
        await reap(t.nonce)
      }
    },
    30_000,
  )

  test.skipIf(!omni)(
    "run returns, bounded, when a grandchild holds the pipe after the root exits",
    async () => {
      const nonce = `omni-pipe-${crypto.randomUUID()}`
      const script = [
        `const cp = require("node:child_process")`,
        `cp.spawn(process.execPath, ["-e", "setInterval(() => {}, 1 << 30)", ${JSON.stringify(nonce)}], { stdio: ["ignore", "inherit", "inherit"] }).unref()`,
        `console.log("root done")`,
      ].join("\n")
      const started = Date.now()
      try {
        const out = await Process.run([process.execPath, "-e", script, nonce], { nothrow: true })
        expect(out.stdout.toString()).toContain("root done")
        expect(Date.now() - started).toBeLessThan(20_000)
        expect(await waitSweep(nonce)).toEqual([])
      } finally {
        for (const pid of await sweep(nonce)) process.kill(pid, "SIGKILL")
      }
    },
    30_000,
  )

  test("shell: the command line goes through the shell", async () => {
    const cmd = process.platform === "win32" ? "echo %OMNI_SHELL_TEST%" : 'echo "$OMNI_SHELL_TEST"'
    const out = await Process.run([cmd], { shell: true, env: { OMNI_SHELL_TEST: "via-shell" } })
    expect(out.code).toBe(0)
    expect(out.stdout.toString().trim()).toBe("via-shell")
  })

  test.skipIf(process.platform !== "win32")("shell: true on Windows hands cmd.exe the line verbatim", async () => {
    const out = await Process.run(["echo a&echo b"], { shell: true })
    expect(out.code).toBe(0)
    expect(out.stdout.toString().split(/\r?\n/).filter(Boolean)).toEqual(["a", "b"])
  })

  test("deadline stops a process that never exits", async () => {
    // Legacy stops the root only, and the tree's descendants would hold the pipes: it gets a lone process.
    const t = tree(omni ? 1 : 0)
    const started = Date.now()
    try {
      const out = await Process.run([t.command, ...t.args], { deadline: 1_000, nothrow: true })
      expect(out.code).not.toBe(0)
      expect(Date.now() - started).toBeLessThan(20_000)
      if (omni) expect(await gone(t.nonce)).toBe(0)
    } finally {
      await reap(t.nonce)
    }
  }, 30_000)

  test("deadline on spawn resolves exited", async () => {
    const proc = Process.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], { deadline: 500 })
    expect(await proc.exited).not.toBe(0)
  }, 20_000)

  test("streams are real node:stream objects, and stdin end() reaches the child", async () => {
    const proc = Process.spawn([process.execPath, "-e", "process.stdin.pipe(process.stdout)"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(proc.stdin).toBeInstanceOf(NodeWritable)
    expect(proc.stdout).toBeInstanceOf(NodeReadable)
    const chunks: Buffer[] = []
    proc.stdout!.on("data", (chunk: Buffer) => chunks.push(chunk))
    proc.stdin!.end("echoed through stdin")
    expect(await proc.exited).toBe(0)
    expect(Buffer.concat(chunks).toString()).toBe("echoed through stdin")
  }, 20_000)

  test.skipIf(process.platform === "win32")(
    "a file without execute permission rejects exited with EACCES",
    async () => {
      await using tmp = await tmpdir()
      const file = path.join(tmp.path, "not-executable")
      await fs.writeFile(file, "#!/bin/sh\nexit 0\n", { mode: 0o644 })
      const err = await Process.spawn([file]).exited.catch((error: unknown) => error)
      expect(err).toMatchObject({ code: "EACCES" })
    },
  )

  test("a missing command rejects exited with ENOENT and run with an Error, never a synchronous throw", async () => {
    const missing = `omni-missing-${crypto.randomUUID()}`
    const proc = Process.spawn([missing], { stdout: "pipe" })
    expect(await proc.exited.catch((error: unknown) => error)).toMatchObject({ code: "ENOENT" })
    const err = await Process.run([missing]).catch((error: unknown) => error)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).constructor.name).not.toBe("OmniError")
    expect((await Process.run([missing], { nothrow: true })).code).toBe(1)
  })

  test("abort surfaces as RunFailedError, or as a code with nothrow", async () => {
    const abort = new AbortController()
    setTimeout(() => abort.abort(), 50)
    const err = await Process.run([process.execPath, "-e", "setInterval(() => {}, 1000)"], {
      abort: abort.signal,
    }).catch((error: unknown) => error)
    expect(err).toBeInstanceOf(Process.RunFailedError)
  }, 20_000)

  test.skipIf(mode !== "strict")("strict refuses inherited stdio through exited, not a throw", async () => {
    const proc = Process.spawn([process.execPath, "-e", "0"], { stdout: "inherit" })
    expect(await proc.exited.catch((error: unknown) => error)).toMatchObject({ code: "EINVAL" })
  })
})

async function waitSweep(nonce: string) {
  const deadline = Date.now() + 20_000
  for (;;) {
    const pids = await sweep(nonce)
    if (pids.length === 0 || Date.now() > deadline) return pids
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}
