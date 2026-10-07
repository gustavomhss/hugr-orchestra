import { expect, test } from "bun:test"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { promisify } from "node:util"
import { AppDockRuntime } from "./app-dock-runtime"
import { NativeDockProtocol } from "./app-dock-native-protocol"

// Real Docker only. APP_DOCK_RUNTIME_TEST_IMAGE must carry the AT-SPI helper
// dependencies; APP_DOCK_RUNTIME_TEST_DEGRADED_IMAGE is the same image without
// the org.a11y.Bus D-Bus service, so accessibility activation fails at boot.
const exec = promisify(execFile)
const enabled = process.env.APP_DOCK_RUNTIME_INTEGRATION === "1"
const image = process.env.APP_DOCK_RUNTIME_TEST_IMAGE
const degradedImage = process.env.APP_DOCK_RUNTIME_TEST_DEGRADED_IMAGE
const context = resolve("resources/linux-runtime")
const nativePayload = resolve("resources/linux/app-dock-accessibility")
const label = "io.orchestra.app-dock"

test.skipIf(!enabled || !image)(
  "helper admission runs beside the workspace queue and concurrent callers share one helper",
  async () => {
    const fixture = await workspace(image!)
    try {
      await fixture.runtime.start()
      const owner = await fixture.owner()

      const admission = fixture.runtime.native()
      const first = await Promise.race([
        fixture.runtime.state().then((state) => state.phase),
        admission.then(() => "admission-settled-first", () => "admission-settled-first"),
      ])
      expect(first).toBe("ready")
      const native = await admission
      expect(native.active()).toBe(true)
      expect(await fixture.runtime.native()).toBe(native)
      expect(await helpers(owner)).toHaveLength(1)
      await fixture.runtime.stop()
      expect(await helpers(owner)).toEqual([])
    } finally {
      await fixture.remove()
    }
  },
  240_000,
)

test.skipIf(!enabled || !image)(
  "stop during a cold admission refuses it and leaves no helper behind",
  async () => {
    const fixture = await workspace(image!)
    try {
      await fixture.runtime.start()
      const owner = await fixture.owner()
      const interrupted = fixture.runtime.native().then(() => "admitted", (error: unknown) => error)
      await until(async () => (await helpers(owner)).length === 1)
      await fixture.runtime.stop()
      expect(await helpers(owner)).toEqual([])
      const outcome = await interrupted
      expect(outcome).toBeInstanceOf(NativeDockProtocol.NativeError)
      expect((await fixture.runtime.state()).phase).toBe("stopped")
    } finally {
      await fixture.remove()
    }
  },
  240_000,
)

test.skipIf(!enabled || !image)(
  "dispose during a cold admission waits for it and leaves no helper behind a running workspace",
  async () => {
    const fixture = await workspace(image!)
    try {
      await fixture.runtime.start()
      const owner = await fixture.owner()
      // Unlike stop(), dispose() keeps the workspace running, so the admission would otherwise succeed and publish.
      const admission = fixture.runtime.native().then(() => "admitted", (error: unknown) => error)
      await until(async () => (await helpers(owner)).length === 1)
      await fixture.runtime.dispose()
      expect(await helpers(owner)).toEqual([])
      const outcome = await admission
      // Refused either by the admission's own ownership recheck or after it, never published.
      expect(outcome).toBeInstanceOf(NativeDockProtocol.NativeError)
    } finally {
      await fixture.remove()
    }
  },
  240_000,
)

