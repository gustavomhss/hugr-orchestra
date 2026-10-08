import { BackgroundProcess } from "@/background/process"
import type { SessionID } from "@/session/schema"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { notFound } from "../errors"

export const sessionProcessHandlers = HttpApiBuilder.group(InstanceHttpApi, "sessionProcess", (handlers) =>
  Effect.gen(function* () {
    const processes = yield* BackgroundProcess.Service

    const list = Effect.fn("SessionProcessHttpApi.list")(function* (ctx: {
      params: { sessionID: SessionID }
      query: { tail?: number }
    }) {
      return (yield* processes.list(ctx.params.sessionID, ctx.query.tail)).map((item) => ({
        ...item,
        processes: item.processes.map((node) => ({
          pid: node.pid,
          ...(node.parentPid === null ? {} : { parentPid: node.parentPid }),
          ...(node.name === null ? {} : { name: node.name }),
        })),
      }))
    })

    const stop = Effect.fn("SessionProcessHttpApi.stop")(function* (ctx: {
      params: { sessionID: SessionID; processID: string }
    }) {
      if (yield* processes.stop(ctx.params.sessionID, ctx.params.processID)) return true
      return yield* Effect.fail(notFound(`Background process not found: ${ctx.params.processID}`))
    })

    return handlers.handle("list", list).handle("stop", stop)
  }),
)
