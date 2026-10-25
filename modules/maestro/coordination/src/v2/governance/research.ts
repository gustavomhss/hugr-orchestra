export * as ResearchDispatchV2 from "./research"

import { ToolFailure } from "@orchestra/llm"
import { desc, eq } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import type { Location } from "@orchestra/core/location"
import type { PermissionV2 } from "@orchestra/core/permission"
import type { ResearchAllowance } from "@orchestra/core/research/allowance"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { ResearchSeatTools } from "@orchestra/core/research/seat-tools"
import type { SessionSchema } from "@orchestra/core/session"
import { SessionInputTable } from "@orchestra/core/session/sql"
import { Research } from "@orchestra/schema/research"
import { LogicalTaskV2 } from "./logical-task"

// V2 port of V1's research dispatch allowance (`apps/orchestra/src/research/allowance.ts`). V1 carried the allowance and
// the web domain list in fiber context around the child run; V2 runs the child on the process-wide Session executor,
// so the dispatch is stored as reserved rules in the child Session's permission ruleset (as write roots are): durable,
// rebound by every Task dispatch, and matched by no tool permission. Only the host writes these rules. The allowance
// ledger itself is core's `ResearchAllowance`, keyed by the child Session and the dispatching Task call.
export const PERMISSION = "research_dispatch"

export type Services = LogicalTaskV2.Services & {
  readonly allowances: ResearchAllowance.Interface
  readonly location: Location.Interface
}

/** The research child's ruleset for one dispatch: its recorded rules without reserved ones, then this dispatch's. */
export function bind(
  recorded: PermissionV2.Ruleset,
  input: { readonly callID: string; readonly effort?: Research.Depth; readonly allowedDomains?: ReadonlyArray<string> },
): PermissionV2.Ruleset {
  return [
    ...recorded.filter((rule) => rule.action !== PERMISSION),
    ...[`call:${input.callID}`, `tier:${input.effort ?? "quick"}`, ...(input.allowedDomains ?? []).map((domain) => `domain:${domain}`)]
      .map((resource) => ({ action: PERMISSION, resource, effect: "deny" as const })),
  ]
}

/** The dispatch bound to a Session, or undefined when the host bound none. */
export function read(rules: PermissionV2.Ruleset) {
  const values = (prefix: string) =>
    rules.flatMap((rule) => (rule.action === PERMISSION && rule.resource.startsWith(prefix) ? [rule.resource.slice(prefix.length)] : []))
  const callID = values("call:")[0]
  if (!callID) return undefined
  const domains = values("domain:")
  return {
    callID,
    tier: Option.getOrElse(Schema.decodeUnknownOption(Research.Depth)(values("tier:")[0]), () => "quick" as const),
    domains: domains.length > 0 ? domains : undefined,
  }
}

/**
 * The research child's admitted allowance and web domains, or undefined for a Session that is neither the research
 * seat nor bound to a dispatch. The research seat never runs without one. The dispatch deadline runs from the child's
 * latest admitted input, which is the dispatch's prompt: on V2 a research child receives input only from Task.
 */
export const allowance = Effect.fn("ResearchDispatchV2.allowance")(function* (
  services: Services,
  session: SessionSchema.Info,
) {
  const dispatch = read(yield* services.store.permissions(session.id))
  const research = services.canonical(session.agent ?? "") === ResearchSeatTools.SEAT
  if (!dispatch && !research) return undefined
  if (!dispatch || !research)
    return yield* refuse("binding_missing", `${ResearchSeatTools.SEAT} runs only under its research dispatch allowance`)
  const task = yield* LogicalTaskV2.read(services, session.id)
  if (!task) return yield* refuse("binding_missing", "the research child has no logical Task binding")
  // The allowance carries exactly the retained binding the records check on every write (V1 required the frame's
  // binding to equal it), so the dispatch ledger, its records and its inquiry events share one scope.
  const binding = yield* ResearchBinding.resolve(session.id, session.projectID).pipe(
    Effect.provideService(Database.Service, { db: services.db }),
    Effect.mapError(fromResearch),
  )
  const admitted = yield* services.allowances.bind(binding, dispatch.callID, dispatch.tier).pipe(Effect.mapError(fromResearch))
  const started = yield* services.db
    .select({ time: SessionInputTable.time_created })
    .from(SessionInputTable)
    .where(eq(SessionInputTable.session_id, session.id))
    .orderBy(desc(SessionInputTable.admitted_seq))
    .get()
    .pipe(Effect.orDie)
  if (started && Date.now() - started.time > admitted.deadlineSeconds * 1000)
    return yield* refuse(
      "budget_exhausted",
      `Research dispatch deadline exhausted (${admitted.deadlineSeconds} seconds); retained work remains available`,
    )
  return { allowance: admitted, domains: dispatch.domains }
})

/** One provider turn of the research child, charged before it runs (V1 charged every provider invocation). */
export const turn = Effect.fn("ResearchDispatchV2.turn")(function* (services: Services, session: SessionSchema.Info) {
  const admitted = yield* allowance(services, session)
  if (!admitted) return
  yield* services.allowances
    .charge(admitted.allowance, "provider", `provider:${session.id}:${EventV2.ID.create()}`)
    .pipe(Effect.mapError(fromResearch))
})

/** One tool call of the research child, charged once per call; returns the dispatch's web domains. */
export const tool = Effect.fn("ResearchDispatchV2.tool")(function* (
  services: Services,
  session: SessionSchema.Info,
  call: { readonly tool: string; readonly callID: string; readonly assistantMessageID?: string },
) {
  const admitted = yield* allowance(services, session)
  if (!admitted) return undefined
  yield* services.allowances
    .charge(admitted.allowance, "tool", `tool:${call.assistantMessageID ?? ""}:${call.callID}:${call.tool}`)
    .pipe(Effect.mapError(fromResearch))
  return { domains: admitted.domains }
})

function fromResearch(error: Research.Error) {
  return failure(error.code, error.message)
}

function failure(code: string, message: string) {
  return new ToolFailure({ message: `Research denied: ${code}: ${message}` })
}

function refuse(code: string, message: string) {
  return Effect.fail(failure(code, message))
}
