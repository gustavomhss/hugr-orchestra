export * as WorkflowHost from "./workflow-host"

import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { desc, eq } from "drizzle-orm"
import { Context, Effect, FileSystem, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppProcess } from "@orchestra/core/process"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { RelayWorkflowSession } from "@orchestra/core/relay-workflow-session"
import { SkillV2 } from "@orchestra/core/skill"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { AuthoringGraph } from "@orchestra/relay/authoring/graph"
import { AuthoringStore } from "@orchestra/relay/authoring/store"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { ArsenalCompletion } from "./arsenal-completion"
import { readAtlasSource } from "./atlas-source"
import { recordApproval } from "./approval-record"
import { readAuthorization } from "./authorization"
import { contextIsCurrent, readContext } from "./context-record"
import { readWorkflowRevision } from "./plan-revision"
import { canonicalMemberId, nativeProfiles, roster } from "./roster"
import { taskHash } from "./task-hash"
import { UpstreamProvenance } from "./upstream-provenance"
import {
  findReview,
  readValidation,
  reviewPolicyHash,
  rosterHash,
  validationRecordHash,
} from "./validation-record"
import { WorkflowBinding } from "./workflow-binding"

export type Requirements =
  | Database.Service
  | Session.Service
  | Agent.Service
  | Config.Service
  | Git.Service
  | FileSystem.FileSystem
  | EventV2Bridge.Service

