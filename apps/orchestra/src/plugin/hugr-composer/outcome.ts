import path from "node:path"
import { Option, Schema } from "effect"

// Mirrors mcp_tools/error_codes.py in the Composer backend. Only these codes cross the boundary;
// free-text backend detail (what_happened, error) stays redacted.
export const ERROR_CODES = [
  "missing-selection",
  "unknown-recipe",
  "unknown-primitive",
  "recipe-mismatch",
  "domain-boundary",
  "empty-query",
  "not-found",
  "unknown-skill",
  "unknown-bundle",
  "path-rejected",
  "target-exists",
  "invalid-output",
  "write-failed",
  "scaffold-failed",
  "backend-unavailable",
  "catalog-invalid",
  "audit-failed",
  "verify-failed",
] as const

// The two owned tools that write (F4 section F); the other bridge tools are read-only and carry no outcome.
export const OWNED_TOOLS = ["hugr-compose", "hugr-scaffold"] as const
export const OUTCOME_KEY = "hugrTool"

// `producerCode` is the closed-set Composer code; `unknown` is a code outside the set and `backend-error` a
// transport or `isError` failure that carries no envelope.
const producerCode = Schema.Literals([...ERROR_CODES, "unknown", "backend-error"])
const decodeProducerCode = Schema.decodeUnknownOption(producerCode)
const head = { schema: Schema.Literal("hugr-composer-outcome-v1"), tool: Schema.Literals(OWNED_TOOLS) }

/**
 * Host-written outcome of one owned-tool call, derived from the legacy Composer envelope (F4.24 fallback). The
 * legacy producer has no `status`, `effects` or complete change inventory, so success is never `generated`, and
 * effects are `none` only for a compose dry run. This is not the canonical `hugr-owned-tool-v1` envelope.
 */
const Legacy = Schema.Union([
  Schema.Struct({ ...head, ok: Schema.Literal(true), effects: Schema.Literals(["none", "unknown"]) }),
  Schema.Struct({
    ...head,
    ok: Schema.Literal(false),
    status: Schema.Literal("failed"),
    effects: Schema.Literals(["none", "unknown"]),
    error: Schema.Struct({ code: Schema.Literal("PRODUCER_FAILED"), producerCode }),
  }),
  Schema.Struct({
    ...head,
    ok: Schema.Literal(false),
    status: Schema.Literal("interrupted"),
    effects: Schema.Literal("unknown"),
    error: Schema.Struct({ code: Schema.Literal("CANCELLED") }),
  }),
])
export type Legacy = Schema.Schema.Type<typeof Legacy>

// The F4.21-F4.23 canonical envelope, as validated by the host. The producer's free text (`what_happened`, `result`,
// `next_steps`), artifacts and planned files never cross; only closed sets and the change inventory do.
export const OWNED_SCHEMA = "hugr-owned-tool-v1"
const STATUSES = ["previewed", "generated", "blocked", "failed", "interrupted"] as const
const OWNED_CODES = [
  "INVALID_INPUT",
  "CAPABILITY_UNAVAILABLE",
  "SELECTION_UNAVAILABLE",
  "UNSUPPORTED_OUTPUT",
  "OUTPUT_CONFLICT",
  "PERMISSION_DENIED",
  "PRODUCER_FAILED",
  "INVALID_PRODUCER_RESULT",
  "CANCELLED",
  "TIMEOUT",
] as const
// Raw producer mode: the compose generation mode, or the scaffold profile.
const MODES = ["adapter_reuse", "tool_delegate", "recipe_template", "ad_hoc", "minimal", "api", "full", "worker"] as const
// Keeps the outcome bounded; a larger inventory is not trusted as complete.
export const MAX_OBSERVED_CHANGES = 5000

const Owned = Schema.Struct({
  schema: Schema.Literal(OWNED_SCHEMA),
  tool: Schema.Literals(OWNED_TOOLS),
  status: Schema.Literals(STATUSES),
  effects: Schema.Literals(["none", "observed", "partial", "unknown"]),
  // Created/modified/deleted entries; a trailing `/` marks a directory. Absolute once the bridge has rebased them.
  observed_changes: Schema.Array(
    Schema.Struct({ path: Schema.String, change: Schema.Literals(["created", "modified", "deleted"]) }),
  ),
  mode: Schema.optional(Schema.Literals(MODES)),
  error: Schema.optional(
    Schema.Struct({ code: Schema.Literals(OWNED_CODES), producer_code: Schema.optional(producerCode) }),
  ),
})
export type Owned = Schema.Schema.Type<typeof Owned>

export const Outcome = Schema.Union([Legacy, Owned])
export type Outcome = Schema.Schema.Type<typeof Outcome>

const decodeOutcome = Schema.decodeUnknownOption(Outcome)
const decodeOwned = Schema.decodeUnknownOption(Owned)

// F4.23: status x effects x code. Anything else is not a valid producer result.
const LEGAL: Record<Owned["status"], { effects: readonly string[]; codes: readonly string[] }> = {
  previewed: { effects: ["none"], codes: [] },
  generated: { effects: ["observed"], codes: [] },
  blocked: {
    effects: ["none"],
    codes: ["INVALID_INPUT", "CAPABILITY_UNAVAILABLE", "SELECTION_UNAVAILABLE", "UNSUPPORTED_OUTPUT", "OUTPUT_CONFLICT", "PERMISSION_DENIED"],
  },
  failed: { effects: ["none", "observed", "partial", "unknown"], codes: ["PRODUCER_FAILED", "INVALID_PRODUCER_RESULT", "OUTPUT_CONFLICT", "PERMISSION_DENIED"] },
  interrupted: { effects: ["none", "partial", "unknown"], codes: ["CANCELLED", "TIMEOUT"] },
}

