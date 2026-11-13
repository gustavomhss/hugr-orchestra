import type { CurrentNode, GroundedFact } from "@atlas/knowledge"

/** Internal frozen seam. No runtime consumer imports this scaffold before implementation qualification. */
export type ReplayFact = {
  readonly fact: GroundedFact
  readonly row: CurrentNode
  readonly scope: string
  readonly anchor: string
  readonly claim: string
}

export function describeReplayFact(_value: unknown, _hash: string): ReplayFact | undefined {
  throw new Error("Replay binding scaffold is not implemented")
}

export function validReplayRow(_value: unknown): _value is CurrentNode {
  throw new Error("Replay binding scaffold is not implemented")
}

export function sameReplayRow(_held: CurrentNode | undefined, _row: CurrentNode): boolean {
  throw new Error("Replay binding scaffold is not implemented")
}

export function bindReplayRow(
  _row: CurrentNode,
  _current: ReplayFact,
  _support: ReadonlyMap<string, readonly ReplayFact[]>,
): boolean {
  throw new Error("Replay binding scaffold is not implemented")
}
