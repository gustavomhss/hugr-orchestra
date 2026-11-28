export * as ActivityQuarantine from "./activity-quarantine"

export type Reading = { state: "absent" | "unavailable" } | { state: "present"; identity: string }
export type Transition = "apply" | "restore" | "empty"

type Facts = { original: Reading; quarantine: Reading }

export function verify(transition: Transition, expectedIdentity: string, facts: Facts): "verified" | "unknown" {
  if (transition === "empty") return facts.quarantine.state === "absent" ? "verified" : "unknown"
  if (transition === "apply") {
    return facts.original.state === "absent" &&
      facts.quarantine.state === "present" &&
      facts.quarantine.identity === expectedIdentity
      ? "verified"
      : "unknown"
  }
  return facts.quarantine.state === "absent" &&
    facts.original.state === "present" &&
    facts.original.identity === expectedIdentity
    ? "verified"
    : "unknown"
}

export function restoreState(
  expectedIdentity: string,
  originalPath: string | undefined,
  previouslyVerified: boolean,
  facts: Facts,
): "Restorable" | "Occupied" | "Unknown" {
  if (!originalPath) return "Unknown"
  if (facts.original.state === "present") return "Occupied"
  if (
    previouslyVerified &&
    facts.original.state === "absent" &&
    facts.quarantine.state === "present" &&
    facts.quarantine.identity === expectedIdentity
  ) return "Restorable"
  return "Unknown"
}

export function emptyTargets(
  rows: readonly { id: string; kind: "quarantine" | "move"; state: "ready" | "refused" | "unknown" | "finished" }[],
): readonly string[] | undefined {
  const active = rows.filter((row) => row.kind === "quarantine" && row.state !== "finished")
  if (!active.length || active.some((row) => row.state !== "ready")) return undefined
  const ids = active.map((row) => row.id)
  if (new Set(ids).size !== ids.length) return undefined
  return ids
}
