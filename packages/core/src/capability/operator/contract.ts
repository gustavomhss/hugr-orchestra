export * as CapabilityOperatorContract from "./contract"

import type { Capability } from "@orchestra/schema/capability"
import type { Location } from "@orchestra/schema/location"
import type { Project } from "@orchestra/schema/project"
import type { Effect, Scope } from "effect"

export type Placement = Readonly<{ projectID: Project.ID; location: Location.Ref }>
export type Resource = Readonly<{ kind: string; id: string }>
export type GrantScope = Readonly<{
  placements: "instance" | readonly Placement[]
  actions: readonly string[]
  resources?: readonly Resource[]
}>
export type Origin = "configured-auth" | "desktop" | "cli" | "sdk"
declare const authority: unique symbol
export interface Authority { readonly [authority]: true }
export type Binding = Readonly<{
  authority: Authority
  principal: string
  origin: Origin
  scopeHash: string
  requestID: string
  idempotencyKey?: string
}>
export type Target = Readonly<{ action: string; placement: Placement; resource?: Resource }>
export type Options = Readonly<{
  principal: string
  scope: GrantScope
  now?: () => number
  ttlMillis?: number
  maxCapabilities?: number
}>
export type Interface = Readonly<{
  /** Trusted server boundary only, after configured Basic authentication succeeds. */
  configured: Authority
  issue: (input: Readonly<{ origin: Exclude<Origin, "configured-auth">; scope?: GrantScope; ttlMillis?: number }>) =>
    Effect.Effect<Readonly<{ bearer: string; authority: Authority }>, Capability.Failure>
  authenticate: (bearer: string) => Effect.Effect<Authority, Capability.Failure>
  revoke: (authority: Authority) => Effect.Effect<void, Capability.Failure>
  withRequest: <A, E, R>(authority: Authority, input: Readonly<{ requestID: string; idempotencyKey?: string }>,
    effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | Capability.Failure, R>
  require: (target: Target) => Effect.Effect<Binding, Capability.Failure>
  validate: (binding: Binding, target: Target) => Effect.Effect<void, Capability.Failure>
}>
export type Factory = (options: Options) => Effect.Effect<Interface, Capability.Failure, Scope.Scope>
