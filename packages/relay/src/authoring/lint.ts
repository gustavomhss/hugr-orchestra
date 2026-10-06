export * as AuthoringLint from "./lint"

import type { RelaySprint } from "@opencode-ai/schema/relay-sprint"

// `relay-spec lint` (bin/relay-spec.py `lint_sprint`; WP7), for draft diagnostics.

export interface Finding {
  readonly category:
    | "unknown-kind"
    | "inject-without-file"
    | "undeclared-macro"
    | "duplicate-control-id"
    | "trivial-control"
    | "advisory-only"
    | "ungated"
    | "self-check-restates-control"
    | "chain-exceeds-default-cap"
  readonly severity: "error" | "warn"
  readonly wp: string
  readonly detail: string
}

// Worst first.
export const lint = (
  sprint: RelaySprint.Sprint,
  options?: { readonly allowUngated?: boolean },
): ReadonlyArray<Finding> => {
  throw new Error("not implemented")
}
