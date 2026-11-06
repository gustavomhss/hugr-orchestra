export * as ReviewZizmorInput from "./zizmor-input"

import { Context, Effect, Scope } from "effect"

export type Prepared = {
  status: "ok"
  root: string
  files: readonly string[]
  paths: readonly { file: string; path: string }[]
}

export type Input = { root: string; files: readonly string[]; scratch: string; excluded?: readonly string[] }
export type Refused = { status: "not-run" | "unsupported"; reason: string }

export const BeforeRead = Context.Reference<(input: { root: string; file: string }) => Effect.Effect<void>>("@orchestra/ReviewZizmorInput/BeforeRead", { defaultValue: () => () => Effect.void })
export const Copied = Context.Reference<(input: { root: string; file: string }) => Effect.Effect<void>>("@orchestra/ReviewZizmorInput/Copied", { defaultValue: () => () => Effect.void })
export const NoFollow = Context.Reference<boolean>("@orchestra/ReviewZizmorInput/NoFollow", { defaultValue: () => true })

// Frozen dependency scaffold. This surface remains unregistered until preparation is qualified.
export const prepare = (_input: Input): Effect.Effect<Prepared | Refused, unknown, Scope.Scope> =>
  Effect.succeed({ status: "not-run", reason: "native-zizmor-input-pending" })

export function argv(_executable: string, _prepared: Prepared): { status: "ok"; argv: string[] } | Refused {
  return { status: "not-run", reason: "native-zizmor-input-pending" }
}

export function environment(_root: string, _input: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return {}
}
