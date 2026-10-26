import type { GlobalEvent, SessionMessage } from "../types"
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
  const asked = Demo_.user(context.text, { now, sequence: n })
  const append = (...messages: SessionMessage[]) =>
    context.sync.set("message", context.sessionID, (current) => [...(current ?? []), ...messages])
  if (command.type === "permission" || command.type === "question") {
    const request =
      command.type === "permission"
        ? Demo_.permission(context.sessionID, command.kind, n)
        : Demo_.question(context.sessionID, command.kind, n)
    const pending = Demo_.waitingMessage(
      {
        id: request.id,
        tool: command.type === "permission" ? Demo_.PERMISSION_TOOLS[command.kind] : "question",
        input: {},
        done: command.type === "permission" ? { title: command.kind, output: "Allowed" } : { title: "question", output: "" },
      },
      { now, sequence: n, cwd: context.cwd, agent: context.agent },
    )
    append(asked, pending.message)
    return context.sdk.event.emit("event", {
      directory: context.cwd,
      payload: {
        id: `${Demo_.PREFIX}evt_${n}`,
        type: `${command.type}.v2.asked`,
        data:
          command.type === "permission" ? { ...request, source: { type: "tool", ...pending.tool } } : { ...request, tool: pending.tool },
      },
    } as GlobalEvent)
  }
  append(asked, Demo_.message(command.kind, { now, sequence: n, cwd: context.cwd, agent: context.agent }))
}

export const Demo = { parse: Demo_.parse, run }
