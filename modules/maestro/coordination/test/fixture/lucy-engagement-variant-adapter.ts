import { expect } from "bun:test"
import { Effect } from "effect"
import { sourceText, type Controls, type Ctx } from "./lucy-engagement"
import { receipt } from "./lucy-engagement-artifacts"
import { fullSearch, variantScript } from "./lucy-variants"
import { observedVariants } from "./lucy-variants-assertions"

/** Preserve every old stage; the added stage performs one actual captured known-instance search. */
export function variantAdapter(legacy: NonNullable<Controls["stream"]>) {
  const pattern = sourceText.trimEnd().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const variants = variantScript({ generations: [{ search: fullSearch(pattern), candidates: [] }] })
  const stream: NonNullable<Controls["stream"]> = (log, request) =>
    /^Stage: variant (?:proposal|verify), generation \d+[,.]/m.test(log.text)
      ? variants.stream(log, request)
      : legacy(log, request)
  return { stream, proposals: variants.proposals, verifiers: variants.verifiers }
}

/** Keep added CODE evidence separate from the existing lead operations and their exact counts. */
export const knownVariant = (host: Ctx, input: unknown, delivered: Effect.Success<ReturnType<typeof receipt>>) =>
  Effect.gen(function* () {
    const observed = yield* observedVariants(host, input, delivered)
    expect(observed.variants.limit).toBe(3)
    expect(observed.variants.stop).toBe("no-new-matches")
    expect(observed.variants.initialSeedIDs).toHaveLength(1)
    expect(observed.variants.generations).toHaveLength(1)
    const generation = observed.variants.generations[0]
    expect(generation.search.status).toBe("accepted")
    if (generation.search.status !== "accepted") return yield* Effect.die("known-instance variant search was not accepted")
    expect(generation.attempts).toHaveLength(1)
    expect(generation.search.rawMatches).toBe(1)
    expect(generation.search.distinctMatches).toBe(1)
    expect(generation.search.excluded).toHaveLength(1)
    expect(generation.search.matches).toEqual([])
    expect(generation.search.counts).toEqual({ matches: 0, confirmed: 0, noise: 0, questions: 0, notExamined: 0 })
    expect(generation.decision).toEqual({ type: "stop", reason: "no-new-matches" })
    const operations = delivered.value.operations.filter((operation) => operation.kind === "code" &&
      operation.sessionID !== delivered.value.sessionID)
    expect(operations).toHaveLength(1)
    const operation = operations[0]
    if (operation.kind !== "code") return yield* Effect.die("variant operation is not CODE")
    expect(operation.operationID).toBe(generation.search.operationID)
    expect(operation.name).toBe("code_search")
    expect(operation.nativeSettlement).toEqual({ status: "completed", messageID: operation.assistantMessageID })
    return { ...observed, generation, operation }
  })
