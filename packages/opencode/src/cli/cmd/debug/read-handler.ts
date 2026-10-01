import { Cause, Effect } from "effect"
import { SessionID, MessageID } from "../../../session/schema"
import { ReadTool } from "../../../tool/read"
import { Tool } from "../../../tool/tool"
import { Session } from "../../../session/session"

export const debugRead = (args: { params?: string; metaOnly?: boolean }): Effect.Effect<{ ms: number }, never, any> =>
  Effect.scoped(
    Effect.gen(function* () {
      const read = yield* ReadTool
      const def = yield* read.init()

      // Minimal tool context: a throwaway session + a synthetic user message so
      // instruction resolution and metadata callbacks behave like a real turn.
      const sessionSvc = yield* Session.Service
      const session = yield* sessionSvc.create({ title: "Debug read benchmark" })
      yield* Effect.addFinalizer(() => sessionSvc.remove(session.id).pipe(Effect.catchCause(() => Effect.void)))
      const messageID = MessageID.ascending()
      const ctx: Tool.Context = {
        sessionID: session.id,
        messageID,
        callID: "read-bench",
        agent: "build",
        abort: new AbortController().signal,
        messages: [],
        metadata: (val) => Effect.void,
        ask: () => Effect.void,
      }

      const emit = (payload: object): Effect.Effect<void, never, never> =>
        Effect.promise<void>(
          () =>
            new Promise((resolve) => {
              process.stdout.write(`${JSON.stringify(payload)}\n`, () => resolve())
            }),
        )

      const params = parseParams(args.params)
      const jobs: ReadonlyArray<Record<string, unknown>> = Array.isArray(params) ? params : [params]

      let total = 0
      for (let i = 0; i < jobs.length; i++) {
        const jobParams = jobs[i]
        const before = Date.now()
        const exit = yield* def.execute(jobParams as never, ctx).pipe(
          Effect.map((result) => ({ ok: true as const, result, ms: Date.now() - before })),
          Effect.catchCause((cause) =>
            Effect.succeed({ ok: false as const, error: String(Cause.squash(cause)), ms: Date.now() - before }),
          ),
        )
        if ("error" in exit) {
          total += exit.ms
          yield* emit({ run_index: i, tool: "read", params: jobParams, ok: false, ms: exit.ms, error: exit.error })
          continue
        }
        total += exit.ms
        const out: Record<string, unknown> = {
          run_index: i,
          tool: "read",
          params: jobParams,
          ms: exit.ms,
          title: exit.result.title,
          metadata: exit.result.metadata,
        }
        if (args.metaOnly) {
          out.output_chars = (exit.result.output ?? "").length
        } else {
          out.output = exit.result.output
        }
        yield* emit(out)
      }
      return { ms: total }
    }),
  )

function parseParams(input?: string) {
  if (!input) return {}
  const trimmed = input.trim()
  if (trimmed.length === 0) return {}
  let parsed: unknown
  const jsonError: unknown = iife(() => {
    try {
      parsed = JSON.parse(trimmed)
      return undefined
    } catch (e) {
      return e
    }
  })
  if (jsonError !== undefined) throw new Error(`Failed to parse params as JSON: ${String(jsonError)}.`)
  if (!parsed || (typeof parsed !== "object" && !Array.isArray(parsed))) {
    throw new Error("Tool params must be an object or an array of objects.")
  }
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new Error("Every element of the params array must be an object.")
      }
    }
  }
  return parsed as Record<string, unknown>
}

const iife = <T>(fn: () => T): T => fn()
