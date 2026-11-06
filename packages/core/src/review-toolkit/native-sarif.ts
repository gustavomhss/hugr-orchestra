export * as ReviewNativeSarif from "./native-sarif"

import type { ReviewSarif } from "./sarif"

/** Host-owned source mapping and native rule inventory, never supplied by the reviewed tree. */
export type Options = {
  readonly pack: string
  readonly version: string
  readonly root: string
  readonly paths: readonly { readonly file: string; readonly path: string }[]
  readonly rules: readonly string[]
}

/** Native error levels settle a tool's exit protocol; they do not confirm a finding or set review severity. */
export type Parsed =
  | { status: "ok"; results: ReviewSarif.Raw[]; excluded: ReviewSarif.Excluded[]; nativeErrors: number }
  | { status: "acquisition-error"; reason: string }

// Frozen dependency scaffold. Positive native-report acceptance must fail until the parser WP replaces this body.
export function parse(_text: string, _options: Options): Parsed {
  return { status: "acquisition-error", reason: "native-sarif-pending" }
}
