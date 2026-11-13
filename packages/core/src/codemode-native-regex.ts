export * as CodeModeNativeRegex from "./codemode-native-regex"

import { Effect, Layer } from "effect"
import { NativeRegex } from "@orchestra/codemode"
import { AppProcess } from "./process"

// Contract scaffold. Each run will own its child Scope; callers provide the Layer around execute.
export const make = Effect.map(AppProcess.Service, () => ({
  run: (_request: NativeRegex.Request, _remainingMs: number): Effect.Effect<NativeRegex.Reply, unknown> =>
    Effect.fail(new Error("Isolated native regex executor is not implemented")),
}))

export const layer = Layer.effect(NativeRegex.Executor, make)
