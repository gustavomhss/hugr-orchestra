export * as HostPorts from "./host-ports"

import type { LLMEvent } from "@orchestra/llm"
import { DateTime, Effect, Semaphore } from "effect"
import { createHash } from "node:crypto"
import path from "path"
import { Config } from "../../config"
import { Database } from "../../database/database"
import { EventV2 } from "../../event"
import { Location } from "../../location"
import { ModelV2 } from "../../model"
import { ProviderV2 } from "../../provider"
import { RelativePath } from "../../schema"
import { LeanOutput } from "../../tool/lean-output"
import { TaskPermission } from "../../tool/task-permission"
import { SessionEvent } from "../event"
import { SessionInput } from "../input"
import { SessionMessage } from "../message"
import { Prompt } from "../prompt"
import { SessionSchema } from "../schema"
import { SessionStore } from "../store"
import { SessionTodo } from "../todo"
import type { SessionExecution } from "../execution"
import type { ExecutionHost } from "./execution-host"
import { createLLMEventPublisher } from "./publish-llm-event"

/** `Turn.child`, `Turn.notify` and `Turn.todos` for one hosted turn of `session`; the parent's publisher names the task call's assistant message. */
export function make(input: {
  readonly events: EventV2.Interface
  readonly store: SessionStore.Interface
  readonly location: Location.Interface
  readonly config: Config.Interface
  readonly database: Database.Interface
  readonly session: SessionSchema.Info
  readonly model: ModelV2.Ref | undefined
  readonly assistantMessageID: ReturnType<typeof createLLMEventPublisher>["assistantMessageID"]
  readonly withPublication: Semaphore.Semaphore["withPermit"]
  /** The process-global execution, for the wake a host's own event asks for; absent where nothing drains Sessions. */
  readonly execution: SessionExecution.Interface | undefined
}) {
  const events = input.events
  const store = input.store
  const location = input.location
  const config = input.config
  const database = input.database
  const session = input.session
  const model = {
    id: input.model?.id ?? ModelV2.ID.make("default"),
    providerID: input.model?.providerID ?? ProviderV2.ID.make("anthropic"),
  }
  const notify: ExecutionHost.Turn["notify"] = (event) =>
    SessionInput.admit(database.db, events, {
      id: SessionMessage.ID.make(event.id.startsWith("msg_") ? event.id : `msg_${event.id}`),
      sessionID: session.id,
      prompt: Prompt.make({ text: event.text }),
      delivery: "steer",
    }).pipe(Effect.andThen(input.execution ? input.execution.wake(session.id) : Effect.void))
  const child: ExecutionHost.Turn["child"] = (call) =>
    Effect.gen(function* () {
      const hash = (domain: string) =>
        createHash("sha256").update(JSON.stringify([domain, session.id, call.callID])).digest("hex")
      const id = SessionSchema.ID.make(`ses_${hash("host-child")}`)
      if (!(yield* store.get(id))) {
        const ref = Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID })
        yield* events.publish(
          SessionEvent.Created,
          {
            sessionID: id,
            timestamp: yield* DateTime.now,
            projectID: location.project.id,
            location: ref,
            subdirectory: RelativePath.make(
              path.relative(location.project.directory, location.directory).replaceAll("\\", "/"),
            ),
            title: call.title,
            parentID: session.id,
            agent: call.agent,
            model,
          },
          { location: ref },
        )
        const rules = TaskPermission.inheritedPermissions(
          yield* store.permissions(session.id),
          TaskPermission.primaryTools(yield* config.entries()),
        )
        if (rules.length > 0)
          yield* events.publish(SessionEvent.PermissionChanged, {
            sessionID: id,
            timestamp: yield* DateTime.now,
            permission: rules.map((rule) => ({ permission: rule.action, pattern: rule.resource, action: rule.effect })),
          })
      }
      yield* input.withPublication(
        events.publish(SessionEvent.Tool.Progress, {
          sessionID: session.id,
          assistantMessageID: yield* input.assistantMessageID(call.callID),
          callID: call.callID,
          timestamp: yield* DateTime.now,
          structured: { sessionId: id, parentSessionId: session.id, agentId: call.agent, title: call.title },
          content: [],
        }),
      )
      // The task row reads the child from the settled call's metadata, as Orchestra's task tool leaves it.
      LeanOutput.offer({ sessionID: session.id, callID: call.callID }, { sessionId: id, parentSessionId: session.id, agentId: call.agent })
      // Admitted and promoted at once, never woken: the engine already runs this prompt.
      yield* SessionInput.admit(database.db, events, {
        id: SessionMessage.ID.make(`msg_${hash("host-child-prompt")}`),
        sessionID: id,
        prompt: Prompt.make({ text: call.prompt }),
        delivery: "steer",
      })
      yield* SessionInput.promoteSteers(database.db, events, id, yield* EventV2.latestSequence(database.db, id))
      const mirror = createLLMEventPublisher(events, { sessionID: id, agent: call.agent, model })
      const serial = Semaphore.makeUnsafe(1).withPermit
      return {
        id,
        todos: (list: ReadonlyArray<SessionTodo.Info>) => SessionTodo.write(database.db, events, { sessionID: id, todos: list }),
        publish: (event: LLMEvent) => serial(mirror.publish(event, [])),
        finish: serial(
          Effect.gen(function* () {
            yield* mirror.flush()
            yield* mirror.failUnsettledTools("Subagent ended without a tool result")
            const settlement = mirror.stepSettlement()
            if (!settlement || mirror.hasProviderError()) return
            yield* events.publish(SessionEvent.Step.Ended, {
              sessionID: id,
              timestamp: yield* DateTime.now,
              assistantMessageID: yield* mirror.startAssistant(),
              finish: settlement.finish,
              // The parent's step already carries what the engine billed for the subagent.
              cost: 0,
              tokens: settlement.tokens,
              usageKnown: settlement.usageKnown,
            })
          }),
        ),
      }
    })
  const todos: ExecutionHost.Turn["todos"] = (list) => SessionTodo.write(database.db, events, { sessionID: session.id, todos: list })
  return { child, notify, todos }
}
