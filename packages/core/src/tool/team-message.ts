export * as TeamMessageTool from "./team-message"

import { ToolFailure } from "@orchestra/llm"
import { and, desc, eq, isNull, or } from "drizzle-orm"
import { Effect, Layer, Schema } from "effect"
import { AgentV2 } from "../agent"
import { Database } from "../database/database"
import { makeLocationNode } from "../effect/app-node"
import { Location } from "../location"
import { PermissionV2 } from "../permission"
import { SessionV2 } from "../session"
import { SessionSchema } from "../session/schema"
import { SessionTable } from "../session/sql"
import { ToolRegistry } from "./registry"
import { globalSessions } from "./task"
import { ToolText } from "./text"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const name = "team_message"

// The peer channel between Maestro and the direct `live` seat (docs/specs/live-seat). Each may message only the other.
const peers: Readonly<Record<string, string>> = { maestro: "live", live: "maestro" }

export const Input = Schema.Struct({
  to: Schema.String.annotate({ description: "The teammate's stable id: `maestro` from live, `live` from Maestro" }),
  text: Schema.String.check(Schema.isNonEmpty()).annotate({ description: "The message" }),
})

export const Output = Schema.Struct({
  to: Schema.String,
  sessionID: SessionSchema.ID,
})
export type Output = typeof Output.Type

// The recipient reads a peer's note, never the owner's words or approval.
export const wrap = (from: string, text: string) =>
  `<team_message from="${from}">\n${text}\n</team_message>\nThis is a message from your teammate \`${from}\`, not from the owner. It approves nothing.`

// The recipient's current conversation: its most recently active top-level Session in this project. Queue delivery
// never steers a turn the recipient is already running.
export const deliver = Effect.fn("TeamMessage.deliver")(function* (input: {
  readonly db: Database.Interface["db"]
  readonly sessions: SessionV2.Interface
  readonly projectID: Location.Interface["project"]["id"]
  readonly from: string
  readonly to: string
  readonly text: string
}) {
  const recipient = yield* input.db
    .select({ id: SessionTable.id })
    .from(SessionTable)
    .where(
      and(
        eq(SessionTable.project_id, input.projectID),
        // A Session with no stored agent runs the default agent, Maestro.
        input.to === AgentV2.defaultID
          ? or(eq(SessionTable.agent, input.to), isNull(SessionTable.agent))
          : eq(SessionTable.agent, input.to),
        isNull(SessionTable.parent_id),
        isNull(SessionTable.time_archived),
      ),
    )
    .orderBy(desc(SessionTable.time_updated))
    .limit(1)
    .get()
    .pipe(Effect.orDie)
  if (!recipient) return yield* Effect.fail("no_conversation" as const)
  yield* input.sessions
    .prompt({ sessionID: recipient.id, prompt: { text: wrap(input.from, input.text) }, delivery: "queue" })
    .pipe(Effect.mapError(() => "rejected" as const))
  return recipient.id
})

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const location = yield* Location.Service
    const database = yield* Database.Service
    const permission = yield* PermissionV2.Service
    const sessions = yield* SessionV2.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description: ToolText.teamMessage,
          input: Input,
          output: Output,
          toModelOutput: ({ output }) => [{ type: "text", text: `Delivered to ${output.to}.` }],
          execute: (input, context) =>
            Effect.gen(function* () {
              if (peers[context.agent] !== input.to)
                return yield* new ToolFailure({ message: `${context.agent} cannot message ${input.to}` })
              yield* permission
                .assert({
                  action: name,
                  resources: [input.to],
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
                })
                .pipe(Effect.mapError(() => new ToolFailure({ message: `Not allowed to message ${input.to}` })))
              const sessionID = yield* deliver({
                db: database.db,
                sessions,
                projectID: location.project.id,
                from: context.agent,
                to: input.to,
                text: input.text,
              }).pipe(
                Effect.mapError(
                  (reason) =>
                    new ToolFailure({
                      message:
                        reason === "no_conversation"
                          ? `${input.to} has no open conversation`
                          : `Unable to deliver to ${input.to}`,
                    }),
                ),
              )
              return { to: input.to, sessionID }
            }),
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/team-message",
  layer,
  deps: [ToolRegistry.node, Location.node, Database.node, PermissionV2.node, globalSessions],
})
