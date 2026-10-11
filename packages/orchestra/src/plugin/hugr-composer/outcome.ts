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
export const Outcome = Schema.Union([
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
export type Outcome = Schema.Schema.Type<typeof Outcome>

const decodeOutcome = Schema.decodeUnknownOption(Outcome)

/** Strict: unknown fields, statuses or codes are rejected, so a forged or drifted metadata value yields nothing. */
export function readOutcome(value: unknown, tool: string) {
  const outcome = Option.getOrUndefined(decodeOutcome(value, { onExcessProperty: "error" }))
  return outcome?.tool === tool ? outcome : undefined
}

export function producerCodeOf(code: string) {
  return Option.getOrElse(decodeProducerCode(code), () => "unknown" as const)
}

export function outcome(
  tool: Outcome["tool"],
  result:
    | { ok: true; dryRun?: boolean }
    | { ok: false; dryRun?: boolean; producerCode: Extract<Outcome, { status: "failed" }>["error"]["producerCode"] }
    | { interrupted: true },
): Outcome {
  const base = { schema: "hugr-composer-outcome-v1", tool } as const
  if ("interrupted" in result)
    return { ...base, ok: false, status: "interrupted", effects: "unknown", error: { code: "CANCELLED" } }
  const effects = result.dryRun === true && tool === "hugr-compose" ? "none" : "unknown"
  if (result.ok) return { ...base, ok: true, effects }
  return { ...base, ok: false, status: "failed", effects, error: { code: "PRODUCER_FAILED", producerCode: result.producerCode } }
}