export function isOwned(outcome: Outcome): outcome is Owned {
  return "observed_changes" in outcome
}

/** Whether a decoded canonical outcome is a legal status / effects / code / inventory combination (F4.22-F4.23). */
export function legal(outcome: Owned) {
  const rule = LEGAL[outcome.status]
  const files = outcome.observed_changes.filter((change) => !change.path.endsWith("/"))
  if (!rule.effects.includes(outcome.effects)) return false
  if (rule.codes.length === 0 ? outcome.error !== undefined : !outcome.error || !rule.codes.includes(outcome.error.code)) return false
  if (outcome.effects === "none" && outcome.observed_changes.length > 0) return false
  // Empty or skipped producer output is not generation evidence.
  return outcome.status !== "generated" || files.length > 0
}

/** Strict: unknown fields, statuses or codes are rejected, so a forged or drifted metadata value yields nothing. */
export function readOutcome(value: unknown, tool: string) {
  const outcome = Option.getOrUndefined(decodeOutcome(value, { onExcessProperty: "error" }))
  if (outcome?.tool !== tool) return
  return isOwned(outcome) && !legal(outcome) ? undefined : outcome
}

/**
 * Decodes a producer's canonical envelope (untrusted, with its free text and extra fields ignored) into the host
 * outcome, or `undefined` when it is malformed, names another tool or is an illegal combination. Paths in
 * `observed_changes` are rebased onto `outputDir` and must stay inside it.
 */
export function readOwned(value: unknown, tool: Owned["tool"], outputDir: string) {
  const decoded = Option.getOrUndefined(decodeOwned(closeProducerCode(value)))
  if (!decoded || decoded.tool !== tool || !legal(decoded) || decoded.observed_changes.length > MAX_OBSERVED_CHANGES) return
  const rebased = decoded.observed_changes.map((change) => {
    const absolute = path.resolve(outputDir, change.path)
    const relative = path.relative(outputDir, absolute)
    if (change.path.includes("\0") || path.isAbsolute(change.path) || relative === ".." || relative.startsWith(".." + path.sep)) return
    return { ...change, path: change.path.endsWith("/") ? absolute + "/" : absolute }
  })
  return rebased.every((change) => change !== undefined) ? { ...decoded, observed_changes: rebased } : undefined
}

// The Composer serializes an absent `mode` and an absent `error.producer_code` as null (Python None), so null means
// absent. A producer code outside the closed set (a newer Composer) degrades to `unknown` instead of invalidating the
// envelope.
function closeProducerCode(value: unknown) {
  if (typeof value !== "object" || value === null) return value
  const envelope = withoutNull(value, "mode")
  if (!("error" in envelope) || typeof envelope.error !== "object" || envelope.error === null) return envelope
  const error = withoutNull(envelope.error, "producer_code")
  return {
    ...envelope,
    error: "producer_code" in error && typeof error.producer_code === "string" ? { ...error, producer_code: producerCodeOf(error.producer_code) } : error,
  }
}

function withoutNull(value: object, key: string) {
  return Object.fromEntries(Object.entries(value).filter(([name, field]) => name !== key || field !== null))
}

/** A producer result that cannot be trusted: it may have written, so the effects are unknown (F4.23). */
export function invalidResult(tool: Owned["tool"]): Owned {
  return {
    schema: OWNED_SCHEMA,
    tool,
    status: "failed",
    effects: "unknown",
    observed_changes: [],
    error: { code: "INVALID_PRODUCER_RESULT" },
  }
}

/** F4.24: a legacy `ok:true` whose mode is `tool_delegate` produced no material, so it is a refusal decided before any write. */
export function delegated(tool: Owned["tool"]): Owned {
  return {
    schema: OWNED_SCHEMA,
    tool,
    status: "blocked",
    effects: "none",
    observed_changes: [],
    mode: "tool_delegate",
    error: { code: "UNSUPPORTED_OUTPUT" },
  }
}

export function producerCodeOf(code: string) {
  return Option.getOrElse(decodeProducerCode(code), () => "unknown" as const)
}

export function outcome(
  tool: Legacy["tool"],
  result:
    | { ok: true; dryRun?: boolean }
    | { ok: false; dryRun?: boolean; producerCode: Extract<Legacy, { status: "failed" }>["error"]["producerCode"] }
    | { interrupted: true },
): Legacy {
  const base = { schema: "hugr-composer-outcome-v1", tool } as const
  if ("interrupted" in result)
    return { ...base, ok: false, status: "interrupted", effects: "unknown", error: { code: "CANCELLED" } }
  const effects = result.dryRun === true && tool === "hugr-compose" ? "none" : "unknown"
  if (result.ok) return { ...base, ok: true, effects }
  return { ...base, ok: false, status: "failed", effects, error: { code: "PRODUCER_FAILED", producerCode: result.producerCode } }
}
