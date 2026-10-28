export * as Agent from "./agent"

import { Schema } from "effect"
import { optional } from "./schema"
import { Model } from "./model"
import { Permission } from "./permission"
import { Provider } from "./provider"
import { PositiveInt, statics } from "./schema"

export const ID = Schema.String.pipe(Schema.brand("AgentV2.ID"))
export type ID = typeof ID.Type

export const Color = Schema.Union([
  Schema.String.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/)),
  Schema.Literals(["primary", "secondary", "accent", "success", "warning", "error", "info"]),
]).annotate({ identifier: "Agent.Color" })
export type Color = typeof Color.Type

// A bundled picture (`lib:<slug>`) or an uploaded raster image inlined as a data URL. SVG is refused: it can carry
// script, and the app renders this value as an image source.
export const Avatar = Schema.String.check(
  Schema.isPattern(/^(lib:[a-z0-9][a-z0-9_-]{0,63}|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2})$/),
  Schema.isMaxLength(200_000),
).annotate({ identifier: "Agent.Avatar" })
export type Avatar = typeof Avatar.Type

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: ID,
  /** Display label; the id stays the address. */
  name: Schema.String.pipe(optional),
  engine: Schema.Literals(["orchestra", "claude-code"]).pipe(optional),
  model: Model.Ref.pipe(optional),
  request: Provider.Request,
  system: Schema.String.pipe(optional),
  description: Schema.String.pipe(optional),
  mode: Schema.Literals(["subagent", "primary", "all"]),
  hidden: Schema.Boolean,
  color: Color.pipe(optional),
  avatar: Avatar.pipe(optional),
  steps: PositiveInt.pipe(optional),
  /**
   * The skill tree packaged with this agent, read from its own tree rather than the project's catalog. Each node is a
   * directory with a `SKILL.md`, named by its path; nodes come depth first and a child names its `parent`.
   */
  skills: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      description: Schema.String.pipe(optional),
      /** When to open the node; a root has none. */
      when: Schema.String.pipe(optional),
      parent: Schema.String.pipe(optional),
    }),
  ).pipe(optional),
  /** The pinned engine set the agent's commands run with: the backend toolkit or the research toolkit. */
  toolkit: Schema.Literals(["backend", "research"]).pipe(optional),
  permissions: Permission.Ruleset,
})
  .annotate({ identifier: "AgentV2.Info" })
  .pipe(
    statics((schema) => ({
      empty: (id: ID) =>
        schema.make({ id, request: { headers: {}, body: {} }, mode: "all", hidden: false, permissions: [] }),
    })),
  )
