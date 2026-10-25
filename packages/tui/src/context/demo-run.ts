import type { GlobalEvent } from "../compat/schema"
import type { useSDK } from "./sdk"
import type { useSync } from "./sync"
import * as Demo_ from "./demo"

let sequence = 0

type Context = {
  readonly sessionID: string
  readonly text: string
  readonly agent: string
  readonly cwd: string
  readonly sync: ReturnType<typeof useSync>
  readonly sdk: ReturnType<typeof useSDK>
  readonly warn: (message: string) => void
}

/** Puts the output of one demo command on screen; nothing reaches a provider or the server. */
function run(command: Demo_.Command, context: Context) {
  if (command.type === "invalid") return context.warn(command.message)
  const n = ++sequence
  const now = Date.now()
  if (command.type === "permission" || command.type === "question") {
    const request =
      command.type === "permission"
        ? Demo_.permission(context.sessionID, command.kind, n)
        : Demo_.question(context.sessionID, command.kind, n)
    return context.sdk.event.emit("event", {
      directory: context.cwd,
      payload: { id: `${Demo_.PREFIX}evt_${n}`, type: `${command.type}.asked`, properties: request },
    } as GlobalEvent)
  }
  const asked = Demo_.user(context.sessionID, context.text, { now, sequence: n, agent: context.agent })
  const answer = Demo_.message(context.sessionID, asked.info.id, command.kind, { now, sequence: n, cwd: context.cwd, agent: context.agent })
  for (const item of [asked, answer]) {
    context.sync.set("message", context.sessionID, (messages) => [...(messages ?? []), item.info])
    context.sync.set("part", item.info.id, item.parts)
  }
}

export const Demo = { parse: Demo_.parse, run }
