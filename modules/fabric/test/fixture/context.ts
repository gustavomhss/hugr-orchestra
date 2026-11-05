import { afterAll, expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { mkdtempSync } from "node:fs"
import { rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { CapabilityOperator } from "@orchestra/core/capability/operator/index"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { Project } from "@orchestra/core/project"
import { Capability } from "@orchestra/schema/capability"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { AbsolutePath } from "@orchestra/schema/schema"
import { Effect, Exit } from "effect"

const temporary = mkdtempSync(path.join(os.tmpdir(), "orchestra-context-acceptance-"))
afterAll(() => rm(temporary, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined))

export function box() {
  const directory = mkdtempSync(path.join(temporary, "case-"))
  return { directory, filename: path.join(directory, "orchestra.db"), root: AbsolutePath.make(path.join(directory, "contexts")) }
}

export function layer(filename: string) {
  return LayerNode.compile(LayerNode.group([Database.node, Project.node]), [[Database.node, Database.layerFromPath(filename)]])
}

export const owner = (principal = "context-operator") => CapabilityOperator.make({
  principal, scope: { placements: "instance", actions: ["*"] },
})

export function request<A, E, R>(operators: CapabilityOperatorContract.Interface, effect: Effect.Effect<A, E, R>,
  key: string | null = randomUUID()) {
  return operators.withRequest(operators.configured, { requestID: randomUUID(), ...(key === null ? {} : { idempotencyKey: key }) }, effect)
}

export function failure<A, E, R>(effect: Effect.Effect<A, E, R>, code: Capability.ErrorCode | FabricContext.Failure["code"]) {
  return Effect.gen(function* () {
    const exit = yield* Effect.exit(effect)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) throw new Error("Expected a typed context refusal")
    expect(exit.cause.reasons).toHaveLength(1)
    const reason = exit.cause.reasons[0]
    expect(reason?._tag).toBe("Fail")
    if (reason?._tag !== "Fail") throw new Error("Expected a typed failure, not an import, defect or interruption")
    if (!(reason.error instanceof FabricContext.Failure) && !(reason.error instanceof Capability.Failure))
      throw new Error("Expected a canonical context or authority failure")
    expect(reason.error.code).toBe(code)
    return reason.error
  })
}