test.skipIf(!enabled || !image)(
  "a helper whose channel cleanup failed is reaped by ID instead of blocking later admissions",
  async () => {
    const fixture = await workspace(image!)
    try {
      await fixture.runtime.start()
      const owner = await fixture.owner()
      const stuck = await fixture.runtime.native()
      const [stuckID] = await helpers(owner)
      // Host load can push the channel past its cleanup deadline; the channel then keeps that failure forever.
      const failed = new NativeDockProtocol.NativeError("helper-termination-failed", "Native helper cleanup failed", "unknown")
      stuck.active = () => false
      stuck.client.close = () => Promise.reject(failed)
      stuck.channel.terminate = () => Promise.reject(failed)

      const next = await fixture.runtime.native()
      expect(next).not.toBe(stuck)
      expect(next.active()).toBe(true)
      const remaining = await helpers(owner)
      expect(remaining).toHaveLength(1)
      expect(remaining).not.toContain(stuckID)
      await fixture.runtime.stop()
      expect(await helpers(owner)).toEqual([])
    } finally {
      await fixture.remove()
    }
  },
  240_000,
)

test.skipIf(!enabled || !degradedImage)(
  "a session without accessibility still starts the workspace and refuses only native calls",
  async () => {
    const fixture = await workspace(degradedImage!)
    try {
      await fixture.runtime.start()
      const owner = await fixture.owner()
      const id = await fixture.container()
      const record = JSON.parse((await docker(["exec", "--user", "dock", id, "python3", "-c",
        "import json, runpy; s = runpy.run_path('/opt/orchestra/workspace.py'); r = s['current_session'](); "
        + "print(json.dumps({'keys': sorted(r), 'environment': sorted(s['session_environment']())}))"])).stdout) as {
        keys: string[]; environment: string[]
      }
      expect(record.keys).toContain("accessibilityError")
      expect(record.keys).not.toContain("AT_SPI_BUS_ADDRESS")
      expect(record.environment).toEqual(expect.arrayContaining(["DISPLAY", "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR"]))
      // The session supervisor went on to start the initial terminal.
      await until(async () => (await docker(["exec", id, "pgrep", "-x", "xterm"]).then(() => true, () => false)))

      const refused = await fixture.runtime.native().then(() => undefined, (error: unknown) => error)
      expect(refused).toBeInstanceOf(NativeDockProtocol.NativeError)
      expect((refused as NativeDockProtocol.NativeError).code).toBe("not-ready")
      expect(await helpers(owner)).toEqual([])
      expect((await fixture.runtime.state()).phase).toBe("ready")
      await fixture.runtime.stop()
    } finally {
      await fixture.remove()
    }
  },
  240_000,
)

async function workspace(selected: string) {
  const base = process.env.APP_DOCK_RUNTIME_TEST_TMP ?? join(tmpdir(), "opencode")
  await mkdir(base, { recursive: true })
  const root = await mkdtemp(join(base, "orchestra-dock-native-"))
  const runtime = AppDockRuntime.create({ root, context, image: selected, nativePayload })
  const metadata = async () =>
    JSON.parse(await readFile(join(root, "metadata.json"), "utf8")) as { owner: string; containerID: string }
  return {
    runtime,
    owner: async () => (await metadata()).owner,
    container: async () => (await metadata()).containerID,
    remove: async () => {
      await runtime.stop().catch(() => undefined)
      await runtime.dispose().catch(() => undefined)
      const found = await metadata().catch(() => undefined)
      if (!found) return
      for (const id of await helpers(found.owner)) await docker(["rm", "--force", id])
      await docker(["rm", "--force", found.containerID]).catch(() => undefined)
      await docker(["volume", "rm", `orchestra-linux-${found.owner}-home`]).catch(() => undefined)
    },
  }
}

async function helpers(owner: string) {
  const output = await docker(["ps", "--all", "--quiet", "--filter", `label=${label}.owner=${owner}`,
    "--filter", `label=${label}.kind=accessibility`])
  return output.stdout.split("\n").filter(Boolean)
}

async function until(condition: () => Promise<boolean>, deadline = Date.now() + 60_000): Promise<void> {
  if (await condition()) return
  if (Date.now() >= deadline) throw new Error("condition not reached")
  await Bun.sleep(100)
  return until(condition, deadline)
}

function docker(args: string[]) {
  return exec("docker", args, { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 })
}
