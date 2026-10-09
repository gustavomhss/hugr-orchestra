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
import { readValidation } from "./validation-record"
import { readPlanRevision } from "./plan-revision"
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
import { canonicalMemberId } from "./roster"
import { WriteRoots } from "./write-roots"
import { WorkflowBinding } from "./workflow-binding"
import { RelayWorkflowSession } from "@orchestra/core/relay-workflow-session"
import { SkillV2 } from "@orchestra/core/skill"
import { EventV2Bridge } from "@/event-v2-bridge"
import { AbsolutePath } from "@orchestra/core/schema"
import { WorkflowHost } from "./workflow-host"

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
  const workflowContext = yield* Effect.context<WorkflowHost.Requirements>().pipe(
    Effect.provideService(FileSystem.FileSystem, fs),
    Effect.provideService(EventV2Bridge.Service, events),
  )
  const workflow = WorkflowHost.make({
    database,
    sessions,
    agents,
    fs,
    git,
    processes,
    under,
    approved,
    completion: host,
    context: workflowContext,
    catalog: (directory) => SkillV2.Service.pipe(Effect.provide(locations.get(Location.Ref.make({
      directory: AbsolutePath.make(directory),
    })))),
  })
  checks.set("cold-review", (binding) => workflow.coldReview(binding).pipe(Effect.as(outcome(true))))
  const workflowHost = workflow.host
  const workflowSessionHost = workflow.sessionHost
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
