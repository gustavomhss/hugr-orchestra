import { Option, Schema } from "effect"
import { parseTree } from "jsonc-parser"
import type { Node, ParseError } from "jsonc-parser"
import type { ModelMessage } from "ai"
import { guarded, scope, type Failure } from "./memory"
import type { CompleteArtifact, Host, MemoryReview, MemorySnapshot } from "./memory-types"
import { fingerprint, nonempty, ownedHistory, singleLine, validSnapshot } from "./model"
import { validReview } from "./review-seal"
import { Transcript } from "./transcript"
import PROMPT from "./review-prompt.txt"

const NonBlank = Schema.String.check(Schema.isPattern(/\S/))
const Item = Schema.String.check(Schema.isPattern(/^m[1-9][0-9]*$/))
const Sources = Schema.NonEmptyArray(Schema.String.check(Schema.isPattern(/^[uat][1-9][0-9]*$/)))
const Report = Schema.Struct({
  verdict: Schema.Literals(["accept", "repair"]),
  cursor: Schema.Struct({ supported: Schema.Boolean, state: Schema.Literals(["active", "waiting", "closed"]),
    next: Schema.Literals(["continue", "verify", "ask-user", "wait-user"]), reason: NonBlank, src: Sources }),
  critical: Schema.Array(Schema.Struct({ item: Item, src: Sources })),
  resolved: Schema.Array(Schema.Struct({ item: Item, reason: NonBlank, src: Sources })),
  issues: Schema.Array(Schema.Struct({ kind: Schema.Literals(["omission", "unsupported", "contradiction", "stale-cursor", "repetition", "false-completion"]),
    detail: NonBlank, src: Sources })),
})
const parse = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const report = Schema.decodeUnknownOption(Report, { onExcessProperty: "error" })
const fail = (detail: string): Failure => ({ check: "C18", detail })

/** Isolated assessment input. Historical tool records are data, never executable messages. */
export function request(snapshot: MemorySnapshot, host: Host, artifact: CompleteArtifact): { system: string[]; messages: ModelMessage[] } {
  const ctx = capture(snapshot, host, artifact)
  if ("check" in ctx) throw new Error(`${ctx.check}: ${ctx.detail}`)
  const selected = ctx.reviewed ? snapshot.head : snapshot.covered!
  const ids = new Set(selected.map((message) => message.info.id))
  return { system: [PROMPT], messages: [{ role: "user", content: JSON.stringify({
    session: snapshot.sessionID, boundary: snapshot.boundary, mode: ctx.reviewed ? "incremental" : "full-covered",
    authority: host.member ? "User-role records are delegator instructions, not human permission." : "User-role records contain user requests, not live action permission.",
    previous: snapshot.previous ? { text: snapshot.previous.text, items: snapshot.previous.items,
      review: ctx.reviewed && snapshot.previous.version === 5 ? snapshot.previous.review : null } : null,
    candidate: { text: artifact.text, items: artifact.items, now: artifact.now },
    index: ctx.covered.map((source) => ({ alias: source.alias, message: source.message.info.id, part: source.part?.id,
      answers: source.answers, eligibleBoundary: ctx.boundary.has(source.alias), newlyCovered: ctx.changes.includes(source) })),
    outcomes: ctx.covered.flatMap((source) => {
      const part = source.part
      if (!ids.has(source.message.info.id) || part?.type !== "tool" || !source.alias.startsWith("t")) return []
      const state = part.state
      const exit = "metadata" in state ? state.metadata?.exit : undefined
      return [{ alias: source.alias, tool: part.tool, status: state.status,
        exit: typeof exit === "number" && Number.isFinite(exit) ? exit : null,
        observation: state.status === "error" ? state.error.slice(-500) : state.status === "completed" ? state.output.slice(-500) : "Output unavailable",
        meaning: "Invocation lifecycle only; success depends on task and source evidence." }]
    }),
    transcript: Transcript.transcript(selected),
  }) }] }
}

