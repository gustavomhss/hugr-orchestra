import { expect, test } from "bun:test"
import { DateTime, Effect, Schema, type Layer, type Scope } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { ModelV2 } from "@orchestra/core/model"
import { Project } from "@orchestra/core/project"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionStore } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionMessageTable } from "@orchestra/core/session/sql"
import { TaskTool } from "@orchestra/core/tool/task"
import { UpstreamResult } from "../src/upstream-result"
import { LogicalTaskV2 } from "../src/v2/governance/logical-task"
import { UpstreamProvenanceV2 } from "../src/v2/workflow/upstream-provenance"
import { governanceLayer, session, worktree } from "./fixture/v2-governance"

const run = <A, E>(body: (directory: string) => Effect.Effect<A, E, Layer.Success<ReturnType<typeof governanceLayer>> | Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        return yield* body(directory).pipe(Effect.provide(governanceLayer(directory)))
      }),
    ),
  )

const projectID = Project.ID.global
const encode = Schema.encodeSync(SessionMessage.Message)
const model = { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") }
const time = { created: DateTime.makeUnsafe(1_700_000_000_000), completed: DateTime.makeUnsafe(1_700_000_000_001) }
const terminal = [
  "Proposal ready.",
  "",
  "```upstream-result",
  JSON.stringify({ outcome: "done", artifacts: [{ kind: "plan", path: "docs/plan.md" }], blockers: [], risks: [], nextActions: [] }),
  "```",
  "",
].join("\n")
const card = UpstreamResult.parse(terminal)

/**
 * A Maestro parent whose assistant completed one native Task call to archie, the archie child that answered that
 * call's prompt with `terminal`, and (unless `bind` is false) the child's retained host logical Task. `settled` is the
 * card the Task settled into its output.
 */
const seed = (directory: string, options: { readonly settled?: unknown; readonly bind?: boolean } = {}) =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    const services = { db: database.db, events: yield* EventV2.Service, store: yield* SessionStore.Service }
    const parent = yield* session({ directory, agent: "maestro" })
    const child = yield* session({ directory, agent: "archie", parentID: parent })
    const binding =
      options.bind === false
        ? undefined
        : yield* LogicalTaskV2.ensure(
            { ...services, canonical: (id) => id },
            { executionSessionID: child, authoritySessionID: parent, projectID, memberID: "archie", source: "host" },
          )
    const dispatch = SessionMessage.ID.make("msg_dispatch")
    const prompt = TaskTool.taskPromptID(
      { sessionID: parent, agent: AgentV2.ID.make("maestro"), assistantMessageID: dispatch, toolCallID: "call_task" },
      child,
    )
    const rows: [SessionSchema.ID, SessionMessage.Message][] = [
      [
        parent,
        SessionMessage.Assistant.make({
          id: dispatch,
          type: "assistant",
          agent: "maestro",
          model,
          finish: "tool-calls",
          time,
          content: [
            {
              type: "tool",
              id: "call_task",
              name: TaskTool.name,
              time,
              state: {
                status: "completed",
                input: { subagent_type: "archie", description: "plan", prompt: "plan it" },
                content: [],
                structured: Schema.encodeSync(TaskTool.Output)({
                  sessionID: child,
                  agent: AgentV2.ID.make("archie"),
                  text: terminal,
                  sessionId: child,
                  parentSessionId: parent,
                  agentId: AgentV2.ID.make("archie"),
                  structured: { upstreamResult: "settled" in options ? options.settled : card },
                }),
              },
            },
          ],
        }),
      ],
      [child, SessionMessage.User.make({ id: prompt, type: "user", text: "plan it", time })],
      [
        child,
        SessionMessage.Assistant.make({
          id: SessionMessage.ID.make("msg_author"),
          type: "assistant",
          agent: "archie",
          model,
          finish: "stop",
          time,
          content: [{ type: "text", id: "txt_author", text: terminal }],
        }),
      ],
    ]
    yield* database.db
      .insert(SessionMessageTable)
      .values(
        rows.map((row, index) => ({
          id: row[1].id,
          session_id: row[0],
          type: row[1].type,
          seq: index + 1,
          time_created: DateTime.toEpochMillis(row[1].time.created),
          data: encode(row[1]),
        })),
      )
      .run()
      .pipe(Effect.orDie)
    return {
      services,
      input: {
        projectID,
        parentSessionID: parent,
        parentMessageID: dispatch,
        parentCallID: "call_task",
        authorSessionID: child,
        authorMessageID: SessionMessage.ID.make("msg_author"),
        logicalTaskID: binding?.taskId ?? "tsk_missing",
      },
    }
  })

const denial = <R>(effect: Effect.Effect<unknown, UpstreamProvenanceV2.Denied, R>) =>
  Effect.flip(effect).pipe(Effect.map((error) => error.code))

test("the archie Task that settled this exact reply attributes the proposal", () =>
  run((directory) =>
    Effect.gen(function* () {
      const seeded = yield* seed(directory)
      expect(card).toBeDefined()
      expect(yield* UpstreamProvenanceV2.observe(seeded.services, seeded.input)).toEqual({
        schema: "maestro-upstream-attribution-v1",
        projectID,
        memberID: AgentV2.ID.make("archie"),
        profile: "upstream",
        authorSessionID: seeded.input.authorSessionID,
        authorMessageID: seeded.input.authorMessageID,
        parentSessionID: seeded.input.parentSessionID,
        parentMessageID: seeded.input.parentMessageID,
        parentCallID: "call_task",
        logicalTaskID: seeded.input.logicalTaskID,
      })
    }),
  ))

test("a call id the dispatch parent never made is a parent mismatch", () =>
  run((directory) =>
    Effect.gen(function* () {
      const seeded = yield* seed(directory)
      expect(yield* denial(UpstreamProvenanceV2.observe(seeded.services, { ...seeded.input, parentCallID: "call_other" })))
        .toBe("UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
    }),
  ))

test("a Task that settled another card does not select the author's proposal", () =>
  run((directory) =>
    Effect.gen(function* () {
      const seeded = yield* seed(directory, { settled: { ...card, risks: ["a different proposal"] } })
      expect(yield* denial(UpstreamProvenanceV2.observe(seeded.services, seeded.input)))
        .toBe("UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
    }),
  ))

test("an author Session without a retained logical Task cannot attribute", () =>
  run((directory) =>
    Effect.gen(function* () {
      const seeded = yield* seed(directory, { bind: false })
      expect(yield* denial(UpstreamProvenanceV2.observe(seeded.services, seeded.input)))
        .toBe("UPSTREAM_ATTRIBUTION_MISSING")
    }),
  ))

test("a Claude Code Agent dispatch holds because V2 records no evidence for it", () =>
  run((directory) =>
    Effect.gen(function* () {
      const seeded = yield* seed(directory)
      expect(
        yield* denial(UpstreamProvenanceV2.observe(seeded.services, { ...seeded.input, dispatchKind: "claude-code-agent" })),
      ).toBe("UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
    }),
  ))
