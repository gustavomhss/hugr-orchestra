import { describe, expect, test } from "bun:test"
import { SessionProcess } from "@orchestra/core/session-process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Effect } from "effect"
import { it } from "./lib/effect"

const layer = LayerNode.compile(SessionProcess.node)

describe("SessionProcess", () => {
  it.live("launches, lists, and cancels a background process", () =>
    Effect.gen(function* () {
      const processes = yield* SessionProcess.Service
      const sessionID = "ses_session_process_test"
      const launched = yield* processes.launch({ sessionID, command: "sleep 30", title: "sleep" })
      expect(launched.processID).toBe(launched.id)

      const listed = yield* processes.list(sessionID)
      expect(listed).toHaveLength(1)
      expect(listed[0]?.id).toBe(launched.id)

      const got = yield* processes.get(sessionID, launched.id)
      expect(got?.id).toBe(launched.id)

      const cancelled = yield* processes.cancel(sessionID, launched.id)
      expect(cancelled).toBe(true)
      expect(yield* processes.list(sessionID)).toHaveLength(0)

      yield* processes.stopSession(sessionID)
    }).pipe(Effect.provide(layer)),
  )
})
