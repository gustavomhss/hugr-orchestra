export * as BoardRecord from "./record"

// The PR record port (docs/specs/maestro-lead/merge-queue.md sections 4.5 and 6.2). Atlas renders records and writes
// commit trailers; core only gathers the facts and calls the port. The shapes and keys below are Atlas's
// (`@orchestra/atlas-boundary/record`), so its adapter binds `renderPrRecord`, `renderBundleRecord` and the trailer
// helpers without mapping. Unbound, the queue still runs: card bodies stay as they are, bundle PRs get one fixed line
// and merge commits carry no trailer.

export interface Port {
  readonly pr: (record: PrRecord) => string
  readonly bundle: (record: BundleRecord) => string
  readonly trailer: (trailer: Trailer) => string
}

/** The trailer on a card's merge commit inside a bundle; Atlas's `Trailer` keys the host knows. */
export type Trailer = { readonly WP: string; readonly Attempt: string }

export type RiskLevel = "low" | "medium" | "high"

/** Strings are Markdown written by Maestro; every other field is a host fact. Facts core has no source for stay empty. */
export type PrRecord = {
  readonly intent: string
  readonly change: { readonly text: string; readonly start: ReadonlyArray<string> }
  readonly decisions: ReadonlyArray<string>
  readonly notCovered: string
  readonly risk: { readonly level: RiskLevel; readonly breaks: string; readonly notice: string; readonly undo: string }
  readonly followUps: ReadonlyArray<string>
  readonly facts: {
    readonly files: number
    readonly added: number
    readonly removed: number
    readonly packages: ReadonlyArray<string>
    readonly ownUnits: ReadonlyArray<{ readonly unit: string; readonly skill: string }>
  }
  readonly evidence: {
    readonly doneWhen: ReadonlyArray<{ readonly line: string; readonly command: string; readonly result: string }>
    readonly reviews: ReadonlyArray<{
      readonly kind: string
      readonly verdict: string
      readonly findings: ReadonlyArray<{ readonly at: string; readonly text: string; readonly closed?: string }>
    }>
    readonly checks: ReadonlyArray<{ readonly name: string; readonly state: string; readonly url?: string }>
    readonly used: "as-user" | "unseen"
  }
  readonly cost: {
    readonly attempts: ReadonlyArray<{ readonly n: number; readonly cause: string }>
    readonly ciRuns: number
    readonly ciMinutes: number
    readonly wallMs: number
  }
  readonly lineage: {
    readonly card: string
    readonly epic?: string
    readonly dependsOn: ReadonlyArray<string>
    readonly seats: ReadonlyArray<string>
  }
  readonly integration: { readonly state: string; readonly bundle?: string; readonly testedOn?: string }
}

export type BundleRecord = {
  readonly members: ReadonlyArray<{ readonly title: string; readonly head: string; readonly record: PrRecord }>
  readonly testedOn: string
  readonly skew: number
  readonly ciRuns: number
  readonly ciMinutes: number
  readonly ejections: ReadonlyArray<{ readonly card: string; readonly cause: string }>
}
