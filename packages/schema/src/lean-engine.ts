export * as LeanEngine from "./lean-engine"

export const legacy = "hugr-lean@0.2.0:4e46ae0534937bdf" as const
/** Parent updates this only after verifying the expanded immutable package artifact. */
export const current = "hugr-lean@0.2.0:4e46ae0534937bdf" as const
export type ID = typeof legacy | typeof current
export const accepted: readonly string[] = Object.freeze([legacy, current])
