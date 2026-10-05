import { expect } from "bun:test"
import { Effect } from "effect"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetyCommands } from "../src/tool-safety-commands"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))

for (const [command, action] of [["git push", "push"], ["npm publish", "publish"], ["fly deploy", "deploy"], ["rm ./fixture", "delete"]]) {
  it.live(`askBefore actual ${command} reaches ${action} request seam and fails closed unbound`, () =>
    Effect.gen(function* () {
      const safety = yield* ToolSafety.make
      const requests: string[] = []
      const invocation = { tool: "bash", args: { command, approved: true }, sessionID: "session", callID: command,
        directory: process.cwd(), projectID: "project" }
      yield* safety.before(invocation).pipe(
        Effect.provideService(ToolSafety.RuntimeProfile, { askBefore: [action] }),
        Effect.provideService(ToolSafety.NativeHost, { ask: (request) => Effect.sync(() => { requests.push(request.action) }) }),
      )
      expect(requests.at(-1)).toBe(action)
      const denied = yield* Effect.flip(safety.before(invocation).pipe(
        Effect.provideService(ToolSafety.RuntimeProfile, { askBefore: [action] }),
      ))
      expect(denied.reason).toBe("ask-before-native-binding-missing")
      expect(requests).toEqual([action])
    }),
  )
}

it.live("closed action forms preserve existing vocabulary and ordinary command control", () =>
  Effect.sync(() => {
    expect(ToolSafetyCommands.actions("git push; git commit; git merge; gh release create; rm ../fixture")).toEqual([
      "push", "commit", "merge", "release", "delete", "removeexternal",
    ])
    expect(ToolSafetyCommands.actions("npm publish")).toEqual(["release", "publish"])
    expect(ToolSafetyCommands.actions("printf ordinary")).toEqual([])
  }),
)
