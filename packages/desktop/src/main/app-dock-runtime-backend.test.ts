import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import type { Backend, Helper, Metadata, Workspace } from "./app-dock-runtime-backend"
import { AppDockRuntime } from "./app-dock-runtime"
import { rejection } from "./rejection.fixture"

const owner = "11dc45b7-3ed8-40ea-a56e-232a1c39f381"
const pinned = "a".repeat(64)
const foreign = "d".repeat(64)
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

// The runtime only sees the Backend interface; this fake records every guest-facing call.
async function fixture(input: { pin?: string; workspace?: Workspace } = {}) {
  const root = await mkdtemp(join(tmpdir(), "orchestra-runtime-backend-"))
  roots.push(root)
  const metadata: Metadata = {
    version: 1, owner, password: "b".repeat(64), dockerContext: "fake", endpoint: "unix:///fake/docker.sock",
    ...(input.pin === undefined ? {} : { containerID: input.pin }),
  }
  await writeFile(join(root, "metadata.json"), JSON.stringify(metadata), { mode: 0o600 })
  const calls: string[] = []
  const helpers: Array<Helper & { reaped: number }> = []
  const state = {
    workspace: "workspace" in input ? input.workspace : running(pinned),
    terminate: async () => {},
    copy: async () => {},
    exec: async (_command: { argv: string[]; timeout?: number }) => {},
  }
  const backend: Backend = {
    locate: async (saved) => {
      if (!saved) throw new Error("fixture always has saved metadata")
      return { dockerContext: saved.dockerContext, endpoint: saved.endpoint }
    },
    sandbox: async () => ({ path: "/fake/seccomp.json", value: {} }),
    find: async () => state.workspace && { ...state.workspace },
    ensureImage: async () => {
      calls.push("ensureImage")
      return "image"
    },
    ensureHome: async () => {
      calls.push("ensureHome")
    },
    create: async () => {
      calls.push("create")
      return pinned
    },
    start: async (_metadata, workspace) => {
      calls.push(`start ${workspace.id}`)
    },
    stop: async (_metadata, workspace) => {
      calls.push(`stop ${workspace.id}`)
      if (state.workspace) state.workspace = { ...state.workspace, running: false }
    },
    exec: async (_metadata, workspace, command) => {
      calls.push(`exec ${command.user} ${workspace.id} ${command.argv.join(" ")}`)
      await state.exec(command)
      if (command.argv.at(-1) === "list") return { stdout: JSON.stringify([{ id: "x.desktop", name: "X" }]), stderr: "" }
      if (command.argv.at(-1) === "native-session")
        return { stdout: JSON.stringify({ sessionID: "session", processIdentity: {}, environment: {} }), stderr: "" }
      return { stdout: "{}", stderr: "" }
    },
    copy: async (_metadata, workspace, source, target) => {
      await state.copy()
      calls.push(`copy ${basename(source)} ${workspace.id}:${target}`)
    },
    command: () => {
      throw new Error("no long-lived process in these tests")
    },
    helper: async () => {
      const helper = {
        id: `helper-${helpers.length}`,
        client: { hello: undefined as never, request: async () => null, close: async () => {} },
        channel: { write: async () => {}, onData: () => () => {}, onExit: () => () => {}, terminate: () => state.terminate() },
        payload: { files: [], sha256: "" },
        active: () => true,
        reaped: 0,
        reap: async () => {
          helper.reaped++
        },
      }
      helpers.push(helper)
      return helper
    },
    close: () => {},
  }
  const runtime = AppDockRuntime.create({
    root, context: resolve("resources/linux-runtime"), nativePayload: join(root, "payload"), backend,
  })
  return { calls, helpers, state, runtime }
}

function running(id: string): Workspace {
  return { id, image: `sha256:${"c".repeat(64)}`, running: true, startedAt: "2026-10-05T00:00:00Z", viewerPort: "40000" }
}

test("never re-creates a workspace whose pinned ID is gone", async () => {
  const f = await fixture({ pin: pinned, workspace: undefined })

  expect(await rejection(f.runtime.start())).toMatchObject({ code: "failed" })
  expect(f.calls).toEqual([])
})

test("never copies or executes into a workspace the backend reports under a different ID than the pin", async () => {
  const f = await fixture({ pin: pinned, workspace: running(foreign) })

  // Terminal access provisions its helper with direct copy/exec, not through the guest helper path.
  expect(await rejection(f.runtime.access.run({ argv: ["true"] }))).toMatchObject({ code: "failed" })
  expect((await f.runtime.state()).phase).toBe("error")
  expect(f.calls).toEqual([])
})

