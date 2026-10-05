import { describe, expect, test } from "bun:test"
import { Layer, Effect } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Session } from "../../src/session/session"
import { SessionReminders } from "../../src/session/reminders"

function messages(previousAgent?: string) {
  return [
    ...(previousAgent
      ? [
          {
            info: { id: "msg_assistant", role: "assistant", agent: previousAgent },
            parts: [],
          } as unknown as SessionV1.WithParts,
        ]
      : []),
    {
      info: { id: "msg_user", role: "user", sessionID: "ses_01" },
      parts: [],
    } as unknown as SessionV1.WithParts,
  ]
}

const layer = Layer.mergeAll(
  RuntimeFlags.layer({ experimentalPlanMode: false }),
  Layer.succeed(FSUtil.Service, {} as FSUtil.Interface),
  Layer.succeed(Session.Service, {} as Session.Interface),
)

describe("session.reminders", () => {
  test("uses stable build id when previous message used plan id", async () => {
    const result = await Effect.runPromise(
      SessionReminders.apply({
        messages: messages("plan"),
        agent: { id: "build", name: "Builder display", mode: "primary", permission: [], options: {} },
        session: {} as Session.Info,
      }).pipe(Effect.provide(layer)),
    )

    expect(result.at(-1)?.parts.some((part) => part.type === "text" && part.synthetic === true)).toBe(true)
  })

  test("uses stable plan id when display name differs", async () => {
    const result = await Effect.runPromise(
      SessionReminders.apply({
        messages: messages(),
        agent: { id: "plan", name: "Planner display", mode: "primary", permission: [], options: {} },
        session: {} as Session.Info,
      }).pipe(Effect.provide(layer)),
    )

    expect(result.at(-1)?.parts.some((part) => part.type === "text" && part.synthetic === true)).toBe(true)
  })
})
