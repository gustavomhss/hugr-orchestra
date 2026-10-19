import { expect } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { FSUtil } from "@orchestra/core/fs-util"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Plugin } from "@/plugin"
import { MessageID, SessionID } from "@/session/schema"
import { ShellTool } from "@/tool/shell"
import { Truncate } from "@/tool/truncate"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([
  CrossSpawnSpawner.node, FSUtil.node, Plugin.node, Truncate.node, Config.node, Agent.node, RuntimeFlags.node,
])))

it.instance("shell emits intermediate metadata before a real child can complete", () =>
  Effect.gen(function* () {
    const instance = yield* TestInstance
    const ready = path.join(instance.directory, "progress-ready")
    const script = path.join(instance.directory, "progress.cjs")
    // The child cannot emit second/exit until a live metadata callback releases it.
    // Padding releases first from the scanner's cross-chunk secret quarantine.
    yield* Effect.promise(() => Bun.write(script, `
      process.stdout.write("first" + "x".repeat(80));
      const timer = setInterval(() => {
        if (!require("fs").existsSync(${JSON.stringify(ready)})) return;
        clearInterval(timer);
        process.stdout.write("second");
      }, 10);
    `))
    const updates: string[] = []
    const tool = yield* ShellTool
    const definition = yield* tool.init()
    const result = yield* definition.execute({
      command: `"${process.execPath.replaceAll("\\", "/")}" "${script.replaceAll("\\", "/")}"`,
      timeout: 2000,
    }, {
      sessionID: SessionID.make("ses_shell_progress"),
      messageID: MessageID.make("msg_shell_progress"),
      callID: "shell-progress",
      agent: "maestro",
      abort: new AbortController().signal,
      messages: [],
      ask: () => Effect.void,
      metadata: (input) => Effect.promise(async () => {
        const output = input.metadata?.output
        if (typeof output !== "string" || !output) return
        updates.push(output)
        if (output.includes("first") && !output.includes("second")) await Bun.write(ready, "released by live metadata")
      }),
    })
    expect(result.metadata.exit).toBe(0)
    expect(result.output).toContain("first")
    expect(result.output).toContain("second")
    expect(updates.some((output) => output.includes("first") && !output.includes("second"))).toBe(true)
    expect(updates.length).toBeGreaterThan(1)
    expect(yield* Effect.promise(() => Bun.file(ready).text())).toBe("released by live metadata")
  }),
  { config: { shell: process.platform === "win32" ? process.env.COMSPEC ?? "cmd.exe" : "/bin/sh" } },
  10_000,
)
