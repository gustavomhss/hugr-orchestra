export * as CapabilityInvocation from "./invocation"

import { Capability } from "@orchestra/schema/capability"
import type { Location } from "@orchestra/schema/location"
import { Permission } from "@orchestra/schema/permission"
import type { Project } from "@orchestra/schema/project"
import { Context, Effect, Option, Schema } from "effect"
import { createHash } from "node:crypto"
import type { PermissionV2 } from "../permission"
import type { Tool } from "../tool/tool"

export type HostInput = {
  readonly issuer: "app" | "core" | "sdk"
  readonly owner: Capability.Owner
  readonly invocation: Capability.InvocationRef
  readonly rootToolName: string
  readonly effectiveRules: PermissionV2.Ruleset
  readonly nativeDenyFloor: PermissionV2.Ruleset
}

export type ChildProof = Readonly<{
  callID: string
  parentCallID: string
  ordinal: number
  toolName: string
  requestHash: string
}>

export type Binding = HostInput & {
  readonly rootInvocation: Capability.InvocationRef
  readonly lineage: readonly ChildProof[]
}

const issued = Symbol("CapabilityInvocation.issued")
type Frame = Binding & { readonly [issued]: true }
const Current = Context.Reference<Frame | undefined>("@orchestra/core/CapabilityInvocation", {
  defaultValue: () => undefined,
})
const Input = Schema.Struct({
  issuer: Schema.Literals(["app", "core", "sdk"]),
  owner: Capability.Owner,
  invocation: Capability.InvocationRef,
  rootToolName: Schema.NonEmptyString,
  effectiveRules: Permission.Ruleset,
  nativeDenyFloor: Permission.Ruleset,
})

/** Trusted host boundary only: validates caller claims, not persisted Session/tool-part existence. */
export function withContext<A, E, R>(
  input: HostInput,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | Capability.Failure, R> {
  return Effect.suspend<A, E | Capability.Failure, R>(() => {
    // HostInput is decoded data; optional decoded fields may explicitly contain undefined.
    const decoded = Schema.decodeUnknownOption(Schema.toType(Input))(input)
    if (Option.isNone(decoded)) return Effect.fail(mismatch())
    const value = decoded.value
    if (value.owner.sessionID !== value.invocation.sessionID || value.owner.agentID !== value.invocation.agentID)
      return Effect.fail(mismatch())
    const frame: Frame = Object.freeze({
      [issued]: true as const,
      issuer: value.issuer,
      owner: Object.freeze({ ...value.owner, location: Object.freeze({ ...value.owner.location }) }),
      invocation: Object.freeze({ ...value.invocation }),
      rootInvocation: Object.freeze({ ...value.invocation }),
      lineage: Object.freeze([]),
      rootToolName: value.rootToolName,
      effectiveRules: Object.freeze(value.effectiveRules.map((rule) => Object.freeze({ ...rule }))),
      nativeDenyFloor: Object.freeze(value.nativeDenyFloor.map((rule) => Object.freeze({ ...rule }))),
    })
    return Effect.provideService(effect, Current, frame)
  })
}

export function childID(invocation: Capability.InvocationRef, ordinal: number): string {
  return "child_" + createHash("sha256").update(JSON.stringify([
    invocation.sessionID, invocation.assistantMessageID, invocation.callID, ordinal,
  ])).digest("hex")
}

/** Trusted host boundary: extends an issued frame; SQL admission remains policy-owned. */
export function withChildContext<A, E, R>(
  parentContext: Tool.Context,
  proof: ChildProof,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | Capability.Failure, R> {
  return Effect.gen(function* () {
    const current = yield* Current
    if (!current || current[issued] !== true || !matches(parentContext, current.invocation) ||
      proof.parentCallID !== current.invocation.callID || !Number.isSafeInteger(proof.ordinal) ||
      proof.ordinal < 1 || proof.ordinal > 64 || current.lineage.length >= 8 ||
      proof.callID !== childID(current.invocation, proof.ordinal) ||
      !/^[A-Za-z][A-Za-z0-9_-]{0,63}(?![\s\S])/.test(proof.toolName) ||
      !/^[0-9a-f]{64}(?![\s\S])/.test(proof.requestHash)) return yield* mismatch()
    const frame: Frame = Object.freeze({
      ...current,
      invocation: Object.freeze({ ...current.invocation, callID: proof.callID }),
      lineage: Object.freeze([...current.lineage, Object.freeze({
        callID: proof.callID, parentCallID: proof.parentCallID, ordinal: proof.ordinal,
        toolName: proof.toolName, requestHash: proof.requestHash,
      })]),
    })
    return yield* Effect.provideService(effect, Current, frame)
  })
}

/** Exact current invocation identity; public claims cannot manufacture a child frame. */
export const require = Effect.fn("CapabilityInvocation.require")(function* (
  context: Tool.Context,
  placement: { readonly projectID: Project.ID; readonly location: Location.Ref },
): Effect.fn.Return<Binding, Capability.Failure> {
  const frame = yield* Current
  if (frame === undefined)
    return yield* new Capability.Failure({
      code: "invocation_binding_missing",
      message: "Capability invocation binding is missing",
    })
  if (
    !frame ||
    frame[issued] !== true ||
    !matches(context, frame.invocation) ||
    placement.projectID !== frame.owner.projectID ||
    placement.location.directory !== frame.owner.location.directory ||
    placement.location.workspaceID !== frame.owner.location.workspaceID
  )
    return yield* mismatch()
  return frame
})

function matches(context: Tool.Context, invocation: Capability.InvocationRef) {
  return context.sessionID === invocation.sessionID && context.agent === invocation.agentID &&
    context.assistantMessageID === invocation.assistantMessageID && context.toolCallID === invocation.callID
}

function mismatch() {
  // Never echo caller-supplied identifiers, policy, or provider detail into wire failures.
  return new Capability.Failure({
    code: "invocation_binding_mismatch",
    message: "Capability invocation binding does not match",
  })
}
