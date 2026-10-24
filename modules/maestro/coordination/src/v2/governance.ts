export * as MaestroGovernance from "./governance"

import { Context, Effect, Layer, Schema } from "effect"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { AgentV2 } from "@orchestra/core/agent"
import { SessionStore } from "@orchestra/core/session/store"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionInput } from "@orchestra/core/session/input"
import { PermissionV2 } from "@orchestra/core/permission"
import { Location } from "@orchestra/core/location"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { Database } from "@orchestra/core/database/database"
import { makeLocationNode } from "@orchestra/core/effect/app-node"
import type { Tool } from "@orchestra/core/tool/tool"
import { ToolFailure } from "@orchestra/llm"

export interface MaestroAdmission extends TaskGovernance.Admission {
  readonly reservationID?: string
  readonly writeRoots?: readonly string[]
  readonly taskPriority?: "normal" | "high" | "low"
}

const GovernanceInput = Schema.Struct({
  ...TaskGovernance.GovernanceInputSchema.fields,
  taskPriority: Schema.String.pipe(Schema.optional).annotate({ description: "Task priority: normal | high | low" }),
  background: Schema.Boolean.pipe(Schema.optional).annotate({ description: "Run child in background" }),
})

export const node = makeLocationNode({
  service: TaskGovernance.Service,
  layer: Layer.effect(
    TaskGovernance.Service,
    Effect.gen(function* () {
      const agents = yield* AgentV2.Service
      const store = yield* SessionStore.Service
      const permission = yield* PermissionV2.Service
      const location = yield* Location.Service
      const subagentModels = yield* SessionSubagentModels.Service
      const db = (yield* Database.Service).db

      const admit = Effect.fn("MaestroGovernance.admit")(function* (input: {
        readonly parent: SessionSchema.Info
        readonly target: AgentV2.Info
        readonly input: Readonly<Record<string, unknown>>
        readonly context: Tool.Context
      }) {
        const { parent, target, input: taskInput, context } = input

        yield* permission.authorize({
          sessionID: context.sessionID,
          agent: context.agent,
          action: "task",
          resources: [target.id],
          metadata: { tool: "task", callID: context.toolCallID },
        }).pipe(
          Effect.mapError((error) =>
            new ToolFailure({ message: error instanceof Error ? error.message : String(error) }),
          ),
        )

        const reservationID = `res_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`

        const writeRoots = (target.permissions ?? [])
          .filter((r) => r.action === "write" && r.resource !== "*")
          .map((r) => r.resource)

        const childID = SessionSchema.ID.make(`ses_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`)

        const permissions = [
          ...(target.permissions ?? []),
          ...(writeRoots.length > 0
            ? writeRoots.map((root) => ({ action: "write" as const, resource: root, effect: "allow" as const }))
            : []),
        ]

        // Decode governance input safely
        const decoded = Schema.decodeUnknownOption(GovernanceInput)(taskInput)
        const background = decoded.background === true || decoded.taskPriority === "low"

        return {
          childID,
          permissions,
          prompt: taskInput.prompt ? { text: String(taskInput.prompt) } : undefined,
          background,
          receipt: { reservationID, writeRoots },
        } satisfies MaestroAdmission
      })

      const beforeTurn = Effect.fn("MaestroGovernance.beforeTurn")(function* (session: SessionSchema.Info) {
        const agent = yield* agents.select(session.agent)
        if (agent.info?.steps !== undefined) {
          const hasSteer = yield* SessionInput.hasPending(db, session.id, "steer")
          const hasQueue = !hasSteer && (yield* SessionInput.hasPending(db, session.id, "queue"))
          if (!hasSteer && !hasQueue) {
            return yield* Effect.fail(new ToolFailure({ message: "No pending input for this session" }))
          }
        }
      })

      const settle = Effect.fn("MaestroGovernance.settle")(function* (input: {
        readonly child: SessionSchema.Info
        readonly reply: SessionMessage.Assistant | undefined
        readonly admission: TaskGovernance.Admission
        readonly context: Tool.Context
      }) {
        const { child, reply, admission } = input
        const text = (reply?.content ?? [])
          .flatMap((part) => (part.type === "text" ? [part.text] : []))
          .join("\n")
        // Type guard: admission is MaestroAdmission when this governance is used
        const maestroAdmission: MaestroAdmission = {
          ...admission,
          reservationID: (admission as any).reservationID,
          writeRoots: (admission as any).writeRoots,
          taskPriority: (admission as any).taskPriority,
        }
        const receipt = maestroAdmission.receipt
        const structured: Record<string, unknown> = {
          sessionID: child.id,
          agent: child.agent,
          model: child.model,
          reservationID: receipt?.reservationID,
          writeRoots: receipt?.writeRoots,
        }
        return { text, structured }
      })

      return TaskGovernance.Service.of({
        input: GovernanceInput,
        admit,
        beforeTurn,
        settle,
      })
    }),
  ),
  deps: [AgentV2.node, SessionStore.node, PermissionV2.node, Location.node, SessionSubagentModels.node, Database.node],
})