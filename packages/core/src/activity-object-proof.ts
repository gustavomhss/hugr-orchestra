export * as ActivityObjectProof from "./activity-object-proof"

export const methods = ["cwd", "git-c", "open-file", "live-lock"] as const
export type Method = (typeof methods)[number]

export type Check = {
  readonly objectID: string
  readonly method: Method
  readonly outcome: "clear" | "holder" | "unavailable" | "failed" | "partial"
}

export type Receipt = {
  readonly objectID: string
  readonly matched: boolean
  readonly claimant: "absent" | "present" | "unknown"
  readonly checks: readonly Check[]
}

export type Result = {
  readonly state: "held" | "idle"
  readonly checks: readonly Pick<Check, "method" | "outcome">[]
}

/** Evaluates one explicit object receipt, without reading or mutating its path. */
export function evaluate(receipt: Receipt): Result {
  const checks = receipt.checks.filter(
    (check) =>
      receipt.objectID.length > 0 &&
      check.objectID === receipt.objectID &&
      methods.some((method) => method === check.method) &&
      (check.outcome === "clear" ||
        check.outcome === "holder" ||
        check.outcome === "failed" ||
        check.outcome === "partial"),
  )
  const idle =
    receipt.objectID.length > 0 &&
    receipt.matched === true &&
    receipt.claimant === "absent" &&
    receipt.checks.length === methods.length &&
    methods.every(
      (method) =>
        receipt.checks.filter(
          (check) => check.objectID === receipt.objectID && check.method === method && check.outcome === "clear",
        ).length === 1,
    )
  return {
    state: idle ? "idle" : "held",
    checks: checks.map((check) => ({ method: check.method, outcome: check.outcome })),
  }
}
