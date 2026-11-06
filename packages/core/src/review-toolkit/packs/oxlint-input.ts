export * as ReviewOxlintInput from "./oxlint-input"

import { Context, Effect, Scope } from "effect"

export type Prepared = {
  status: "ok"
  root: string
  files: readonly string[]
  paths: readonly { file: string; path: string }[]
  config: string
  rules: readonly string[]
}

export type Input = { root: string; files: readonly string[]; scratch: string; excluded?: readonly string[] }
export type Refused = { status: "not-run" | "unsupported"; reason: string }

export const BeforeRead = Context.Reference<(input: { root: string; file: string }) => Effect.Effect<void>>("@orchestra/ReviewOxlintInput/BeforeRead", { defaultValue: () => () => Effect.void })
export const Copied = Context.Reference<(input: { root: string; file: string }) => Effect.Effect<void>>("@orchestra/ReviewOxlintInput/Copied", { defaultValue: () => () => Effect.void })
export const NoFollow = Context.Reference<boolean>("@orchestra/ReviewOxlintInput/NoFollow", { defaultValue: () => true })

// Frozen dependency scaffold. This surface remains unregistered until preparation is qualified.
export const prepare = (_input: Input): Effect.Effect<Prepared | Refused, unknown, Scope.Scope> =>
  Effect.succeed({ status: "not-run", reason: "native-oxlint-input-pending" })

export function argv(_executable: string, _prepared: Prepared): { status: "ok"; argv: string[] } | Refused {
  return { status: "not-run", reason: "native-oxlint-input-pending" }
}

export function environment(_root: string, _input: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return {}
}
