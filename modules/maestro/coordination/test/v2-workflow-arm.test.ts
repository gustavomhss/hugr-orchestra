import { expect, test } from "bun:test"
import { Effect, Layer, Option, type Scope } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { PermissionV2 } from "@orchestra/core/permission"
import { Project } from "@orchestra/core/project"
import { Relay } from "@orchestra/core/relay"
import { JudgeConfig } from "@orchestra/relay/judge/config"
import { SessionSchema } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { SessionEvent } from "@orchestra/schema/session-event"
import { WorkflowGateV2 } from "../src/v2/governance/workflow"
import { WorkflowArmV2 } from "../src/v2/workflow/arm"
import { event, governanceLayer, session, worktree } from "./fixture/v2-governance"

// The arm's Relay holds tok_1 parked; the owner's answer is recorded and approves only a release that names flaky.
const released: string[] = []
const asked: PermissionV2.AssertInput[] = []
const relay = Layer.mock(Relay.Service, {
  paths: { root: "/relay", authoring: "/relay/authoring", arms: "/relay/arms", hooks: "/relay/hooks", key: "/relay/key" },
  judge: JudgeConfig.defaults,
  parked: () => Effect.succeed(Option.some({ wp: "wp-1", failing: ["tests"] })),
  release: (_, reason) => Effect.sync(() => void released.push(reason)),
})
const permission = Layer.mock(PermissionV2.Service, {
  askExplicit: (input) =>
    Effect.gen(function* () {
      asked.push(input)
      if (!String(input.metadata?.message).endsWith("flaky")) return yield* new PermissionV2.DeclinedError()
    }),
})

const run = <A, E>(
  body: (directory: string) => Effect.Effect<A, E, Layer.Success<ReturnType<typeof governanceLayer>> | Relay.Service | PermissionV2.Service | Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        return yield* body(directory).pipe(Effect.provide(Layer.mergeAll(governanceLayer(directory), relay, permission)))
      }),
    ),
  )

const progress = EventV2.versionedType(SessionEvent.Tool.Progress.type, 1)
const fact = (token: string, directory: string, kind = "completion-arm") => ({
  structured: {
    nativeArsenal: {
      source: "native-host",
      version: 1,
      kind,
      tool: "maestro_arsenal_execute",
      token,
      projectID: Project.ID.global,
      directory,
    },
  },
})
const context = (sessionID: SessionSchema.ID) => ({
  sessionID,
  agent: AgentV2.ID.make("maestro"),
  assistantMessageID: SessionMessage.ID.make("msg_arm"),
  toolCallID: "call_arm",
})

test("the arm receipt is the newest completion-arm fact of the Session, in its own placement", () =>
  run((directory) =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const sessionID = yield* session({ directory, agent: "maestro" })
      const placement = { sessionID, directory, projectID: Project.ID.global }
      expect(yield* WorkflowArmV2.receipt(database, placement)).toBeUndefined()
      yield* event("evt_arm_old", sessionID, progress, fact("tok_old", directory))
      yield* event("evt_safety", sessionID, progress, fact("tok_safety", directory, "safety"))
      yield* event("evt_arm_new", sessionID, progress, fact("tok_new", directory))
      expect((yield* WorkflowArmV2.arms(database, sessionID)).map((arm) => arm.token)).toEqual(["tok_new", "tok_old"])
      expect(yield* WorkflowArmV2.receipt(database, placement)).toEqual({ token: "tok_new", eventID: EventV2.ID.make("evt_arm_new") })
      const moved = yield* Effect.flip(WorkflowArmV2.receipt(database, { ...placement, directory: `${directory}/other` }))
      expect(moved.message).toBe("Tool safety HOLD: COMPLETION_ARM_PLACEMENT_MISMATCH")
    }),
  ))

test("a Session bound to a workflow Task never changes its arm, and an arm names its own Session", () =>
  run((directory) =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const sessionID = yield* session({ directory, agent: "maestro" })
      const hooks = WorkflowArmV2.hooks({
        database,
        // Neither refusal reaches the observation write.
        observations: { read: () => Effect.die("unreached"), emit: () => Effect.die("unreached") },
        placement: { directory, projectID: Project.ID.global },
        relay: yield* Relay.Service,
        permission: yield* PermissionV2.Service,
      })
      const arm = { action: "arm", contract: { sessionID } }
      expect(yield* hooks.beforeExecute(context(sessionID), "relay-arm", arm)).toBeUndefined()
      expect(yield* hooks.beforeExecute(context(sessionID), "governance", { action: "arm" })).toBeUndefined()
      const foreign = yield* Effect.flip(hooks.beforeExecute(context(sessionID), "relay-arm", { action: "arm", contract: { sessionID: "ses_other" } }))
      expect(foreign.message).toBe("COMPLETION_ARM_SESSION_MISMATCH")
      const answer = (sessionIDInReceipt: string) => ({
        content: [{ text: JSON.stringify({ token: "tok_1", contract: { sessionID: sessionIDInReceipt } }) }],
      })
      expect((yield* Effect.flip(hooks.afterExecute(context(sessionID), "relay-arm", arm, answer("ses_other")))).message)
        .toBe("COMPLETION_ARM_SESSION_MISMATCH")
      expect((yield* Effect.flip(hooks.afterExecute(context(sessionID), "relay-arm", arm, { content: [] }))).message)
        .toBe("COMPLETION_ARM_RECEIPT_INVALID")
      yield* event(WorkflowGateV2.eventID(sessionID), sessionID, EventV2.versionedType(MaestroEvent.Task.WorkflowBound.type, 1))
      const bound = yield* Effect.flip(hooks.beforeExecute(context(sessionID), "relay-arm", arm))
      expect(bound.message).toStartWith("WORKFLOW_NATIVE_ARM_MUTATION_REFUSED")
    }),
  ))

test("a release names an arm its Session armed natively, and only the owner's approval releases it", () =>
  run((directory) =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const sessionID = yield* session({ directory, agent: "maestro" })
      const hooks = WorkflowArmV2.hooks({
        database,
        observations: { read: () => Effect.die("unreached"), emit: () => Effect.die("unreached") },
        placement: { directory, projectID: Project.ID.global },
        relay: yield* Relay.Service,
        permission: yield* PermissionV2.Service,
      })
      const release = (args: unknown) => Effect.flip(hooks.afterExecute(context(sessionID), "relay-arm", args, {}))
      expect((yield* release({ action: "release", token: "tok_1" })).message).toBe("COMPLETION_RELEASE_INVALID")
      expect((yield* release({ action: "release", token: "tok_1", reason: "flaky" })).message).toBe("COMPLETION_RELEASE_TOKEN_UNBOUND")
      yield* event("evt_arm", sessionID, progress, fact("tok_1", directory))
      expect((yield* release({ action: "release", token: "tok_1", reason: "no reason" })).message).toBe("COMPLETION_RELEASE_REJECTED")
      expect(released).toEqual([])
      yield* hooks.afterExecute(context(sessionID), "relay-arm", { action: "release", token: "tok_1", reason: "flaky" }, {})
      expect(released).toEqual(["owner: flaky"])
      expect(asked.at(-1)).toMatchObject({ sessionID, action: "completion_release", resources: ["relay-arm:tok_1"] })
    }),
  ))
