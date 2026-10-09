export * as ArsenalBindings from "./arsenal-bindings"

import path from "node:path"
import { Effect, FileSystem, Layer, Option, Schema } from "effect"
import { and, asc, desc, eq, sql } from "drizzle-orm"
import { ChildProcess } from "effect/unstable/process"
import { isDeepStrictEqual } from "node:util"
import { type Tool } from "ai"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { MessageTable, PartTable } from "@orchestra/core/session/sql"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { AppProcess } from "@orchestra/core/process"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"
import { InstanceState } from "@/effect/instance-state"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { Permission } from "@/permission"
import { Config } from "@/config/config"
import { Git } from "@/git"
import { readAtlasSource } from "./atlas-source"
import { readAuthorization } from "./authorization"
import { readValidation, validationRecordHash, findReview, rosterHash, reviewPolicyHash } from "./validation-record"
import { readPlanRevision, readWorkflowRevision } from "./plan-revision"
import { compileContextToolPlan } from "./context-tool-plan"
import { ToolFailure } from "@orchestra/llm"
import { AgentV2 } from "@orchestra/core/agent"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationMutation } from "@orchestra/core/location-mutation"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { PermissionV2 } from "@orchestra/core/permission"
import { PluginV2 } from "@orchestra/core/plugin"
import { SessionStore } from "@orchestra/core/session/store"
import { ApplicationTools } from "@orchestra/core/tool/application-tools"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { Agent } from "@/agent/agent"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import { ArsenalObservations } from "./arsenal-observations"
import { EffectBridge } from "@/effect/bridge"
import { ArsenalVerification } from "@/maestro/arsenal-verification"
import { ArsenalApproval } from "./arsenal-approval"
import { ArsenalOutcome } from "./arsenal-outcome"
import { canonicalMemberId, roster, nativeProfiles } from "./roster"
import { WriteRoots } from "./write-roots"
import { WorkflowBinding } from "./workflow-binding"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { RelayWorkflowSession } from "@orchestra/core/relay-workflow-session"
import { SkillV2 } from "@orchestra/core/skill"
import { AuthoringStore } from "@orchestra/relay/authoring/store"
import { AuthoringGraph } from "@orchestra/relay/authoring/graph"
import { UpstreamProvenance } from "./upstream-provenance"
import { readContext, contextIsCurrent } from "./context-record"
import { recordApproval } from "./approval-record"
import { taskHash } from "./task-hash"
import { EventV2Bridge } from "@/event-v2-bridge"
import { AbsolutePath } from "@orchestra/core/schema"

/** Process-scoped application registration. Every invocation resolves its own actual Session placement. */
const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const sessions = yield* SessionStore.Service
    const locations = yield* LocationServiceMap.Service
    const instances = yield* InstanceStore.Service
    const nativeAgents = yield* Agent.Service
    const global = yield* Global.Service
    const fs = yield* FSUtil.Service
    const observations = yield* ArsenalObservations.Service
    const registrations = yield* ApplicationTools.Service
     const runtime = yield* make
     const workflowSessions = yield* RelayWorkflowSession.Service
     yield* workflowSessions.register(runtime.workflowSessionHost)
    yield* registrations
      .register(
        MaestroArsenal.applicationTools((context) =>
          Effect.gen(function* () {
            const session = yield* sessions.get(context.sessionID)
            if (!session) return yield* new ToolFailure({ message: "ARSENAL_SESSION_MISSING" })
            return yield* Effect.gen(function* () {
              const location = yield* Location.Service
              const agents = yield* AgentV2.Service
              const mutation = yield* LocationMutation.Service
              const permissions = yield* PermissionV2.Service
              const plugins = yield* PluginV2.Service
              const outputs = yield* ToolOutputStore.Service
              yield* plugins.wait(PluginV2.ID.make("config-agent"))
              if (
                session.projectID !== location.project.id ||
                path.resolve(session.location.directory) !== path.resolve(location.directory)
              )
                return yield* new ToolFailure({ message: "ARSENAL_SESSION_PLACEMENT_MISMATCH" })
              const directory = yield* fs
                .realPath(location.directory)
                .pipe(Effect.mapError(() => new ToolFailure({ message: "ARSENAL_DIRECTORY_UNAVAILABLE" })))
              const instance = yield* instances.load({ directory })
              if (instance.project.id !== location.project.id || path.resolve(instance.directory) !== directory)
                return yield* new ToolFailure({ message: "ARSENAL_NATIVE_INSTANCE_MISMATCH" })
              const native = yield* nativeAgents.get(context.agent).pipe(Effect.provideService(InstanceRef, instance))
              const agent = yield* agents.get(context.agent)
              const nativeMaestro = agent?.id === "maestro" && native?.id === "maestro" && native.native === true
              const nativeUpstream = agent?.id === "walt" && native?.id === "walt" && native.native === true
              const data = yield* fs
                .realPath(global.data)
                .pipe(Effect.map(FSUtil.normalizePath), Effect.mapError(() => new ToolFailure({ message: "ARSENAL_DATA_UNAVAILABLE" })))
              const stateDirectory = nativeMaestro
                ? yield* MaestroArsenal.prepareState(data, session.projectID).pipe(
                    Effect.provideService(FSUtil.Service, fs),
                  )
                : MaestroArsenal.stateDirectory(data, session.projectID)
              const ask = (action: string, resources: readonly string[]) =>
                permissions
                  .assert({
                    action,
                    resources,
                    sessionID: context.sessionID,
                    agent: context.agent,
                    source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
                  })
                  .pipe(Effect.mapError(() => new ToolFailure({ message: "Arsenal permission denied." })))
              const host = { directory, stateDirectory, projectID: session.projectID, nativeMaestro, nativeUpstream, ask }
              return {
                ...host,
                outputBudget: outputs.limits,
                beforeExecute: (name: string, args: unknown) => runtime.beforeExecute(session.id, name, args),
                afterExecute: (name: string, args: unknown, result: unknown) =>
                  runtime.afterExecute(
                    {
                      sessionID: session.id,
                      assistantMessageID: context.assistantMessageID,
                      callID: context.toolCallID,
                    },
                    name,
                    args,
                    result,
                  ),
                authorize: (request: MaestroArsenal.Authorization) =>
                  Effect.gen(function* () {
                    yield* MaestroArsenal.authorize(fs, host, request)
                    yield* Effect.forEach(
                      request.paths.filter((item) => !FSUtil.contains(stateDirectory, path.resolve(directory, item))),
                      (item) =>
                        mutation
                          .resolve({ path: item })
                          .pipe(
                            Effect.flatMap((target) =>
                              target.externalDirectory
                                ? Effect.fail(new ToolFailure({ message: "Arsenal path escapes its host scope." }))
                                : Effect.void,
                            ),
                          ),
                    ).pipe(Effect.mapError(() => new ToolFailure({ message: "Arsenal path escapes its host scope." })))
                    yield* guard({ sessionID: context.sessionID, callID: context.toolCallID }, host, request).pipe(
                      Effect.provideService(FSUtil.Service, fs),
                    )
                  }),
                observeGovernance: (operation: "audit" | "usage" | "status") =>
                  ask("read", [`session:${session.id}`]).pipe(
                    Effect.andThen(
                      observations.read({
                        sessionID: session.id,
                        operation,
                        placement: { directory, projectID: session.projectID },
                      }),
                    ),
                  ),
              }
            }).pipe(Effect.provide(locations.get(session.location)))
          }),
        ),
      )
      .pipe(Effect.orDie)
  }),
)