test("never runs the workspace helper before the workspace ID is pinned", async () => {
  const f = await fixture({ workspace: running(pinned) })

  expect((await f.runtime.state()).phase).toBe("error")
  expect(f.calls.filter((call) => call.startsWith("exec"))).toEqual([])
})

test("a helper whose channel cannot terminate is reaped through the backend before the next admission", async () => {
  const f = await fixture({ pin: pinned })
  const first = await f.runtime.native()
  first.active = () => false
  f.state.terminate = () => Promise.reject(new Error("cleanup deadline missed"))

  const next = await f.runtime.native()
  expect(next).not.toBe(first)
  expect(f.helpers.map((helper) => helper.reaped)).toEqual([1, 0])

  f.state.terminate = async () => {}
  await f.runtime.dispose()
  expect(f.helpers.map((helper) => helper.reaped)).toEqual([1, 0])
})

test("a workspace left running by an earlier app session gets the current workspace.py before its first helper exec", async () => {
  const f = await fixture({ pin: pinned })

  expect((await f.runtime.state()).phase).toBe("ready")
  await f.runtime.launch("x.desktop")
  expect(f.calls.filter((call) => call.includes("workspace.py"))).toEqual([
    `copy workspace.py ${pinned}:/opt/orchestra/workspace.py`,
    `exec root ${pinned} chown 0:0 /opt/orchestra/workspace.py`,
    `exec root ${pinned} chmod 0644 /opt/orchestra/workspace.py`,
    `exec dock ${pinned} python3 /opt/orchestra/workspace.py list`,
    `exec dock ${pinned} python3 /opt/orchestra/workspace.py launch x.desktop`,
  ])
})

test("a failed workspace.py refresh blocks the helper exec and is retried on the next use", async () => {
  const f = await fixture({ pin: pinned })
  f.state.copy = () => Promise.reject(new Error("copy failed"))

  expect((await f.runtime.state()).phase).toBe("error")
  expect(f.calls).toEqual([])
  f.state.copy = async () => {}
  expect((await f.runtime.state()).phase).toBe("ready")
  expect(f.calls).toEqual([
    `copy workspace.py ${pinned}:/opt/orchestra/workspace.py`,
    `exec root ${pinned} chown 0:0 /opt/orchestra/workspace.py`,
    `exec root ${pinned} chmod 0644 /opt/orchestra/workspace.py`,
    `exec dock ${pinned} python3 /opt/orchestra/workspace.py list`,
  ])
})

test("stop records the open apps, with the current helper, before it stops the workspace", async () => {
  const f = await fixture({ pin: pinned })
  const timeouts: Array<number | undefined> = []
  f.state.exec = async (command) => {
    if (command.argv.at(-1) === "remember") timeouts.push(command.timeout)
  }

  await f.runtime.stop()
  expect(f.calls).toEqual([
    `copy workspace.py ${pinned}:/opt/orchestra/workspace.py`,
    `exec root ${pinned} chown 0:0 /opt/orchestra/workspace.py`,
    `exec root ${pinned} chmod 0644 /opt/orchestra/workspace.py`,
    `exec dock ${pinned} python3 /opt/orchestra/workspace.py remember`,
    `stop ${pinned}`,
  ])
  expect(timeouts).toEqual([3_000])
  expect((await f.runtime.state()).phase).toBe("stopped")
})

test("a failing or hanging remember still stops the workspace within its bound", async () => {
  for (const remember of [
    () => Promise.reject(new Error("remember failed")),
    () => new Promise<void>(() => {}),
  ]) {
    const f = await fixture({ pin: pinned })
    f.state.exec = async (command) => {
      if (command.argv.at(-1) === "remember") await remember()
    }
    const started = performance.now()

    await f.runtime.stop()
    expect(performance.now() - started).toBeLessThan(4_500)
    expect(f.calls.at(-1)).toBe(`stop ${pinned}`)
    expect((await f.runtime.state()).phase).toBe("stopped")
  }
}, 15_000)

test("a remember that cannot refresh the helper still stops the workspace", async () => {
  const f = await fixture({ pin: pinned })
  f.state.copy = () => new Promise<void>(() => {})

  await f.runtime.stop()
  expect(f.calls).toEqual([`stop ${pinned}`])
  expect((await f.runtime.state()).phase).toBe("stopped")
}, 10_000)
