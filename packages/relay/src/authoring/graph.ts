export * as AuthoringGraph from "./graph"

import { Effect, Schema } from "effect"
import type { RelayAuthoring } from "@opencode-ai/schema/relay-authoring"
import type { RelaySprint } from "@opencode-ai/schema/relay-sprint"

// Workflow graphs (relay_authoring/graph.py; WP7): validate, compile to a flat sprint, project a sprint back.

// AuthoringError: an HTTP status, a stable code and the exact Python message.
export class Refusal extends Schema.TaggedErrorClass<Refusal>()("Authoring.Refusal", {
  status: Schema.Int,
  code: Schema.String,
  message: Schema.String,
}) {}

// A skill resolved from Orchestra's catalog: its ID, content and sha256.
export type SkillResolver = (
  skill: string,
) => Effect.Effect<{ readonly id: string; readonly content: string; readonly sha256: string }, Refusal>

export const nodeTypes = (): ReadonlyArray<RelayAuthoring.NodeTypeDescriptor> => {
  throw new Error("not implemented")
}

// Shape rules only (`validate_document`): unique IDs and names, positions, connections, retained sprint, phases.
export const validate = (document: unknown): Effect.Effect<void, Refusal> => Effect.die("not implemented")

// `compile_document`: the edge-ordered chain becomes WPs, phases become macros, skills are resolved and bound.
export const compile = (
  document: RelayAuthoring.Document,
  skills?: SkillResolver,
): Effect.Effect<
  { readonly sprint: RelaySprint.Sprint; readonly bindings: ReadonlyArray<RelayAuthoring.SkillBinding> },
  Refusal
> => Effect.die("not implemented")

// `project_sprint`: a flat sprint laid out as a chain behind a start node; IDs stay exact.
export const project = (
  name: string,
  sprint: RelaySprint.Sprint,
): Effect.Effect<
  Pick<RelayAuthoring.Document, "name" | "nodes" | "connections" | "nodeGroups" | "tags" | "meta">,
  Refusal
> => Effect.die("not implemented")
