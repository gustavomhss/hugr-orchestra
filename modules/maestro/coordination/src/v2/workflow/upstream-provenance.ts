export * as UpstreamProvenanceV2 from "./upstream-provenance"

import { isDeepStrictEqual } from "node:util"
import { Effect, Option, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { SessionMessage } from "@orchestra/core/session/message"
import { TaskTool } from "@orchestra/core/tool/task"
import { UpstreamAttribution } from "@orchestra/schema/upstream-attribution"
import { Seats } from "../../seats"
import { SessionAuthority } from "../../session-authority"
import { UpstreamResult } from "../../upstream-result"
import { LogicalTaskV2 } from "../governance/logical-task"

// Upstream provenance: an upstream plan revision
// names the archie Task that authored it, and only stored host facts may establish that authorship.

export class Denied extends Schema.TaggedErrorClass<Denied>()("UpstreamAttributionDenied", {
  code: Schema.Literals([
    "UPSTREAM_ATTRIBUTION_MISSING",
    "UPSTREAM_ATTRIBUTION_PROJECT_MISMATCH",
    "UPSTREAM_ATTRIBUTION_REGISTRY_MISMATCH",
    "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH",
    "UPSTREAM_ATTRIBUTION_AUTHOR_MISMATCH",
    "UPSTREAM_ATTRIBUTION_TASK_MISMATCH",
    "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE",
  ]),
  message: Schema.String,
}) {}

/**
 * The attribution of an upstream proposal, observed from stored facts only: the parent's Maestro assistant holds one
 * completed native Task call to archie placed at the author Session, the author is that Session's retained logical
 * Task, and the Task's settled upstream card is the card of the author's exact reply to that call's prompt. V2's Task
 * refuses background upstream work at admission, so only a foreground settlement can attribute.
 */
export const observe = Effect.fn("UpstreamProvenanceV2.observe")(function* (
  services: Omit<LogicalTaskV2.Services, "canonical">,
  input: Pick<
    UpstreamAttribution.V1,
    | "projectID"
    | "parentSessionID"
    | "parentMessageID"
    | "parentCallID"
    | "authorSessionID"
    | "authorMessageID"
    | "logicalTaskID"
  > & { readonly dispatchKind?: UpstreamAttribution.V2["dispatch"]["kind"] },
) {
  if (!input.parentCallID || !input.logicalTaskID)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_MISSING", message: "Task call and logical Task references are required" })
  const seat = Seats.find("archie")
  if (!seat || seat.profileKey !== "upstream" || seat.workResult !== UpstreamResult.SCHEMA)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_REGISTRY_MISMATCH", message: "Native archie upstream seat is unavailable or inconsistent" })
  // The earlier runtime verifies a Claude Code Agent dispatch through evidence its host mirrors from in-process hooks; V2 records none.
  if (input.dispatchKind === "claude-code-agent")
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE", message: "HOLD: V2 records no Claude Code Agent dispatch evidence to verify" })

  const parent = yield* services.store.get(input.parentSessionID)
  const child = yield* services.store.get(input.authorSessionID)
  if (!parent || !child)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_MISSING", message: "Parent or author Session is missing" })
  if (parent.projectID !== input.projectID || child.projectID !== input.projectID)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PROJECT_MISMATCH", message: "Parent and author Sessions must belong to the expected Project" })
  if (child.id === parent.id || child.parentID !== parent.id)
    return yield* new Denied({
      code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH",
      message: `Author Session ${child.id} was dispatched by ${child.parentID ?? "no parent Session"}, not by this Session ${parent.id}. Record the plan revision in the Session whose Maestro dispatched the archie Task.`,
    })
  if (child.agent !== seat.id)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_AUTHOR_MISMATCH", message: "Author Session does not belong to native archie" })

  const dispatch = yield* services.store.message(input.parentMessageID)
  if (dispatch?.sessionID !== parent.id || dispatch.message.type !== "assistant" || dispatch.message.agent !== AgentV2.defaultID)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", message: "Dispatch parent must be an actual Maestro assistant" })
  const calls = dispatch.message.content.filter(
    (part): part is SessionMessage.AssistantTool => part.type === "tool" && part.id === input.parentCallID,
  )
  const call = calls[0]
  // A pending call's input is still raw text; it reaches the not-completed hold below instead.
  if (
    calls.length !== 1 ||
    !call ||
    call.name !== TaskTool.name ||
    call.provider?.executed ||
    (call.state.status !== "pending" && call.state.input.subagent_type !== seat.id)
  )
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", message: "Dispatch parent must contain one exact native Task dispatch to archie" })
  if (dispatch.message.error || dispatch.message.finish === "error" || call.state.status !== "completed")
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE", message: "Parent or Task failed, was interrupted, or has not completed" })
  const output = Option.getOrUndefined(Schema.decodeUnknownOption(TaskTool.Output)(call.state.structured))
  if (output?.parentSessionId !== parent.id || output.sessionId !== child.id)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH", message: "Host Task placement does not match the parent and author Sessions" })

  // Logical authority scopes the stored Session tree; dispatch and delivery anchors stay with the immediate parent.
  const authority = yield* SessionAuthority.make(services.store.get)(parent.id, input.projectID).pipe(
    Effect.mapError((error) => new Denied({ code: "UPSTREAM_ATTRIBUTION_TASK_MISMATCH", message: `Stored parent ancestry is invalid: ${error.reason}` })),
  )
  // Reading a binding never canonicalizes a member id, so the identity spelling is exact.
  const logical = yield* LogicalTaskV2.read({ ...services, canonical: (id) => id }, child.id).pipe(
    // Parent ancestry and both endpoint Projects already match, so this reason names a foreign binding Project.
    Effect.mapError((error) => new Denied({
      code: error.message.endsWith(": session-project-mismatch") ? "UPSTREAM_ATTRIBUTION_PROJECT_MISMATCH" : "UPSTREAM_ATTRIBUTION_TASK_MISMATCH",
      message: error.message,
    })),
  )
  if (!logical) return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_MISSING", message: "Retained logical Task binding is missing" })
  if (logical.projectID !== input.projectID)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PROJECT_MISMATCH", message: "Retained logical Task belongs to another Project" })
  // The binding has already passed LogicalTask admission. Do not redeclare its user-named Task grammar.
  if (
    logical.taskId.startsWith("ses_") ||
    logical.taskId === child.id ||
    logical.taskId !== input.logicalTaskID ||
    logical.executionSessionID !== child.id ||
    logical.authoritySessionID !== authority.rootID ||
    logical.memberID !== seat.id
  )
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_TASK_MISMATCH", message: "Retained logical Task identity, execution, member, or authority does not match" })

  const author = yield* services.store.message(input.authorMessageID)
  if (author?.sessionID !== child.id || author.message.type !== "assistant" || author.message.agent !== seat.id)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_AUTHOR_MISMATCH", message: "Proposal must be an actual archie assistant" })
  const card = UpstreamResult.parse(author.message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n"))
  if (!card || card.outcome !== "done" || card.blockers.length)
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE", message: "Author has no unique parsed successful terminal upstream proposal" })
  const history = yield* services.store.entries(child.id).pipe(
    Effect.mapError(() => new Denied({ code: "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE", message: "Author Session history is unreadable" })),
  )
  // The Task settles the child's completed reply to the prompt this exact call admitted; it must be the author's
  // message, and the card the Task settled must be the card that message carries.
  const reply = TaskTool.completedReply(
    history.map((entry) => entry.message),
    TaskTool.taskPromptID(
      { sessionID: parent.id, agent: AgentV2.defaultID, assistantMessageID: dispatch.message.id, toolCallID: call.id },
      child.id,
    ),
  )
  if (reply?.id !== author.message.id || !isDeepStrictEqual(output.structured?.upstreamResult, card))
    return yield* new Denied({ code: "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE", message: "Host Task completion does not select this exact successful proposal" })

  return Schema.decodeUnknownSync(UpstreamAttribution.V1)({
    schema: "maestro-upstream-attribution-v1",
    projectID: parent.projectID,
    memberID: seat.id,
    profile: seat.profileKey,
    authorSessionID: child.id,
    authorMessageID: author.message.id,
    parentSessionID: parent.id,
    parentMessageID: dispatch.message.id,
    parentCallID: call.id,
    logicalTaskID: logical.taskId,
  })
})
