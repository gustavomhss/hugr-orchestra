export * as ArmCost from "./cost"

import { Effect, Option } from "effect"
import type { RelayLedger } from "@opencode-ai/schema/relay-ledger"

// What a state cost (WP6): the transcript rows since `tr_cursor` belong to the state that just ended.

export interface Window {
  // None when the transcript records no usage anywhere; zeros when it does but this window had none.
  readonly cost: Option.Option<RelayLedger.Cost>
  // The new cursor: the transcript's line count.
  readonly total: number
}

export const window = (transcript: string, cursor: number): Effect.Effect<Window> => Effect.die("not implemented")
