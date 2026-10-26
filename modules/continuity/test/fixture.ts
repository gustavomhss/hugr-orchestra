import path from "node:path"
import { LLMEvent, Message, Model, ToolCallPart, ToolDefinition, type LLMRequest } from "@orchestra/llm"
import { OpenAIChat } from "@orchestra/llm/protocols/openai-chat"
import { Effect, Layer, Schema, Scope, Stream } from "effect"
import { Config } from "@orchestra/core/config"
import { Database } from "@orchestra/core/database/database"
import { Global } from "@orchestra/core/global"
import { PermissionV2 } from "@orchestra/core/permission"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionMessage, SessionV2 } from "@orchestra/core/session"
import { SessionMessageTable, SessionTable } from "@orchestra/core/session/sql"
import { ContinuityArchive } from "../src/v2/archive"

export const sessionID = SessionV2.ID.make("ses_continuity_test")

export const model = (context: number, output = 1_000) =>
  Model.make({ id: "continuity-model", provider: "fake", route: OpenAIChat.route.with({ limits: { context, output } }) })

/** The tool set of a seat that may call context_recall, as the runner materializes it after permissions. */
export const recallTools = [
  ToolDefinition.make({ name: "context_recall", description: "Restore archived output", inputSchema: { type: "object" } }),
]

/** Runs a test body against a layer, with a scope for background work. */
export const run =
  <R, LE>(layer: Layer.Layer<R, LE>) =>
  <A, E>(body: Effect.Effect<A, E, R | Scope.Scope>) =>
    Effect.runPromise(body.pipe(Effect.scoped, Effect.provide(layer)))

/** Config documents as the V2 loader decodes them from orchestra.json. */
export const config = (info: unknown) => [
  new Config.Document({ type: "document", info: Schema.decodeUnknownSync(Config.Info)(info) }),
]

/** The Session's archive directory, where the legacy format puts it. */
export const archiveDirectory = (id: string) =>
  path.join(Global.Path.data, "continuity", ContinuityArchive.hash(id))

export const seed = (id = sessionID) => Effect.gen(function* () {
  const database = yield* Database.Service
  yield* database.db
    .insert(ProjectTable)
    .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
    .onConflictDoNothing()
    .run()
  yield* database.db
    .insert(SessionTable)
    .values({ id, project_id: Project.ID.global, slug: id, directory: "/project", title: "t", version: "t" })
    .onConflictDoNothing()
    .run()
})

const encode = Schema.encodeSync(SessionMessage.Message)

/** Stores one Session message row as the projector would. */
export const store = (message: SessionMessage.Message, seq: number, id = sessionID) =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const { id: _, type, ...data } = encode(message)
    yield* database.db
      .insert(SessionMessageTable)
      .values({ id: message.id, session_id: id, type, seq, time_created: seq, data })
      .run()
  })

/** One provider step: an assistant tool call and its result. */
export const step = (index: number, tool: string, output: string) => [
  Message.make({
    id: `msg_step_${index}`,
    role: "assistant",
    content: [ToolCallPart.make({ id: `call_${index}`, name: tool, input: { command: `cat file${index}` } })],
  }),
  Message.tool({ id: `call_${index}`, name: tool, result: output, resultType: "text" }),
]

/** A model client that answers every request with `summary`, or a provider error when `summary` is undefined. */
export const llm = (summary: () => string | undefined, gate: Effect.Effect<void> = Effect.void) => {
  const requests: LLMRequest[] = []
  return {
    requests,
    stream: (request: LLMRequest) =>
      Stream.fromEffect(
        gate.pipe(
          Effect.andThen(
            Effect.sync(() => {
              requests.push(request)
              const text = summary()
              return text === undefined
                ? LLMEvent.providerError({ message: "unavailable" })
                : LLMEvent.textDelta({ id: "summary", text })
            }),
          ),
        ),
      ),
  }
}

/** Records every assertion and allows it. */
export const permission = (assertions: PermissionV2.AssertInput[]) =>
  Layer.succeed(
    PermissionV2.Service,
    PermissionV2.Service.of({
      evaluate: () => Effect.die("unused"),
      authorize: () => Effect.die("unused"),
      askExplicit: () => Effect.die("unused"),
      assert: (input) => Effect.sync(() => void assertions.push(input)),
      ask: () => Effect.die("unused"),
      reply: () => Effect.die("unused"),
      get: () => Effect.die("unused"),
      forSession: () => Effect.die("unused"),
      list: () => Effect.die("unused"),
    }),
  )
