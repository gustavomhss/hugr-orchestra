import { Effect } from "effect"
import type { AstNode } from "./interpreter/model.js"
import type { Reply, Request } from "./native-regex.js"

export type Driver = {
  readonly run: (request: () => Request, node: AstNode, commit?: (reply: Reply) => void) => Effect.Effect<Reply, unknown>
  readonly idle: Effect.Effect<void>
}

// Construct once inside each execute suspension, never in a shared provider or reusable runtime.
export function makeDriver(_deadline: number, _guard: Effect.Effect<void>): Driver {
  return {
    run: () => Effect.fail(new Error("Finite regex ownership driver is not implemented")),
    idle: Effect.void,
  }
}
