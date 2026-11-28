export * as ActivityActionPlan from "./activity-action-plan"

export type Request = "keep" | "quarantine" | "move"
export type State = "Ready" | "Armed" | "Held" | "Refused" | "Out" | "Unknown"
export type Input = {
  id: string
  owner: string
  label: string
  request: Request
  agentRequested: boolean
  claimant: "absent" | "present" | "unknown"
  proof: "proved" | "held"
  receipt?: "armed" | "refused" | "verified-out" | "unknown"
}

export function summarize(rows: readonly Input[]): {
  steps: readonly (Input & { state: State })[]
  agentRequests: readonly Input[]
  counts: Record<State, number>
} {
  const counts: Record<State, number> = { Ready: 0, Armed: 0, Held: 0, Refused: 0, Out: 0, Unknown: 0 }
  const agentRequests: Input[] = []
  const steps = rows.flatMap((row) => {
    if (!row.receipt && row.agentRequested) {
      agentRequests.push(row)
      return []
    }
    const state: State =
      row.receipt === "armed"
        ? "Armed"
        : row.receipt === "refused"
          ? "Refused"
          : row.receipt === "verified-out"
            ? "Out"
            : row.receipt === "unknown"
              ? "Unknown"
              : row.proof === "proved" && row.claimant === "absent"
                ? "Ready"
                : "Held"
    counts[state]++
    return [{ ...row, state }]
  })
  return { steps, agentRequests, counts }
}
