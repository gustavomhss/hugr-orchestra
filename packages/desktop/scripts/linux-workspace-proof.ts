import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises"
import { join, resolve } from "node:path"
import { tmpdir } from "node:os"
import { MessageChannel } from "node:worker_threads"
import { AppDockRuntime } from "../src/main/app-dock-runtime"
import { LinuxWorkspaceFiles } from "../src/main/linux-workspace-files"
import { LinuxWorkspaceRPC } from "../src/main/linux-workspace-rpc"
import { createLinuxWorkspaceHooks } from "../../orchestra/src/plugin/linux-workspace"
import type { ToolContext } from "@orchestra/plugin"

const root = process.env.APP_DOCK_ACCESS_ROOT
assert(root, "APP_DOCK_ACCESS_ROOT must select an existing owned workspace")
const context = resolve("resources/linux-runtime")
const runtime = AppDockRuntime.create({ root, context })
const files = LinuxWorkspaceFiles.create(runtime.access)
const directory = `/home/dock/.access-proof-${randomUUID()}`
const owner = `proof-${randomUUID()}`
const scope = process.env.APP_DOCK_ACCESS_PROOF_SCOPE ?? "full"
assert(["full", "file", "pty"].includes(scope), "Unknown proof scope")
const metadata = JSON.parse(await readFile(join(root, "metadata.json"), "utf8")) as {
  containerID: string
  password: string
}
const receipt: Record<string, unknown> = { containerID: metadata.containerID }
const invoke = async (argv: string[], stdin?: string) => {
  const result = await runtime.access.run({ argv, stdin })
  assert.equal(result.exitCode, 0, "Guest command failed")
  assert(!result.cancelled && !result.timedOut)
  return result.stdout
}
const sessions = new Set<string>()
try {
  assert.equal((await invoke(["uname", "-s"])).trim(), "Linux")
  const environment = JSON.parse(
    await invoke([
      "python3",
      "-c",
      "import os,json; print(json.dumps({'uid':os.getuid(),'cwd':os.getcwd(),'display':bool(os.environ.get('DISPLAY')),'dbus':bool(os.environ.get('DBUS_SESSION_BUS_ADDRESS')),'password': 'APP_DOCK_RUNTIME_PASSWORD' in os.environ}))",
    ]),
  )
  assert.deepEqual(environment, { uid: 10001, cwd: "/home/dock", display: true, dbus: true, password: false })
  const before = await invoke([
    "python3",
    "-c",
    "import json;from pathlib import Path;print(json.dumps(sorted(p.name for p in Path('/proc').glob('[0-9]*') if (p/'comm').exists() and (p/'comm').read_text().strip() in ['slack','Xorg','Xvfb'])))",
  ])
  await invoke(["mkdir", directory])
  if (scope !== "pty") {
    const binary = Buffer.from([0, 255, 128, 10, 13, 0, 195, 169])
    await files.write(`${directory}/binary`, binary.toString("base64"), "base64")
    const direct = await invoke([
      "python3",
      "-c",
      "import base64,sys;print(base64.b64encode(open(sys.argv[1],'rb').read()).decode())",
      `${directory}/binary`,
    ])
    assert.equal(direct.trim(), binary.toString("base64"), "Actual guest bytes differ from write result")
    assert.deepEqual(await files.read(`${directory}/binary`, 2, 3, "base64"), {
      data: binary.subarray(2, 5).toString("base64"),
      encoding: "base64",
      offset: 2,
      nextOffset: 5,
      size: binary.length,
      eof: false,
    })
    const text = "Olá Linux 🧪\n"
    await files.write(`${directory}/text`, text)
    assert.equal(await invoke(["cat", `${directory}/text`]), text)
    const listed = (await files.list(directory)) as { entries: Array<{ name: string }> }
    assert.deepEqual(listed.entries.map((entry) => entry.name).sort(), ["binary", "text"])
    const nonzero = await runtime.access.run({ argv: ["/bin/bash", "-lc", "printf out; printf err >&2; exit 7"] })
    assert.equal(nonzero.stdout, "out")
    assert.equal(nonzero.stderr, "err")
    assert.equal(nonzero.exitCode, 7)
    assert.equal(await invoke(["cat"], text), text)
    receipt.commands = {
      linux: true,
      environment,
      binary: true,
      unicode: true,
      stdin: true,
      separateStreams: true,
      exitCode: 7,
    }
  }

  if (scope === "full") {
    const controller = new AbortController()
    const pidFile = `${directory}/cancel-pid`
    const pending = runtime.access.run(
      {
        argv: [
          "python3",
          "-c",
          "import os,sys,time;open(sys.argv[1],'w').write(str(os.getpid()));time.sleep(60)",
          pidFile,
        ],
      },
      { signal: controller.signal },
    )
    const deadline = Date.now() + 15000
    const readPID = async (): Promise<number> => {
      const read = await runtime.access.run({ argv: ["cat", pidFile] })
      if (read.exitCode === 0) return Number(read.stdout)
      assert(Date.now() < deadline, "Cancellation child never started")
      await new Promise((resolve) => setTimeout(resolve, 50))
      return readPID()
    }
    const pid = await readPID()
    assert(pid > 0)
    controller.abort()
    const cancelled = await pending
    assert(cancelled.cancelled)
    assert.equal(
      (
        await invoke(["python3", "-c", "import os,sys;print(os.path.exists('/proc/'+sys.argv[1]))", String(pid)])
      ).trim(),
      "False",
      "Cancelled guest child survived",
    )
    const timed = await runtime.access.run({ argv: ["sleep", "30"], timeoutMs: 100 })
    assert(timed.timedOut && timed.exitCode !== 0)
    const large = await runtime.access.run({ argv: ["python3", "-c", "import sys;sys.stdout.write('x'*1100000)"] })
    assert.equal(large.stdout.length, 1024 * 1024)
    assert(large.truncated)
    receipt.lifecycle = { cancelledChildReaped: true, timeout: true, boundedOutput: true }
  }

  if (scope !== "file") {
    const tty = await runtime.access.open(owner, undefined, 100, 30)
    sessions.add(tty.terminalID)
    await assert.rejects(runtime.access.read("other-session", tty.terminalID), /terminal-not-found/)
    await runtime.access.write(owner, tty.terminalID, "stty -echo\n")
    await new Promise((resolve) => setTimeout(resolve, 250))
    await runtime.access.read(owner, tty.terminalID)
    await runtime.access.write(owner, tty.terminalID, "printf '\\nTTY_BEGIN\\n'; stty size; printf 'TTY_END\\n'\n")
    const waitTTY = async (expression: RegExp) => {
      const state = { text: "", deadline: Date.now() + 10000 }
      while (!expression.test(state.text)) {
        const part = await runtime.access.read(owner, tty.terminalID)
        state.text += part.data
        assert(Date.now() < state.deadline, `PTY postcondition missing: ${expression}`)
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      return state.text
    }
    assert.match(await waitTTY(/^TTY_END\r?$/m), /\r?\n30 100\r?\n/)
    await runtime.access.resize(owner, tty.terminalID, 91, 17)
    await runtime.access.write(
      owner,
      tty.terminalID,
      "printf '\\nRESIZE_BEGIN\\n'; stty size; printf 'RESIZE_END\\n'\n",
    )
    assert.match(await waitTTY(/^RESIZE_END\r?$/m), /\r?\n17 91\r?\n/)
    await runtime.access.write(owner, tty.terminalID, "sleep 30\n")
    await new Promise((resolve) => setTimeout(resolve, 200))
    await runtime.access.write(owner, tty.terminalID, "\u0003")
    await runtime.access.write(owner, tty.terminalID, "printf '\\nAFTER_INTERRUPT\\n'\n")
    await waitTTY(/\r?\nAFTER_INTERRUPT\r?\n/)
    await runtime.access.closeTerminal(owner, tty.terminalID)
    sessions.delete(tty.terminalID)
    receipt.pty = { actualGuestTTY: true, resize: true, ctrlC: true, foreignSessionRejected: true, closed: true }
  }

  if (scope === "full") {
    LinuxWorkspaceRPC.register(runtime.access)
    const channel = new MessageChannel()
    const listeners: Array<(event: { data: unknown }) => void> = []
    channel.port1.on("message", (data) => listeners.forEach((listener) => listener({ data })))
    channel.port2.on("message", (message) =>
      LinuxWorkspaceRPC.handle(message, (response) => channel.port2.postMessage(response)),
    )
    const hooks = createLinuxWorkspaceHooks({
      postMessage: (message) => channel.port1.postMessage(message),
      on: (_event, listener) => {
        listeners.push(listener)
      },
    })
    const permissions: string[] = []
    const toolContext: ToolContext = {
      sessionID: owner,
      messageID: "proof",
      agent: "proof",
      directory: "/host-only",
      worktree: "/host-only",
      abort: new AbortController().signal,
      metadata: () => undefined,
      ask: async (request) => {
        assert.equal(request.permission, "linux")
        permissions.push(...request.patterns)
      },
    }
    try {
      assert(hooks.tool?.linux_exec && hooks.tool.linux_write && hooks.tool.linux_read)
      const result = await hooks.tool.linux_exec.execute({ argv: ["pwd"] }, toolContext)
      assert.equal(typeof result, "string")
      assert.equal(JSON.parse(result as string).stdout.trim(), "/home/dock")
      const denied = await hooks.tool.linux_exec.execute(
        { argv: ["touch", `${directory}/must-not-exist`] },
        {
          ...toolContext,
          ask: async () => {
            throw new Error("permission-denied")
          },
        },
      )
      assert.match(String(denied), /permission-denied/)
      const checked = await runtime.access.run({ argv: ["test", "-e", `${directory}/must-not-exist`] })
      assert.equal(checked.exitCode, 1)
      assert(hooks.tool.linux_terminal_open && hooks.event)
      const opened = await hooks.tool.linux_terminal_open.execute({ cwd: directory }, toolContext)
      const terminalID = JSON.parse(String(opened)).terminalID as string
      assert(terminalID)
      const alive = await runtime.access.read(owner, terminalID)
      assert(alive.running)
      const closed = Promise.withResolvers<void>()
      const listener = (event: { data: unknown }) => {
        const value = event.data
        if (value && typeof value === "object" && "type" in value && value.type === "linux.session.closed") {
          assert("ok" in value && value.ok === true)
          closed.resolve()
        }
      }
      listeners.push(listener)
      await hooks.event({
        event: {
          type: "session.deleted",
          properties: {
            info: {
              id: owner,
              slug: "proof",
              projectID: "proof",
              directory: "/host-only",
              title: "proof",
              version: "1.18.27",
              time: { created: 0, updated: 0 },
            },
          },
        },
      })
      const timer = setTimeout(() => closed.reject(new Error("Deleted session terminal was not reaped")), 30000)
      await closed.promise.finally(() => clearTimeout(timer))
      await assert.rejects(runtime.access.read(owner, terminalID), /terminal-not-found/)
      receipt.tools = {
        actualRegisteredDefinition: true,
        actualMessageChannel: true,
        mainRPC: true,
        guestExecution: true,
        permissions,
        deniedNotExecuted: true,
        deletedSessionTerminalReaped: true,
      }
    } finally {
      channel.port1.close()
      channel.port2.close()
    }
    const foreignRoot = await mkdtemp(join(tmpdir(), "orchestra/access-foreign-"))
    await writeFile(join(foreignRoot, "metadata.json"), JSON.stringify({ ...metadata, containerID: "0".repeat(64) }), {
      mode: 0o600,
    })
    await assert
      .rejects(
        AppDockRuntime.create({ root: foreignRoot, context }).access.run({
          argv: ["touch", `${directory}/foreign-must-not-exist`],
        }),
      )
      .finally(() => rm(foreignRoot, { recursive: true }))
    assert.equal(
      (await runtime.access.run({ argv: ["test", "-e", `${directory}/foreign-must-not-exist`] })).exitCode,
      1,
    )
    const after = await invoke([
      "python3",
      "-c",
      "import json;from pathlib import Path;print(json.dumps(sorted(p.name for p in Path('/proc').glob('[0-9]*') if (p/'comm').exists() and (p/'comm').read_text().strip() in ['slack','Xorg','Xvfb'])))",
    ])
    assert.equal(after, before, "Access changed existing GUI app/display PIDs")
    receipt.ownership = { foreignIdentityRejected: true, sameGuiPIDs: true }
  }
  assert(!JSON.stringify(receipt).includes(metadata.password))
  console.log(JSON.stringify({ status: "pass", scope, receipt }))
} finally {
  for (const id of sessions) await runtime.access.closeTerminal(owner, id)
  await invoke(["rm", "-rf", directory])
}