export const node = makeGlobalNode({
  name: "maestro-arsenal-bindings",
  layer,
  deps: [
    ApplicationTools.node,
    SessionStore.node,
    LocationServiceMap.node,
    InstanceStore.node,
    Agent.node,
    Global.node,
    FSUtil.node,
    ArsenalObservations.node,
    AppProcess.node,
    Session.node,
    Database.node,
    Permission.node,
    Config.node,
     Git.node,
     RelayWorkflowSession.node,
  ],
})

/** Enter F's actual resource policy for backend I/O, preserving caller RuntimeProfile context. */
export const guard = Effect.fn("ArsenalBindings.guard")(function* (
  context: { readonly sessionID: string; readonly callID?: string },
  placement: { readonly directory: string; readonly projectID: string },
  request: MaestroArsenal.Authorization,
) {
  if (!context.callID) return yield* new ToolFailure({ message: "ARSENAL_TOOL_CALL_ID_MISSING" })
  const { ToolSafety } = yield* Effect.tryPromise({
    try: () => import("@orchestra/core/tool-safety"),
    catch: () => new ToolFailure({ message: "ARSENAL_RESOURCE_SAFETY_UNAVAILABLE" }),
  })
  const provided = yield* Effect.serviceOption(ToolSafety.Service)
  const safety = Option.isSome(provided) ? provided.value : yield* ToolSafety.make
  const loader = yield* ToolSafety.RuntimeProfileLoader
  const profile = loader
    ? yield* loader().pipe(Effect.mapError(() => new ToolFailure({ message: "ARSENAL_RESOURCE_SAFETY_DENIED" })))
    : yield* ToolSafety.RuntimeProfile
  const source = {
    sessionID: context.sessionID,
    callID: context.callID,
    directory: placement.directory,
    projectID: placement.projectID,
  }
  yield* Effect.forEach(request.paths, (filePath) =>
    safety.before({
      ...source,
      tool: request.effect === "write" ? "write" : "read",
      args: { filePath: path.resolve(placement.directory, filePath) },
    }),
  ).pipe(
    Effect.provideService(ToolSafety.RuntimeProfile, profile),
    Effect.mapError(() => new ToolFailure({ message: "ARSENAL_RESOURCE_SAFETY_DENIED" })),
  )
  yield* Effect.forEach(request.commands, (command) =>
    safety.before({
      ...source,
      tool: MaestroArsenal.names.execute,
      args: { command },
    }),
  ).pipe(
    Effect.provideService(ToolSafety.RuntimeProfile, profile),
    Effect.mapError(() => new ToolFailure({ message: "ARSENAL_RESOURCE_SAFETY_DENIED" })),
  )
})