export interface Dependencies {
  readonly database: Database.Interface
  readonly sessions: Session.Interface
  readonly agents: Agent.Interface
  readonly fs: FSUtil.Interface
  readonly git: Git.Interface
  readonly processes: AppProcess.Interface
  readonly completion: ArsenalCompletion.Host
  readonly context: Context.Context<Requirements>
  readonly catalog: (directory: string) => Effect.Effect<SkillV2.Interface, unknown>
  readonly under: <A, E, R>(directory: string, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  readonly approved: (dispatch: ArsenalCompletion.Dispatch) => Effect.Effect<unknown, ToolSafety.Denied>
}

// Captured native services and the existing placement/approval closures. No additional service or Session layer.
export function make(deps: Dependencies) {
  const currentRevision = (sessionID: string, planRevisionID: string) => Effect.gen(function* () {
    const rows = yield* deps.database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, sessionID))
      .orderBy(desc(EventTable.seq)).all().pipe(Effect.orDie)
    const latest = rows.find((row) => [1, 2, 3].some((version) =>
      row.type === EventV2.versionedType(MaestroEvent.PlanRevision.Recorded.type, version)))
    if (!latest || latest.id !== planRevisionID)
      return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PLAN_REVISION_STALE" })
  })

  const coldReview = (binding: ArsenalCompletion.Binding) => deps.under(binding.directory, Effect.gen(function* () {
    const rows = yield* deps.database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, binding.sessionID))
      .orderBy(desc(EventTable.seq)).all().pipe(Effect.orDie)
    const selected = rows.find((row) => [1, 2, 3].some((version) =>
      row.type === EventV2.versionedType(MaestroEvent.Validation.Recorded.type, version)) &&
      row.data.planRevisionID === binding.planID)
    const validation = selected ? yield* readValidation(selected.id) : undefined
    const review = validation ? yield* findReview(binding.sessionID, validation.id) : undefined
    const reviewer = roster.find((member) => member.memberId === "lucy")
    const nativeReviewer = yield* deps.agents.get("lucy")
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
    const status = yield* deps.git.run(["status", "--porcelain=v1", "--untracked-files=all"], { cwd: binding.directory })
    const head = yield* deps.git.run(["rev-parse", "HEAD"], { cwd: binding.directory })
    const placement = yield* InstanceState.context
    const diff = yield* deps.git.run([
      "diff", "--binary", "--full-index", "--no-ext-diff", "--no-renames", "--src-prefix=a/", "--dst-prefix=b/",
      review.data.artifact.baseSHA, review.data.artifact.headSHA, "--", ".",
    ], { cwd: review.data.artifact.worktree, maxOutputBytes: 2 * 1024 * 1024 })
    if (status.exitCode || status.truncated || status.text().trim() || head.exitCode || head.truncated ||
      head.text().trim() !== review.data.artifact.headSHA || diff.exitCode || diff.truncated || !diff.stdout.length ||
      RelayWorkflowBinding.digest(diff.stdout) !== review.data.artifact.sha256 ||
      (yield* deps.fs.realPath(review.data.artifact.worktree)) !== (yield* deps.fs.realPath(placement.worktree)))
      return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_COLD_REVIEW_STALE" })
  }).pipe(Effect.provide(deps.context)))

  const host: WorkflowBinding.Host = {
    publication: (placement) => Effect.gen(function* () {
      const relay = yield* deps.completion.relay(placement)
      if (path.basename(relay.paths.root) !== placement.projectID)
        return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PUBLICATION_PROJECT_MISMATCH" })
      const catalog = yield* deps.catalog(placement.directory)
      return {
        projectID: placement.projectID,
        use: <A, E>(read: (store: Pick<AuthoringStore.Interface, "get" | "version">) => Effect.Effect<A, E>) =>
          Effect.scoped(Effect.gen(function* () {
            const store = yield* AuthoringStore.open(relay.paths.root, placement.projectID)
            return yield* read({ get: store.get, version: store.version })
          })).pipe(Effect.catchDefect(() => Effect.fail(new RelayWorkflowBinding.Held({
            reason: "WORKFLOW_PUBLICATION_ACQUISITION",
          })))),
        skills: (name: string) => catalog.list().pipe(Effect.flatMap((list) => {
          const skill = list.find((entry) => entry.name === name)
          if (!skill || !skill.content.trim() || skill.content.includes("\0") || Buffer.byteLength(skill.content) > 2 * 1024 * 1024)
            return Effect.fail(new AuthoringGraph.Refusal({ status: 404, code: "skill-unavailable", message: "Skill unavailable" }))
          return Effect.succeed({
            id: skill.name,
            content: skill.content,
            sha256: RelayWorkflowBinding.digest(Buffer.from(skill.content)),
          })
        })),
      } satisfies RelayWorkflowBinding.PublicationPort
    }).pipe(Effect.mapError(held)),

    verifyUpstream: (id) => Effect.gen(function* () {
      const revision = yield* readWorkflowRevision(id)
      if (!revision.upstreamAttribution)
        return yield* new RelayWorkflowBinding.Held({ reason: "UPSTREAM_ATTRIBUTION_MISSING" })
      if (revision.workflowBinding.publication.projectID !== revision.upstreamAttribution.projectID)
        return yield* new RelayWorkflowBinding.Held({ reason: "UPSTREAM_ATTRIBUTION_PROJECT_MISMATCH" })
      const session = yield* deps.sessions.get(SessionID.make(revision.sessionID))
      const observed = yield* deps.under(session.directory, UpstreamProvenance.observe(revision.upstreamAttribution))
      if (!isDeepStrictEqual(observed, revision.upstreamAttribution))
        return yield* new RelayWorkflowBinding.Held({ reason: "UPSTREAM_ATTRIBUTION_TASK_MISMATCH" })
    }).pipe(Effect.provide(deps.context), Effect.mapError((error) => error instanceof UpstreamProvenance.Denied
      ? new RelayWorkflowBinding.Held({ reason: error.code }) : held(error))),

    approve: (input, definition, phase) => deps.under(input.directory, Effect.gen(function* () {
      const revision = yield* readWorkflowRevision(input.workflow.planRevisionID)
      yield* currentRevision(input.sessionID, revision.id)
      const owner = yield* deps.agents.get("maestro")
      const actor = yield* deps.agents.get(input.subagentType)
      if (owner?.id !== "maestro" || owner.native !== true)
        return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_NATIVE_OWNER_MISSING" })
      if (actor?.native !== true || actor.mode !== "subagent")
        return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_NATIVE_WORKER_MISSING" })
      const task = yield* WorkflowBinding.taskCall(input.sessionID, input.assistantMessageID, input.callID)
      const intent = Schema.decodeUnknownSync(Schema.Struct({
        authorizationID: Schema.optional(Schema.String),
        governed: Schema.optional(Schema.Struct({
          approvalMessageID: Schema.String,
          planRevisionID: Schema.String,
          taskHash: Schema.String,
        })),
      }))(task.input)
      const approval = phase === "dispatch" ? yield* recordApproval(input.sessionID) : yield* Effect.gen(function* () {
        // Resume reads the already observed owner decision, not a synthetic delivery or a new owner reply.
        const rows = yield* deps.database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, input.sessionID))
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
        return {
          status: "APPROVED" as const,
          decision: {
            ...decision,
            actor: {
              projectId: decision.projectID,
              sessionId: decision.sessionID,
              memberId: decision.memberID,
            },
          },
        }
      })
      if (approval.status !== "APPROVED")
        return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_DIRECT_APPROVAL_MISSING" })
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
        approval.decision.taskHash !== taskHash({
          subagentType: input.subagentType,
          prompt: input.prompt,
          model: input.model,
          planRevisionID: revision.id,
          revisionHash: revision.revisionHash,
          validationRecordID: validation.id,
          validationHash: validationRecordHash(validation),
          contextHash: context.contextHash,
          policyHash: validation.reviewPolicyHash,
          workflowBinding: definition,
          writePaths: input.writePaths,
        }))
        return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_APPROVAL_BINDING_MISMATCH" })
      if (phase === "dispatch" && (!(yield* contextIsCurrent(context)) || context.changedPaths.length))
        return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_CONTEXT_STALE" })
      if (phase === "continuation") {
        // Approved implementation may move HEAD without widening the original write roots.
        if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(context.headSHA))
          return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_CONTEXT_STALE" })
        const placement = yield* InstanceState.context
        const worktree = placement.worktree === "/" ? placement.directory : placement.worktree
        const changes = yield* Effect.forEach([
          ["diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", context.headSHA, "--", "."],
          ["ls-files", "--full-name", "--others", "--exclude-standard", "-z"],
        ], (args) => deps.git.run(args, { cwd: worktree, maxOutputBytes: 512 * 1024 }))
        if (changes.some((result) => result.exitCode || result.truncated || result.stdout.length && !result.text().endsWith("\0")) ||
          changes.flatMap((result) => result.text().split("\0").filter(Boolean)).some((file) =>
            !definition.writePaths.some((root) => FSUtil.contains(path.resolve(worktree, root), path.resolve(worktree, file)))))
          return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_APPROVED_SCOPE_MISMATCH" })
      }
      if (revision.grounding) {
        const source = yield* readAtlasSource(yield* deps.sessions.get(SessionID.make(input.sessionID)))
        if (source.identityHash !== revision.grounding.sourceIdentityHash)
          return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_CONTEXT_SOURCE_STALE" })
      }
    }).pipe(Effect.provide(deps.context), Effect.mapError(held))),

    complete: (binding) => Effect.gen(function* () {
      yield* currentRevision(binding.authoritySessionID, binding.planRevisionID)
      const session = yield* deps.sessions.get(SessionID.make(binding.authoritySessionID))
      const bound = yield* WorkflowBinding.read(binding.executionSessionID).pipe(
        Effect.flatMap((stored) => stored ? Effect.succeed(stored) : Effect.fail(new RelayWorkflowBinding.Held({
          reason: "WORKFLOW_TASK_BINDING_MISSING",
        }))), Effect.provideService(Database.Service, deps.database),
      )
      const current = yield* sessionHost.current(bound)
      if (current.view.state !== "complete")
        return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_CHAIN_INCOMPLETE" })
      yield* coldReview({
        sessionID: session.id,
        taskID: binding.executionSessionID,
        callID: "",
        directory: session.directory,
        projectID: session.projectID,
        planID: binding.planRevisionID,
        token: current.token,
        stateDirectory: "",
        ownedPaths: binding.definition.writePaths,
      })
    }).pipe(Effect.mapError(held)),
  }

  const reconstruct = (bound: Schema.Schema.Type<typeof MaestroEvent.Task.WorkflowBound.data>) => Effect.gen(function* () {
    const parent = yield* deps.sessions.get(SessionID.make(bound.binding.authoritySessionID))
    return yield* deps.under(parent.directory, Effect.gen(function* () {
      const call = yield* WorkflowBinding.taskCall(parent.id, bound.authorityMessageID, bound.authorityCallID)
      const input = yield* Schema.decodeUnknownEffect(Schema.Struct({
        subagent_type: Schema.String,
        prompt: Schema.String,
        model: Schema.optional(Schema.String),
        writePaths: Schema.optional(Schema.Array(Schema.String)),
        workflow: WorkflowBinding.Selection,
      }))(call.input)
      if (input.workflow.planRevisionID !== bound.binding.planRevisionID ||
        parent.projectID !== bound.binding.definition.publication.projectID)
        return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" })
      const dispatch = {
        sessionID: parent.id,
        taskID: bound.executionSessionID,
        callID: bound.authorityCallID,
        directory: parent.directory,
        projectID: parent.projectID,
        planID: bound.binding.planRevisionID,
        workflow: {
          selection: input.workflow,
          assistantMessageID: bound.authorityMessageID,
          logicalTaskID: bound.binding.logicalTaskID,
          writePaths: input.writePaths ?? [],
          subagentType: input.subagent_type,
          prompt: input.prompt,
          model: input.model,
        },
      }
      yield* deps.approved(dispatch)
      const reservations = yield* deps.database.db.select().from(EventTable)
        .where(eq(EventTable.aggregate_id, parent.id)).all().pipe(Effect.orDie)
      const direct = reservations.find((row) =>
        row.type === EventV2.versionedType(MaestroEvent.Approval.ReservedV2.type, 2) &&
        row.data.childSessionID === bound.executionSessionID)
      if (direct) {
        const reserved = Schema.decodeUnknownSync(MaestroEvent.Approval.ReservedV2.data)(direct.data)
        if (reserved.taskHash !== taskHash({
          ...reserved,
          subagentType: input.subagent_type,
          prompt: input.prompt,
          model: input.model,
          workflowBinding: bound.binding.definition,
          writePaths: input.writePaths ?? [],
        }))
          return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_APPROVAL_BINDING_MISMATCH" })
      }
      const completion = yield* ArsenalCompletion.make.pipe(Effect.provideService(ArsenalCompletion.NativeHost, deps.completion))
      const receipt = yield* completion.beforeDispatch(dispatch)
      const native = completion.workflowSessionHost(receipt)
      if (!native) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_NATIVE_HOST_UNBOUND" })
      return native
    }).pipe(Effect.provideService(WorkflowBinding.NativeHost, host)))
  }).pipe(
    Effect.provide(deps.context), Effect.provideService(FSUtil.Service, deps.fs),
    Effect.provideService(AppProcess.Service, deps.processes), Effect.mapError(held),
  )

  const sessionHost: RelayWorkflowSession.Host = {
    current: (bound) => reconstruct(bound).pipe(Effect.flatMap((native) => native.current(bound))),
    settle: (current, settlement) => Effect.gen(function* () {
      const bound = yield* WorkflowBinding.read(current.binding.executionSessionID)
      if (!bound || bound.token !== current.token || !isDeepStrictEqual(bound.binding, current.binding))
        return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_TASK_BINDING_MISMATCH" })
      const native = yield* reconstruct(bound)
      return yield* native.settle(current, settlement)
    }).pipe(Effect.provideService(Database.Service, deps.database), Effect.mapError(held)),
  }

  return { host, sessionHost, coldReview }
}

export function held(error: unknown) {
  return error instanceof RelayWorkflowBinding.Held ? error : new RelayWorkflowBinding.Held({ reason: "WORKFLOW_HOST_ACQUISITION" })
}
