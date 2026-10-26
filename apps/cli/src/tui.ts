import { run } from "@orchestra/tui"
import { TuiConfig } from "@orchestra/tui/config"
import { Effect } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { Global } from "@orchestra/core/global"

export function runTui(
  transport: { url: string; headers: RequestInit["headers"] },
  options: {
    args?: {
      continue?: boolean
      sessionID?: string
      fork?: boolean
      prompt?: string
      model?: string
      agent?: string
      variant?: string
      auto?: boolean
      mini?: boolean
      replay?: boolean
      replayLimit?: number
      demo?: boolean
    }
    directory?: string
  } = {},
) {
  const config = TuiConfig.resolve({}, { terminalSuspend: false })
  return run({
    ...transport,
    args: options.args ?? {},
    directory: options.directory,
    config,
    pluginHost: {
      async start() {},
      async dispose() {},
    },
  }).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
