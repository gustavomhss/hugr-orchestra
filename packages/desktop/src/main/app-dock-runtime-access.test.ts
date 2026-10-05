import { expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { AppDockRuntime } from "./app-dock-runtime"

test("terminal access to an unconfigured workspace keeps its reason and does not mark the workspace failed", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestra-dock-access-"))
  const runtime = AppDockRuntime.create({ root, context: resolve("resources/linux-runtime") })
  await expect(runtime.access.run({ argv: ["true"] })).rejects.toThrow("workspace-not-configured")
  expect((await runtime.state()).phase).toBe("stopped")
  await runtime.dispose()
})