/** One native host context, shared by definition construction and the whole Session invocation. */
export const make = Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const processes = yield* AppProcess.Service
  const database = yield* Database.Service
  const sessions = yield* Session.Service
  const instances = yield* InstanceStore.Service
  const agents = yield* Agent.Service
  const permission = yield* Permission.Service
  const config = yield* Config.Service
  const git = yield* Git.Service
  const observations = yield* ArsenalObservations.Service
  const locations = yield* LocationServiceMap.Service
  const safety = yield* ToolSafety.make
   const events = yield* EventV2Bridge.Service
  const runnerReports = new WeakMap<ArsenalCompletion.Binding, Effect.Success<ReturnType<typeof ArsenalVerification.run>>>()
  const approvalHost = yield* makeApprovalHost
  const state = yield* InstanceState.make((instance) =>
    Effect.gen(function* () {
      const stateDirectory = yield* MaestroArsenal.prepareState(Global.Path.data, instance.project.id).pipe(
        Effect.provideService(FSUtil.Service, fs),
      )
      const host = yield* ToolSafety.RuntimeProfile
      return {
        stateDirectory,
        loadProfile: MaestroArsenal.makeProfileLoader(
          fs,
          { directory: instance.directory, stateDirectory, projectID: instance.project.id },
          host,
        ),
      }
    }),
  )
  const under = <A, E, R>(directory: string, effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const instance = yield* instances.load({ directory }).pipe(Effect.orDie)
      return yield* effect.pipe(Effect.provideService(InstanceRef, instance))
    })
  const parent = (binding: ArsenalCompletion.Dispatch) =>
    sessions.get(SessionID.make(binding.sessionID)).pipe(
      Effect.mapError(() => new ToolSafety.Denied({ reason: "completion-native-parent-missing" })),
      Effect.flatMap((session) =>
        session.projectID !== binding.projectID || path.resolve(session.directory) !== path.resolve(binding.directory)
          ? Effect.fail(new ToolSafety.Denied({ reason: "completion-native-placement-mismatch" }))
          : Effect.succeed(session),
      ),
    )
  const approved = Effect.fn("ArsenalBindings.approvedTask")(
    function* (input: ArsenalCompletion.Dispatch) {
      const session = yield* parent(input)
      const child = yield* sessions
        .get(SessionID.make(input.taskID))
        .pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "completion-native-child-missing" })))
      if (
        child.parentID !== session.id ||
        child.projectID !== session.projectID ||
        child.directory !== session.directory
      )
        return yield* new ToolSafety.Denied({ reason: "completion-native-child-mismatch" })
       const calls = input.workflow ? [] : yield* database.db
        .select({ data: PartTable.data })
        .from(PartTable)
        .innerJoin(
          MessageTable,
          and(eq(MessageTable.id, PartTable.message_id), eq(MessageTable.session_id, PartTable.session_id)),
        )
        .where(
          and(
            eq(PartTable.session_id, session.id),
            sql`json_extract(${PartTable.data}, '$.callID') = ${input.callID}`,
            sql`json_extract(${MessageTable.data}, '$.role') = 'assistant'`,
          ),
        )
        .limit(2)
        .all()
        .pipe(Effect.orDie)
       if (!input.workflow && calls.length !== 1)
        return yield* new ToolSafety.Denied({ reason: "completion-native-task-call-missing-or-ambiguous" })
       const call = Schema.decodeUnknownOption(Schema.Struct({ subagent_type: Schema.String }))(
         input.workflow ? (yield* WorkflowBinding.taskCall(session.id, input.workflow.assistantMessageID, input.callID)).input
           : Schema.decodeUnknownSync(Schema.Struct({ type: Schema.Literal("tool"), tool: Schema.Literal("task"),
             state: Schema.Struct({ input: Schema.Unknown }) }))(calls[0].data).state.input,
       )
      if (Option.isNone(call)) return yield* new ToolSafety.Denied({ reason: "completion-native-task-call-invalid" })
       const actor = yield* agents.get(call.value.subagent_type)
      if ((actor.id ?? actor.name) !== canonicalMemberId(child.agent))
        return yield* new ToolSafety.Denied({ reason: "completion-native-task-agent-mismatch" })
      const rows = yield* database.db
        .select()
        .from(EventTable)
        .where(eq(EventTable.aggregate_id, session.id))
        .orderBy(asc(EventTable.seq))
        .limit(4097)
        .all()
        .pipe(Effect.orDie)
      if (rows.length > 4096) return yield* new ToolSafety.Denied({ reason: "completion-authority-history-overflow" })
      const direct = rows.findLast(
        (row) =>
          row.type === EventV2.versionedType(MaestroEvent.Approval.ReservedV2.type, 2) &&
          row.data.childSessionID === child.id,
      )
      if (direct) {
        const reserved = Schema.decodeUnknownSync(MaestroEvent.Approval.ReservedV2.data)(direct.data)
        if (
          reserved.callID !== input.callID ||
          reserved.sessionID !== session.id ||
          reserved.parentSessionID !== session.id ||
          reserved.projectID !== session.projectID ||
          canonicalMemberId(reserved.agent) !== canonicalMemberId(child.agent) ||
          (input.planID !== undefined && reserved.planRevisionID !== input.planID) ||
          !isDeepStrictEqual(reserved.permission, child.permission)
        )
          return yield* new ToolSafety.Denied({ reason: "completion-approved-task-mismatch" })
        return { session, child, planID: reserved.planRevisionID, permission: reserved.permission }
      }
      const dispatch = rows.findLast(
        (row) =>
          row.type === EventV2.versionedType(MaestroEvent.Dispatch.ReservedV2.type, 2) &&
          row.data.childSessionID === child.id,
      )
      if (dispatch) {
        const reserved = Schema.decodeUnknownSync(MaestroEvent.Dispatch.ReservedV2.data)(dispatch.data)
        const authorization = yield* readAuthorization(reserved.authorizationID)
        const validation = authorization ? yield* readValidation(authorization.validationRecordID) : undefined
        if (
          !authorization ||
          !validation ||
          validation.outcome !== "VALID" ||
          validation.sessionID !== session.id ||
          validation.projectID !== session.projectID ||
          reserved.sessionID !== session.id ||
          reserved.projectID !== session.projectID ||
          canonicalMemberId(reserved.routedMemberID) !== canonicalMemberId(child.agent) ||
          authorization.sessionID !== session.id ||
          authorization.projectID !== session.projectID ||
          (input.planID !== undefined && validation.planRevisionID !== input.planID) ||
          !isDeepStrictEqual(reserved.permission, child.permission)
        )
          return yield* new ToolSafety.Denied({ reason: "completion-authorization-mismatch" })
        return { session, child, planID: validation.planRevisionID, permission: reserved.permission }
      }
      if (input.planID) return yield* new ToolSafety.Denied({ reason: "completion-plan-authority-missing" })
      return { session, child, planID: undefined, permission: child.permission }
    },
    Effect.provideService(Database.Service, database),
  )
  // The session's own completion-arm facts, newest first: the native record of what Maestro armed.
  const arms = (sessionID: string) => Effect.gen(function* () {
    const rows = yield* database.db.select().from(EventTable).where(and(eq(EventTable.aggregate_id, sessionID),
      eq(EventTable.type, EventV2.versionedType(SessionEvent.Tool.Progress.type, 1)),
      sql`json_extract(${EventTable.data}, '$.structured.nativeArsenal.kind') = 'completion-arm'`,
    )).orderBy(desc(EventTable.seq)).limit(257).all().pipe(Effect.orDie)
    if (rows.length > 256) return yield* new ToolSafety.Denied({ reason: "completion-arm-history-overflow" })
    return rows.flatMap((row) => {
      const data = Schema.decodeUnknownOption(SessionEvent.Tool.Progress.data)(row.data)
      if (Option.isNone(data)) return []
      const fact = Schema.decodeUnknownOption(ArsenalObservations.NativeFact)(data.value.structured.nativeArsenal)
      return Option.isSome(fact) && fact.value.kind === "completion-arm" ? [{ row, data: data.value, fact: fact.value }] : []
    })
  })
  const resolve: ArsenalCompletion.Host["resolve"] = (input) =>
    under(
      input.directory,
      Effect.gen(function* () {
        const arm = (yield* arms(input.sessionID)).find((entry) => entry.fact.token)
        if (!arm) return
        const authority = yield* approved(input)
        const native = yield* agents.get("maestro")
        if (native?.id !== "maestro" || native.native !== true)
          return yield* new ToolSafety.Denied({ reason: "completion-native-owner-missing" })
        const placement = Schema.decodeUnknownSync(
          Schema.Struct({ projectID: Schema.String, directory: Schema.String }),
        )(arm.data.structured.nativeArsenal)
        if (
          placement.projectID !== input.projectID ||
          path.resolve(placement.directory) !== path.resolve(input.directory)
        )
          return yield* new ToolSafety.Denied({ reason: "completion-arm-placement-mismatch" })
        const local = yield* InstanceState.get(state).pipe(Effect.orDie)
        return {
          ...input,
          planID: authority.planID ?? arm.row.id,
          token: Schema.decodeUnknownSync(Schema.NonEmptyString)(arm.fact.token),
          stateDirectory: local.stateDirectory,
          ownedPaths: (authority.permission ?? [])
            .filter((rule) => rule.permission === "edit" && rule.action === "allow")
            .map((rule) => rule.pattern),
        }
      }),
    )
  const outcome = (pass: boolean): ArsenalCompletion.CheckOutcome => ({
    status: pass ? "pass" : "fail",
    exitCode: pass ? 0 : 1,
  })
  const permissions: ArsenalCompletion.HostCheck = (binding) =>
    under(
      binding.directory,
      approved({ ...binding, planID: undefined }).pipe(
        Effect.map((authority) =>
          outcome(
            authority.child.parentID === binding.sessionID &&
              (!authority.planID || authority.planID === binding.planID),
          ),
        ),
      ),
    )
  const fixed =
    (args: readonly string[]): ArsenalCompletion.HostCheck =>
    (binding) =>
      under(
        binding.directory,
        Effect.gen(function* () {
          const authority = yield* approved({ ...binding, planID: undefined })
          const actor = yield* agents.get(authority.session.agent ?? "maestro")
          const manifest = yield* fs
            .readFileString(path.join(binding.directory, "package.json"))
            .pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)))
          if (typeof manifest !== "object" || manifest === null || "workspaces" in manifest)
            return { status: "missing" as const }
          const command = [process.execPath, ...args].map((arg) => JSON.stringify(arg)).join(" ")
          yield* permission.ask({
            permission: "bash",
            patterns: [command],
            always: [],
            metadata: { completionCheck: true },
            sessionID: authority.session.id,
            ruleset: Permission.merge(actor.permission, authority.session.permission ?? []),
          })
          const commandLine = yield* ToolSafetySandbox.wrap(
            ChildProcess.make(process.execPath, args, { cwd: binding.directory, extendEnv: false }),
          ).pipe(Effect.provideService(FSUtil.Service, fs), Effect.provideService(AppProcess.Service, processes))
          const result = yield* processes.run(commandLine, {
            timeout: "55 seconds",
            maxOutputBytes: 1024,
            maxErrorBytes: 1024,
          })
          return result.stdoutTruncated || result.stderrTruncated
            ? { status: "acquisition-error" as const }
            : outcome(result.exitCode === 0)
        }).pipe(Effect.scoped),
      )
  const checks = new Map<string, ArsenalCompletion.HostCheck>([
    ["permissions", permissions],
    [
      "git-clean",
      (binding) =>
        git
          .run(["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: binding.directory })
          .pipe(
            Effect.map((result) =>
              result.exitCode || result.truncated
                ? { status: "acquisition-error" as const }
                : outcome(!result.stdout.length),
            ),
          ),
    ],
    [
      "current-own",
      (binding) =>
        under(
          binding.directory,
          parent(binding).pipe(
            Effect.flatMap((session) => readAtlasSource(session)),
            Effect.as(outcome(true)),
            Effect.catch(() => Effect.succeed({ status: "missing" as const })),
          ),
        ).pipe(
          Effect.provideService(Config.Service, config),
          Effect.provideService(Git.Service, git),
          Effect.provideService(FileSystem.FileSystem, fs),
        ),
    ],
    [
      "verifier-seam",
      (binding) =>
        under(
          binding.directory,
          Effect.gen(function* () {
            const authority = yield* approved({ ...binding, planID: undefined })
            if (!authority.planID) return { status: "missing" as const }
             const plan = yield* readPlanRevision(authority.planID)
             const grounding = plan && plan.revision !== "v1" ? plan.grounding : undefined
             if (!plan || plan.sessionID !== binding.sessionID || !grounding)
              return { status: "missing" as const }
            const source = yield* readAtlasSource(authority.session)
             if (source.identityHash !== grounding.sourceIdentityHash) return outcome(false)
            const compiled = compileContextToolPlan({
              actor: { projectId: binding.projectID, sessionId: binding.sessionID, memberId: "maestro" },
              revision: {
                id: plan.id,
                hash: plan.revisionHash,
                projectId: binding.projectID,
                sessionId: binding.sessionID,
              },
              territories: plan.scope.map((field) => field.value),
               units: grounding.units,
              context: source.context,
            })
            return outcome(compiled.status === "READY" && compiled.plan.actions.length > 0)
          }).pipe(
            Effect.provideService(Database.Service, database),
            Effect.provideService(Config.Service, config),
            Effect.provideService(Git.Service, git),
            Effect.provideService(FileSystem.FileSystem, fs),
          ),
        ),
    ],
    ["surface-compiler", fixed(["run", "typecheck"])],
    ["package-verification", (binding) => under(binding.directory, Effect.gen(function* () {
      const authority = yield* approved({ ...binding, planID: undefined })
      const actor = yield* agents.get(authority.session.agent ?? "maestro")
      const acquired = yield* ArsenalVerification.run(binding.directory, (command) => permission.ask({ permission: "bash", patterns: [command], always: [], metadata: { completionCheck: true }, sessionID: authority.session.id, ruleset: Permission.merge(actor.permission, authority.session.permission ?? []) }).pipe(Effect.orDie)).pipe(Effect.provideService(FSUtil.Service, fs), Effect.provideService(AppProcess.Service, processes))
      runnerReports.set(binding, acquired)
      return acquired.outcome
    }))],
  ])
   const host: ArsenalCompletion.Host = {
    resolve,
    checks,
    relay: ArsenalCompletion.locationRelay((ref) => locations.get(ref)),
    observe: (binding, capture) =>
      Effect.gen(function* () {
        const part = yield* database.db
          .select({ messageID: PartTable.message_id })
          .from(PartTable)
          .where(
            and(
              eq(PartTable.session_id, SessionID.make(binding.sessionID)),
              sql`json_extract(${PartTable.data}, '$.callID') = ${binding.callID}`,
            ),
          )
          .get()
          .pipe(Effect.orDie)
        if (!part) return yield* new ToolSafety.Denied({ reason: "completion-native-call-message-missing" })
        yield* observations.emit({
          sessionID: SessionID.make(binding.sessionID),
          assistantMessageID: part.messageID,
          callID: binding.callID,
          placement: { directory: binding.directory, projectID: binding.projectID },
          fact: {
            source: "native-host",
            version: 1,
            kind: "completion-check",
            tool: "task",
            planID: binding.planID,
            token: binding.token,
            capture,
            runner: runnerReports.get(binding),
          },
        })
      }).pipe(Effect.orDie),
   }
   const held = (error: unknown) => error instanceof RelayWorkflowBinding.Held ? error
     : new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_ACQUISITION" })
   const workflowContext = yield* Effect.context<Database.Service | Session.Service | Agent.Service |
     Config.Service | Git.Service | FileSystem.FileSystem | EventV2Bridge.Service>().pipe(
     Effect.provideService(FileSystem.FileSystem, fs), Effect.provideService(EventV2Bridge.Service, events),
   )
   const currentRevision = (sessionID: string, planRevisionID: string) => Effect.gen(function* () {
     const rows = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, sessionID))
       .orderBy(desc(EventTable.seq)).all().pipe(Effect.orDie)
     const latest = rows.find((row) => [1, 2, 3].some((version) =>
       row.type === EventV2.versionedType(MaestroEvent.PlanRevision.Recorded.type, version)))
     if (!latest || latest.id !== planRevisionID)
       return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PLAN_REVISION_STALE" })
   })
   const coldReview = (binding: ArsenalCompletion.Binding) => under(binding.directory, Effect.gen(function* () {
     const rows = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, binding.sessionID))
       .orderBy(desc(EventTable.seq)).all().pipe(Effect.orDie)
     const selected = rows.find((row) => [1, 2, 3].some((version) =>
       row.type === EventV2.versionedType(MaestroEvent.Validation.Recorded.type, version)) && row.data.planRevisionID === binding.planID)
     const validation = selected ? yield* readValidation(selected.id) : undefined
     const review = validation ? yield* findReview(binding.sessionID, validation.id) : undefined
     const reviewer = roster.find((member) => member.memberId === "lucy")
     const nativeReviewer = yield* agents.get("lucy")
     if (!validation || validation.outcome !== "VALID" || validation.projectID !== binding.projectID || !review ||
       review.data.verdict !== "APPROVE" || review.data.reviewerID !== "lucy" ||
       review.data.routedMemberID === "lucy" || review.data.workCardHash !== validation.workCardHash ||
       review.data.reviewPolicyHash !== validation.reviewPolicyHash || review.data.projectID !== binding.projectID ||
       !reviewer?.nativeProfile || nativeReviewer?.id !== "lucy" || nativeReviewer.native !== true ||
       validation.rosterHash !== rosterHash(roster) ||
       validation.reviewPolicyHash !== reviewPolicyHash(reviewer, nativeProfiles[reviewer.nativeProfile]) ||
       review.data.rosterHash !== validation.rosterHash || review.data.grantHash !== validation.grantHash ||
       !isDeepStrictEqual(review.data.actor, validation.actor) ||
       ![review.data.artifact.baseSHA, review.data.artifact.headSHA].every((sha) => /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(sha)))
       return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_COLD_REVIEW_MISSING" })
     const status = yield* git.run(["status", "--porcelain=v1", "--untracked-files=all"], { cwd: binding.directory })
     const head = yield* git.run(["rev-parse", "HEAD"], { cwd: binding.directory })
     const placement = yield* InstanceState.context
     const diff = yield* git.run(["diff", "--binary", "--full-index", "--no-ext-diff", "--no-renames",
       "--src-prefix=a/", "--dst-prefix=b/", review.data.artifact.baseSHA, review.data.artifact.headSHA, "--", "."],
       { cwd: review.data.artifact.worktree, maxOutputBytes: 2 * 1024 * 1024 })
     if (status.exitCode || status.truncated || status.text().trim() || head.exitCode || head.truncated ||
       head.text().trim() !== review.data.artifact.headSHA || diff.exitCode || diff.truncated || !diff.stdout.length ||
       RelayWorkflowBinding.digest(diff.stdout) !== review.data.artifact.sha256 ||
       (yield* fs.realPath(review.data.artifact.worktree)) !== (yield* fs.realPath(placement.worktree)))
       return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_COLD_REVIEW_STALE" })
   }).pipe(Effect.provide(workflowContext)))
   checks.set("cold-review", (binding) => coldReview(binding).pipe(Effect.as(outcome(true))))
   const workflowHost: WorkflowBinding.Host = {
     publication: (placement) => Effect.gen(function* () {
       const relay = yield* host.relay(placement)
       if (path.basename(relay.paths.root) !== placement.projectID)
         return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PUBLICATION_PROJECT_MISMATCH" })
       const catalog = yield* SkillV2.Service.pipe(Effect.provide(locations.get(Location.Ref.make({
         directory: AbsolutePath.make(placement.directory) }))))
       return {
         projectID: placement.projectID,
         use: <A, E>(read: (store: Pick<AuthoringStore.Interface, "get" | "version">) => Effect.Effect<A, E>) =>
           Effect.scoped(Effect.gen(function* () {
             const store = yield* AuthoringStore.open(relay.paths.root, placement.projectID)
             return yield* read({ get: store.get, version: store.version })
           })).pipe(Effect.catchDefect(() => Effect.fail(new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PUBLICATION_ACQUISITION" })))),
         skills: (name: string) => catalog.list().pipe(Effect.flatMap((list) => {
           const skill = list.find((entry) => entry.name === name)
           if (!skill || !skill.content.trim() || skill.content.includes("\0") || Buffer.byteLength(skill.content) > 2 * 1024 * 1024)
             return Effect.fail(new AuthoringGraph.Refusal({ status: 404, code: "skill-unavailable", message: "Skill unavailable" }))
           return Effect.succeed({ id: skill.name, content: skill.content,
             sha256: RelayWorkflowBinding.digest(Buffer.from(skill.content)) })
         })),
       } satisfies RelayWorkflowBinding.PublicationPort
     }).pipe(Effect.mapError(held)),
     verifyUpstream: (id) => Effect.gen(function* () {
       const revision = yield* readWorkflowRevision(id)
       if (!revision.upstreamAttribution) return yield* new RelayWorkflowBinding.Held({ reason: "UPSTREAM_ATTRIBUTION_MISSING" })
       if (revision.workflowBinding.publication.projectID !== revision.upstreamAttribution.projectID)
         return yield* new RelayWorkflowBinding.Held({ reason: "UPSTREAM_ATTRIBUTION_PROJECT_MISMATCH" })
       const session = yield* sessions.get(SessionID.make(revision.sessionID))
       const observed = yield* under(session.directory, UpstreamProvenance.observe(revision.upstreamAttribution))
       if (!isDeepStrictEqual(observed, revision.upstreamAttribution))
         return yield* new RelayWorkflowBinding.Held({ reason: "UPSTREAM_ATTRIBUTION_TASK_MISMATCH" })
     }).pipe(Effect.provide(workflowContext), Effect.mapError((error) => error instanceof UpstreamProvenance.Denied
       ? new RelayWorkflowBinding.Held({ reason: error.code }) : held(error))),
     approve: (input, definition, phase) => under(input.directory, Effect.gen(function* () {
       const revision = yield* readWorkflowRevision(input.workflow.planRevisionID)
       yield* currentRevision(input.sessionID, revision.id)
       const owner = yield* agents.get("maestro")
       const actor = yield* agents.get(input.subagentType)
       if (owner?.id !== "maestro" || owner.native !== true)
         return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_NATIVE_OWNER_MISSING" })
       if (actor?.native !== true || actor.mode !== "subagent")
         return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_NATIVE_WORKER_MISSING" })
       const task = yield* WorkflowBinding.taskCall(input.sessionID, input.assistantMessageID, input.callID)
       const intent = Schema.decodeUnknownSync(Schema.Struct({ authorizationID: Schema.optional(Schema.String),
         governed: Schema.optional(Schema.Struct({ approvalMessageID: Schema.String, planRevisionID: Schema.String, taskHash: Schema.String })) }))(task.input)
       const approval = phase === "dispatch" ? yield* recordApproval(input.sessionID) : yield* Effect.gen(function* () {
         // Continue the already reserved Task under its observed owner decision. A synthetic Task delivery or a
         // later resume message is not a fresh owner reply and cannot create or erase that original decision.
         const rows = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, input.sessionID))
           .orderBy(desc(EventTable.seq)).all().pipe(Effect.orDie)
         const latest = rows.find((row) => row.type === EventV2.versionedType(MaestroEvent.Approval.Presented.type, 1))
         const presentation = latest ? Schema.decodeUnknownSync(MaestroEvent.Approval.Presented.data)(latest.data) : undefined
         const selected = rows.find((row) => row.type === EventV2.versionedType(MaestroEvent.Approval.Decided.type, 1) &&
           row.data.presentationID === presentation?.id)
         if (!selected) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_DIRECT_APPROVAL_MISSING" })
         const decision = Schema.decodeUnknownSync(MaestroEvent.Approval.Decided.data)(selected.data)
         if (decision.outcome !== "APPROVED" || !presentation || presentation.planRevisionID !== revision.id ||
           presentation.taskHash !== decision.taskHash || presentation.revisionHash !== decision.revisionHash ||
           presentation.validationHash !== decision.validationHash || presentation.contextHash !== decision.contextHash ||
           presentation.policyHash !== decision.policyHash || presentation.assistantMessageID !== decision.presentationMessageID)
           return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_APPROVAL_BINDING_MISMATCH" })
         const reserved = rows.some((row) =>
           row.type === EventV2.versionedType(MaestroEvent.Approval.ReservedV2.type, 2) &&
             row.data.presentationID === decision.presentationID && row.data.callID === input.callID &&
             row.data.taskHash === decision.taskHash ||
           row.type === EventV2.versionedType(MaestroEvent.Dispatch.ReservedV2.type, 2) &&
             row.data.authorizationID === intent.authorizationID && row.data.sessionID === input.sessionID)
         if (!reserved) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_APPROVAL_RESERVATION_MISSING" })
         return { status: "APPROVED" as const, decision: { ...decision,
           actor: { projectId: decision.projectID, sessionId: decision.sessionID, memberId: decision.memberID } } }
       })
       if (approval.status !== "APPROVED") return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_DIRECT_APPROVAL_MISSING" })
       const authorization = intent.authorizationID ? yield* readAuthorization(intent.authorizationID) : undefined
       if (intent.governed ? intent.governed.approvalMessageID !== approval.decision.approvalMessageID ||
         intent.governed.planRevisionID !== revision.id || intent.governed.taskHash !== approval.decision.taskHash
         : !authorization || authorization.sessionID !== input.sessionID || authorization.projectID !== input.projectID ||
           authorization.validationRecordID !== approval.decision.validationRecordID ||
           authorization.approvalMessageID !== approval.decision.approvalMessageID || authorization.routedMemberID !== input.subagentType)
         return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_APPROVAL_BINDING_MISMATCH" })
       const validation = yield* readValidation(approval.decision.validationRecordID)
       const reviewer = roster.find((member) => member.memberId === "lucy")
       const context = validation?.contextRecordID ? yield* readContext(validation.contextRecordID) : undefined
       if (!validation || !context || validation.outcome !== "VALID" || validation.sessionID !== input.sessionID ||
         validation.projectID !== input.projectID || validation.planRevisionID !== revision.id ||
         canonicalMemberId(validation.routedMemberID) !== (actor.id ?? input.subagentType) ||
         validation.rosterHash !== rosterHash(roster) || !reviewer?.nativeProfile ||
         validation.reviewPolicyHash !== reviewPolicyHash(reviewer, nativeProfiles[reviewer.nativeProfile]) ||
         context.sessionID !== input.sessionID || context.projectID !== input.projectID || context.directory !== input.directory ||
         context.planRevisionID !== revision.id || validation.contextHash !== context.contextHash ||
         approval.decision.actor.memberId !== "maestro" || approval.decision.actor.projectId !== input.projectID ||
         approval.decision.actor.sessionId !== input.sessionID || approval.decision.planRevisionID !== revision.id ||
         approval.decision.revisionHash !== revision.revisionHash || approval.decision.validationHash !== validationRecordHash(validation) ||
         approval.decision.contextHash !== context.contextHash || approval.decision.policyHash !== validation.reviewPolicyHash ||
         approval.decision.taskHash !== taskHash({ subagentType: input.subagentType, prompt: input.prompt, model: input.model,
           planRevisionID: revision.id, revisionHash: revision.revisionHash, validationRecordID: validation.id,
           validationHash: validationRecordHash(validation), contextHash: context.contextHash, policyHash: validation.reviewPolicyHash,
           workflowBinding: definition, writePaths: input.writePaths }))
         return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_APPROVAL_BINDING_MISMATCH" })
       if (phase === "dispatch" && (!(yield* contextIsCurrent(context)) || context.changedPaths.length))
         return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_CONTEXT_STALE" })
       if (phase === "continuation") {
         // Approved implementation may move HEAD. It may not widen the original context's write roots.
         if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(context.headSHA))
           return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_CONTEXT_STALE" })
         const placement = yield* InstanceState.context
         const worktree = placement.worktree === "/" ? placement.directory : placement.worktree
         const changes = yield* Effect.forEach([
           ["diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", context.headSHA, "--", "."],
           ["ls-files", "--full-name", "--others", "--exclude-standard", "-z"],
         ], (args) => git.run(args, { cwd: worktree, maxOutputBytes: 512 * 1024 }))
         if (changes.some((result) => result.exitCode || result.truncated || result.stdout.length && !result.text().endsWith("\0")) ||
           changes.flatMap((result) => result.text().split("\0").filter(Boolean)).some((file) =>
             !definition.writePaths.some((root) => FSUtil.contains(path.resolve(worktree, root), path.resolve(worktree, file)))))
           return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_APPROVED_SCOPE_MISMATCH" })
       }
       if (revision.grounding) {
         const source = yield* readAtlasSource(yield* sessions.get(SessionID.make(input.sessionID)))
         if (source.identityHash !== revision.grounding.sourceIdentityHash)
           return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_CONTEXT_SOURCE_STALE" })
       }
     }).pipe(Effect.provide(workflowContext), Effect.mapError(held))),
     complete: (binding) => Effect.gen(function* () {
       yield* currentRevision(binding.authoritySessionID, binding.planRevisionID)
       const session = yield* sessions.get(SessionID.make(binding.authoritySessionID))
       const current = yield* workflowSessionHost.current(yield* WorkflowBinding.read(binding.executionSessionID).pipe(
         Effect.flatMap((stored) => stored ? Effect.succeed(stored) : Effect.fail(new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISSING" }))),
         Effect.provideService(Database.Service, database)))
       if (current.view.state !== "complete") return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_CHAIN_INCOMPLETE" })
       yield* coldReview({ sessionID: session.id, taskID: binding.executionSessionID, callID: "",
         directory: session.directory, projectID: session.projectID, planID: binding.planRevisionID,
         token: current.token, stateDirectory: "", ownedPaths: binding.definition.writePaths })
     }).pipe(Effect.mapError(held)),
   }
   const reconstruct = (bound: Schema.Schema.Type<typeof MaestroEvent.Task.WorkflowBound.data>) => Effect.gen(function* () {
     const parent = yield* sessions.get(SessionID.make(bound.binding.authoritySessionID))
     return yield* under(parent.directory, Effect.gen(function* () {
       const call = yield* WorkflowBinding.taskCall(parent.id, bound.authorityMessageID, bound.authorityCallID)
       const input = yield* Schema.decodeUnknownEffect(Schema.Struct({ subagent_type: Schema.String, prompt: Schema.String,
         model: Schema.optional(Schema.String), writePaths: Schema.optional(Schema.Array(Schema.String)), workflow: WorkflowBinding.Selection }))(call.input)
       if (input.workflow.planRevisionID !== bound.binding.planRevisionID || parent.projectID !== bound.binding.definition.publication.projectID)
         return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" })
       const completion = yield* ArsenalCompletion.make.pipe(Effect.provideService(ArsenalCompletion.NativeHost, host))
       const receipt = yield* completion.beforeDispatch({ sessionID: parent.id, taskID: bound.executionSessionID,
         callID: bound.authorityCallID, directory: parent.directory, projectID: parent.projectID, planID: bound.binding.planRevisionID,
         workflow: { selection: input.workflow, assistantMessageID: bound.authorityMessageID,
           logicalTaskID: bound.binding.logicalTaskID, writePaths: input.writePaths ?? [],
           subagentType: input.subagent_type, prompt: input.prompt, model: input.model } })
       const native = completion.workflowSessionHost(receipt)
       if (!native) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_NATIVE_HOST_UNBOUND" })
       return native
     }).pipe(Effect.provideService(WorkflowBinding.NativeHost, workflowHost)))
   }).pipe(Effect.provide(workflowContext), Effect.provideService(FSUtil.Service, fs),
     Effect.provideService(AppProcess.Service, processes), Effect.mapError(held))
   const workflowSessionHost: RelayWorkflowSession.Host = {
     current: (bound) => reconstruct(bound).pipe(Effect.flatMap((native) => native.current(bound))),
     settle: (current, settlement) => Effect.gen(function* () {
       const bound = yield* WorkflowBinding.read(current.binding.executionSessionID)
       if (!bound || bound.token !== current.token || !isDeepStrictEqual(bound.binding, current.binding))
         return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" })
       const native = yield* reconstruct(bound)
       return yield* native.settle(current, settlement)
     }).pipe(Effect.provideService(Database.Service, database), Effect.mapError(held)),
   }
  // A release request (Maestro condition 2) names an arm this session armed natively; the owner's answer decides.
  const release = Effect.fn("ArsenalBindings.release")(function* (context: { sessionID: string; assistantMessageID: string; callID: string }, args: unknown) {
    const request = Schema.decodeUnknownOption(Schema.Struct({ token: Schema.NonEmptyString, reason: Schema.NonEmptyString }))(args)
    if (Option.isNone(request)) return yield* new ToolFailure({ message: "COMPLETION_RELEASE_INVALID" })
    const session = yield* sessions.get(SessionID.make(context.sessionID)).pipe(Effect.mapError(() => new ToolFailure({ message: "ARSENAL_SESSION_MISSING" })))
    const armed = yield* arms(session.id).pipe(Effect.mapError((error) => new ToolFailure({ message: error.reason })))
    if (!armed.some((entry) => entry.fact.token === request.value.token)) return yield* new ToolFailure({ message: "COMPLETION_RELEASE_TOKEN_UNBOUND" })
    return yield* ArsenalCompletion.release({
      relay: yield* host.relay(session).pipe(Effect.mapError(() => new ToolFailure({ message: "COMPLETION_RELEASE_UNAVAILABLE" }))),
      token: request.value.token,
      reason: request.value.reason,
      approve: (message) => approvalHost.ask({ action: "completion_release", resources: [`relay-arm:${request.value.token}`], message,
        invocation: { tool: MaestroArsenal.names.execute, args, sessionID: session.id, callID: context.callID,
          assistantMessageID: context.assistantMessageID, directory: session.directory, projectID: session.projectID } }),
    })
  })
  const withSession = <A, E, R>(sessionID: string, effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const session = yield* sessions.get(SessionID.make(sessionID)).pipe(Effect.orDie)
      return yield* under(
        session.directory,
        Effect.gen(function* () {
          const local = yield* InstanceState.get(state).pipe(Effect.orDie)
          return yield* effect.pipe(
            Effect.provideService(ToolSafety.RuntimeProfileLoader, WriteRoots.loader(local.loadProfile, () => sessions.get(session.id).pipe(Effect.orDie))),
            Effect.provideService(ArsenalCompletion.NativeHost, host),
             Effect.provideService(WorkflowBinding.NativeHost, workflowHost),
             Effect.provideService(RelayWorkflowSession.NativeHost, workflowSessionHost),
            Effect.provideService(ToolSafety.NativeHost, approvalHost),
            Effect.provideService(ToolSafety.NativeContext, { directory: session.directory, projectID: session.projectID }),
          )
        }),
      )
    })
  const run = <A, E, R>(
    input: ToolSafety.Invocation & { assistantMessageID: string; directory: string; projectID: string },
    effect: Effect.Effect<A, E, R>,
    durableSafety = true,
    aborted = () => false,
  ) =>
    safety.run(input, effect.pipe(Effect.tap(ToolSafety.inspect)), (value) =>
      durableSafety ? observations
        .emit({
          sessionID: SessionID.make(input.sessionID),
          assistantMessageID: input.assistantMessageID,
          callID: input.callID,
          placement: input,
          fact: {
            source: "native-host",
            version: 1,
            kind: "safety",
            tool: value.tool,
            outcome: value.outcome === "failure" && aborted() ? "cancelled" : value.outcome,
            reason: value.reason,
          },
        })
        .pipe(Effect.orDie) : Effect.void,
      (value) => classifyOutcome(value, aborted()),
    )
  return {
    withSession,
    run,
     approvalHost,
     workflowSessionHost,
    wrapTools: Effect.fn("ArsenalBindings.wrapTools")(function* (
      input: { sessionID: string; assistantMessageID: string; agent?: string; directory: string; projectID: string },
      tools: Record<string, Tool>,
    ) {
      const bridge = yield* EffectBridge.make()
      return Object.fromEntries(
        Object.entries(tools).map(([name, definition]) => {
          const execute = definition.execute
          if (!execute) return [name, definition]
          return [
            name,
            {
              ...definition,
              execute: (args: unknown, options: Parameters<typeof execute>[1]) =>
                bridge.promise(
                  run(
                    { ...input, tool: name, args, callID: options.toolCallId },
                    Effect.promise(async () => execute(args, options)),
                    true,
                    () => options.abortSignal?.aborted === true,
                  ).pipe(Effect.provideService(ToolSafety.HookedCall, options.toolCallId), Effect.orDie),
                ),
            },
          ]
        }),
      )
    }),
     construct: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
       effect.pipe(Effect.provideService(ArsenalCompletion.NativeHost, host),
         Effect.provideService(WorkflowBinding.NativeHost, workflowHost)),
    observe: (
      input: { sessionID: string; assistantMessageID: string; callID: string; directory: string; projectID: string },
      value: ToolSafety.Observation,
    ) =>
      observations
        .emit({
          sessionID: SessionID.make(input.sessionID),
          assistantMessageID: input.assistantMessageID,
          callID: input.callID,
          placement: input,
          fact: {
            source: "native-host",
            version: 1,
            kind: "safety",
            tool: value.tool,
            outcome: value.outcome,
            reason: value.reason,
          },
        })
        .pipe(Effect.orDie),
    beforeExecute: (sessionID: string, name: string, args: unknown) =>
      Effect.gen(function* () {
        yield* ToolSafety.inspect(args).pipe(
          Effect.mapError(() => new ToolFailure({ message: "ARSENAL_INPUT_DENIED" })),
        )
        if (name !== "relay-arm") return
        if (yield* WorkflowBinding.read(sessionID).pipe(Effect.provideService(Database.Service, database)))
          return yield* new ToolFailure({ message: "WORKFLOW_NATIVE_ARM_MUTATION_REFUSED" })
        const input = Schema.decodeUnknownOption(
          Schema.Struct({
            action: Schema.String,
            contract: Schema.optional(Schema.Struct({ sessionID: Schema.String })),
          }),
        )(args)
        if (Option.isSome(input) && input.value.action === "arm" && input.value.contract?.sessionID !== sessionID)
          return yield* new ToolFailure({ message: "COMPLETION_ARM_SESSION_MISMATCH" })
      }),
    afterExecute: (
      context: { sessionID: string; assistantMessageID: string; callID: string },
      name: string,
      args: unknown,
      result: unknown,
    ) =>
      Effect.gen(function* () {
        yield* ToolSafety.inspect(result).pipe(
          Effect.mapError(() => new ToolFailure({ message: "ARSENAL_RAW_RESULT_DENIED" })),
        )
        if (name !== "relay-arm") return
        const action = Schema.decodeUnknownOption(Schema.Struct({ action: Schema.Literals(["arm", "release"]) }))(args)
        if (Option.isNone(action)) return
        if (action.value.action === "release") return yield* release(context, args)
        const envelope = Schema.decodeUnknownSync(
          Schema.Struct({ content: Schema.Array(Schema.Struct({ text: Schema.String })) }),
        )(result)
        const receipt = Schema.decodeUnknownSync(
          Schema.Struct({ token: Schema.NonEmptyString, contract: Schema.Struct({ sessionID: Schema.String }) }),
        )(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(envelope.content[0].text))
        if (receipt.contract.sessionID !== context.sessionID)
          return yield* new ToolFailure({ message: "COMPLETION_ARM_SESSION_MISMATCH" })
        const session = yield* sessions
          .get(SessionID.make(context.sessionID))
          .pipe(Effect.mapError(() => new ToolFailure({ message: "ARSENAL_SESSION_MISSING" })))
        yield* observations.emit({
          ...context,
          sessionID: session.id,
          placement: { directory: session.directory, projectID: session.projectID },
          fact: {
            source: "native-host",
            version: 1,
            kind: "completion-arm",
            tool: MaestroArsenal.names.execute,
            token: receipt.token,
          },
        })
      }),
  }
})

export const classifyOutcome = ArsenalOutcome.classifyOutcome
export const makeApprovalHost = ArsenalApproval.makeApprovalHost
export const nativeSafetyNode = ArsenalApproval.nativeSafetyNode
export const nativeRegistryReplacements = ArsenalApproval.nativeRegistryReplacements
