export * as UpstreamArsenal from "./upstream-arsenal"

import { Result } from "effect"
import type { Descriptor } from "@orchestra/maestro-arsenal"
import { Tool } from "@orchestra/core/tool/tool"

export const UPSTREAM_AUTHORING_OPERATIONS = Object.freeze([
  "anchor-gen",
  "conflict-map",
  "context-packer",
  "contract-freezer",
  "enrich-plan",
  "plan-check",
  "plan-compiler",
  "plan-to-briefs",
  "plan-to-dag",
  "plan-to-gates",
  "plan-to-policy",
  "seam-checker",
  "sliceability",
] as const)

export function operation(name: string) {
  return UPSTREAM_AUTHORING_OPERATIONS.some((allowed) => allowed === name)
    ? Result.succeed(name)
    : Result.fail(new Tool.Failure({ message: `UPSTREAM_AUTHORING_OPERATION_DENIED: ${name}` }))
}

/** Declared purity limits this surface; it does not prove runtime behavior is safe. */
export function selected(name: string, descriptor: Descriptor | undefined) {
  const allowed = operation(name)
  if (Result.isFailure(allowed)) return Result.fail(allowed.failure)
  if (!descriptor || descriptor.name !== name)
    return Result.fail(new Tool.Failure({ message: `UPSTREAM_AUTHORING_DESCRIPTOR_MISSING: ${name}` }))
  if (!Array.isArray(descriptor.effects) || descriptor.effects.length !== 0)
    return Result.fail(new Tool.Failure({ message: `UPSTREAM_AUTHORING_DESCRIPTOR_NOT_PURE: ${name}` }))
  return Result.succeed(descriptor)
}

export function catalog(descriptors: readonly Descriptor[]) {
  return Result.all(
    UPSTREAM_AUTHORING_OPERATIONS.map((name) =>
      selected(
        name,
        descriptors.find((item) => item.name === name),
      ),
    ),
  )
}
