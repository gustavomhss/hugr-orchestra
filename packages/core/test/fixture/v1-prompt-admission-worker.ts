import { Effect } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { PromptAdmission } from "@orchestra/core/v1/prompt-admission"
import { SessionV1 } from "@orchestra/core/v1/session"
import { layer, payload } from "./v1-prompt-admission"

const filename = process.argv[2]
const label = process.argv[3]
if (!filename || !label) throw new Error("Admission worker requires filename and label")

const result = await Effect.gen(function* () {
  const database = yield* Database.Service
  const events = yield* EventV2.Service
  const input = {
    ...payload,
    info: { ...payload.info, promptContext: { reminders: [label] } },
    parts: payload.parts.map((part) => ({ ...part, text: label })),
  }
  const notified: string[] = []
  yield* events.listen((event) =>
    Effect.sync(() => {
      notified.push(event.type)
    }),
  )
  // Both processes finish their preflight before either may publish.
  if (yield* PromptAdmission.reconcile(database.db, input)) return yield* Effect.die("Expected fresh admission")
  yield* Effect.sync(() => {
    process.stdout.write("ready\n")
  })
  yield* Effect.promise(() => Bun.stdin.text())
  const status = yield* events.publish(SessionV1.Event.PromptAdmitted, input).pipe(
    Effect.as("admitted"),
    Effect.catchDefect((defect) =>
      defect instanceof PromptAdmission.AlreadyAdmitted ? Effect.succeed("already") : Effect.die(defect),
    ),
  )
  const snapshot = yield* PromptAdmission.reconcile(database.db, input)
  if (!snapshot) return yield* Effect.die("Winning receipt missing")
  return { pid: process.pid, status, notified, snapshot }
}).pipe(Effect.scoped, Effect.provide(layer(filename)), Effect.runPromise)
process.stdout.write(JSON.stringify(result) + "\n")
