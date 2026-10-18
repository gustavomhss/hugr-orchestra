import { expect, mock, test } from "bun:test"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Omni } from "@orchestra/core/omni"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"

// The same names as the other desktop tests' Electron mock: Bun keeps the first mock.module for the whole process.
const electron = {
  app: {},
  shell: {},
  session: { fromPartition: () => ({ setCertificateVerifyProc: () => undefined }) },
  WebContentsView: class {},
}
mock.module("electron", () => ({ ...electron, default: electron }))

const { OmniHost } = await import("./omni-host")

test.skipIf(process.platform !== "win32")("the desktop server's sandboxed shell commands launch through its omni supervisor in AppContainer mode", async () => {
  // spawnLocalServer forks the server's utilityProcess with this env; the server's loader then resolves its files.
  const env = OmniHost.sidecarEnv()
  expect(env.HUGR_OMNI_SUPERVISOR).toBeTruthy()
  expect(Omni.locate().supervisor).toBe(env.HUGR_OMNI_SUPERVISOR)
  const pwsh = Bun.which("pwsh")
  if (!pwsh) throw new Error("BLOCKED: pwsh unavailable")
  const directory = process.cwd()
  const command = await ToolSafetySandbox.wrap(ChildProcess.make(pwsh, ["-NoProfile", "-Command", "echo confined"], { cwd: directory })).pipe(
    Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true }),
    Effect.provideService(ToolSafety.NativeContext, { directory }),
    Effect.provide(LayerNode.compile(FSUtil.node)),
    Effect.scoped,
    Effect.runPromise,
  )
  if (command._tag !== "StandardCommand") throw new Error("expected one command")
  expect(command.command).toBe(env.HUGR_OMNI_SUPERVISOR)
  expect(command.args.slice(0, 1)).toEqual(["--appcontainer"])
  expect(command.args.slice(command.args.indexOf("--app"), command.args.indexOf("--app") + 2)).toEqual(["--app", pwsh])
})
