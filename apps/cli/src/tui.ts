import { run } from "@orchestra/tui"
import { TuiConfig } from "@orchestra/tui/config"
import { Effect } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Global } from "@orchestra/core/global"

export function runTui(transport: { url: string; headers: RequestInit["headers"] }) {
  const config = TuiConfig.resolve({}, { terminalSuspend: false })
  return run({
    ...transport,
    args: {},
    config,
    pluginHost: {
      async start() {},
      async dispose() {},
    },
  }).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
