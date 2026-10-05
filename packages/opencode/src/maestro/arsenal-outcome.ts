export * as ArsenalOutcome from "./arsenal-outcome"

/** Classify native result fields, never error prose or model-authored safety claims. */
export function classifyOutcome(value: unknown, aborted = false): "success" | "failure" | "cancelled" {
  if (aborted) return "cancelled"
  if (typeof value !== "object" || value === null) return "success"
  if ("isError" in value && value.isError === true || "type" in value && value.type === "error") return "failure"
  if ("state" in value && (value.state === "cancelled" || value.state === "aborted")) return "cancelled"
  if (!("metadata" in value) || typeof value.metadata !== "object" || value.metadata === null) return "success"
  if ("aborted" in value.metadata && value.metadata.aborted === true ||
    "cancelled" in value.metadata && value.metadata.cancelled === true) return "cancelled"
  if ("timeout" in value.metadata && value.metadata.timeout === true) return "failure"
  if ("exit" in value.metadata && typeof value.metadata.exit === "number" && value.metadata.exit !== 0 ||
    "exitCode" in value.metadata && typeof value.metadata.exitCode === "number" && value.metadata.exitCode !== 0) return "failure"
  return "success"
}