/** Shape/provenance checks constrain a model judgment; they do not prove its semantic truth. */
export function decode(input: { text: string; snapshot: MemorySnapshot; host: Host; artifact: CompleteArtifact }): Omit<MemoryReview, "version" | "digest"> | Failure {
  const ctx = capture(input.snapshot, input.host, input.artifact)
  if ("check" in ctx) return ctx
  const errors: ParseError[] = []
  const tree = parseTree(input.text, errors, { disallowComments: true, allowTrailingComma: false })
  const raw = parse(input.text)
  if (errors.length || !uniqueKeys(tree) || Option.isNone(raw))
    return fail("Review must be exactly one JSON object without comments, trailing text or duplicate keys.")
  const decoded = report(raw.value)
  if (Option.isNone(decoded)) return fail("Review requires closed verdict/cursor/critical/resolved/issues fields, valid labels, nonblank explanations and nonempty source arrays.")
  const body = decoded.value
  for (const entry of [body.cursor, ...body.critical, ...body.resolved, ...body.issues]) {
    if (new Set(entry.src).size !== entry.src.length || entry.src.some((alias) => !ctx.sources.has(alias)))
      return fail(`Review cites duplicate, unknown or uncovered sources: ${entry.src.join(", ")}.`)
  }
  if (!body.cursor.src.some((alias) => ctx.boundary.has(alias)))
    return fail("Review cursor must cite a completed assistant/tool alias from the exact captured boundary.")
  if (body.cursor.state === "closed" && ["continue", "verify"].includes(body.cursor.next))
    return fail("Closed work must ask-user or wait-user; do not invent continued work or verification.")
  const live = new Map(input.artifact.items.map((item) => [item.id, item]))
  const classified = new Set<string>()
  for (const entry of body.critical) {
    const item = live.get(entry.item)
    if (!item || classified.has(entry.item) || entry.src.some((alias) => !item.src.includes(alias)))
      return fail(`Critical ${entry.item} must name one live candidate item and cite only its own sources, once.`)
    classified.add(entry.item)
  }
  const prior = input.snapshot.previous
  const protectedIDs = prior?.version === 5 && prior.review && validReview(prior) ? prior.review.critical : []
  const retired = new Set(protectedIDs.filter((id) => !live.has(id)))
  const resolutions = new Set<string>()
  for (const entry of body.resolved) {
    if (!retired.has(entry.item) || resolutions.has(entry.item))
      return fail(`Resolution ${entry.item} must name a retired prior critical item exactly once.`)
    if (!ctx.changeProven || entry.src.some((alias) => !ctx.changes.some((source) => source.alias === alias)))
      return fail(`Resolution ${entry.item} requires newly covered evidence after prior.coveredThrough.`)
    resolutions.add(entry.item)
  }
  const missing = [...retired].filter((id) => !resolutions.has(id))
  if (missing.length) return fail(`Retired critical items require explicit grounded resolutions: ${missing.join(", ")}.`)
  if (body.verdict !== "accept" || !body.cursor.supported || body.issues.length)
    return fail([`Review ${body.verdict}; cursor ${body.cursor.supported ? "supported" : "unsupported"}: ${body.cursor.reason}`,
      ...body.issues.map((issue) => `${issue.kind}: ${issue.detail} (${issue.src.join(", ")})`)].join("; "))
  return { state: body.cursor.state, next: body.cursor.next, critical: [...new Set([
    ...classified, ...protectedIDs.filter((id) => live.has(id)), ...input.artifact.items.filter(guarded).map((item) => item.id),
  ])].sort() }
}

/** Bind aliases to the captured, owned prefix, not an arbitrary host history with matching ordinals. */
function capture(snapshot: MemorySnapshot, host: Host, artifact: CompleteArtifact) {
  const prior = snapshot.previous
  const reviewed = prior?.version === 5 && prior.review !== undefined && validReview(prior)
  const positions = new Map(host.history.map((message, index) => [message.info.id, index]))
  // An absent old receipt permits full-source migration; a corrupt receipt fails closed.
  if (!snapshot.complete || !validSnapshot(snapshot) || !ownedHistory(snapshot.sessionID, host.history) ||
    !snapshot.covered || snapshot.covered.some((message, index) => {
      const position = positions.get(message.info.id)
      return position === undefined || fingerprint(message) !== fingerprint(host.history[position]) ||
        index > 0 && position <= (positions.get(snapshot.covered![index - 1].info.id) ?? Infinity)
    }) ||
    artifact.parentID !== snapshot.sessionID || !nonempty(artifact.producerID) || artifact.producerID === snapshot.sessionID ||
    artifact.version !== 5 || artifact.boundary !== snapshot.boundary || artifact.coveredThrough !== snapshot.boundary ||
    artifact.covered.length !== snapshot.covered.length || artifact.covered.some((source, index) => source.id !== snapshot.covered![index].info.id ||
      source.digest !== fingerprint(snapshot.covered![index])) || !nonempty(artifact.text) || !singleLine(artifact.now.doing) || !singleLine(artifact.now.next))
    return fail("Review snapshot, host prefix and candidate must have matching owned complete coverage.")
  const all = scope(snapshot, host)
  // Legacy native compaction may retain displaced history in storage. Only the
  // declared active prefix is review evidence; full-history aliases remain stable.
  const ids = new Set(snapshot.covered.map((message) => message.info.id))
  const covered = all.covered.filter((source) => ids.has(source.message.info.id))
  const ctx = { ...all, covered, sources: new Map(covered.map((source) => [source.alias, source])),
    span: all.span.filter((source) => ids.has(source.message.info.id)),
    changes: prior?.version === 5 ? all.span.filter((source) => ids.has(source.message.info.id)) : all.changes,
    changeProven: prior?.version === 5 ? true : all.changeProven }
  const boundary = new Set(ctx.span.filter((source) => source.message.info.id === snapshot.boundary &&
    (source.alias.startsWith("a") || source.part?.type === "tool" && ["completed", "error"].includes(source.part.state.status))).map((source) => source.alias))
  if (!boundary.size || !artifact.now.src.length || !artifact.now.src.some((alias) => boundary.has(alias)) ||
    artifact.now.src.some((alias) => !ctx.sources.has(alias)) || new Set(artifact.items.map((item) => item.id)).size !== artifact.items.length ||
    artifact.items.some((item) => !/^m[1-9][0-9]*$/.test(item.id) || !item.src.length || item.src.some((alias) => !ctx.sources.has(alias))))
    return fail("Candidate requires live unique item IDs with owned sources and Now citing an eligible exact boundary alias.")
  return { ...ctx, boundary, reviewed }
}

function uniqueKeys(node: Node | undefined): boolean {
  if (!node) return false
  if (node.type === "object") {
    const keys = node.children?.map((property) => property.children?.[0]?.value) ?? []
    if (new Set(keys).size !== keys.length) return false
  }
  return node.children?.every(uniqueKeys) ?? true
}

export * as ContinuityReview from "./review"
