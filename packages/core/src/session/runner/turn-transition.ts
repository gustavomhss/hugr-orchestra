export type TurnTransition =
  // Automatic compaction completed; rebuild the request from compacted history.
  | { readonly _tag: "ContinueAfterCompaction"; readonly step: number }
  // Overflow compaction completed; rebuild once through the path without overflow recovery.
  | { readonly _tag: "ContinueAfterOverflowCompaction"; readonly step: number }

export class TurnTransitionError extends Error {
  constructor(readonly transition: TurnTransition) {
    super()
  }
}

export const continueAfterCompaction = (step: number) => new TurnTransitionError({ _tag: "ContinueAfterCompaction", step })
export const continueAfterOverflowCompaction = (step: number) =>
  new TurnTransitionError({ _tag: "ContinueAfterOverflowCompaction", step })
