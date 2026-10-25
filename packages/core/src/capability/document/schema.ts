import { Capability } from "@orchestra/schema/capability"
import { Schema } from "effect"

export const strict = { parseOptions: { onExcessProperty: "error" as const } }
export const int = (min: number, max: number) => Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: min, maximum: max }))
export const finite = (min: number, max: number) => Schema.Number.check(Schema.isBetween({ minimum: min, maximum: max }))
export const text = Schema.String.check(Schema.isMaxLength(4096))
export const pages = Schema.Array(int(1, 100)).check(Schema.isMinLength(1), Schema.isMaxLength(100))
const draw = Schema.Struct({ text, x: finite(0, 14400), y: finite(0, 14400), size: Schema.optional(finite(1, 144)) }).annotate(strict)
export const Read = Schema.Struct({ format: Schema.Literal("localpdf"), artifact: Capability.ArtifactRef,
  pages: Schema.optional(pages), raster: Schema.optional(Schema.Boolean) }).annotate(strict)
export const Edit = Schema.Union([
  Schema.Struct({ format: Schema.Literal("localpdf"), operation: Schema.Literal("create"), title: Schema.optional(text),
    pages: Schema.Array(Schema.Struct({ width: finite(1, 14400), height: finite(1, 14400),
      text: Schema.Array(draw).check(Schema.isMaxLength(100)) }).annotate(strict)).check(Schema.isMinLength(1), Schema.isMaxLength(100)) }).annotate(strict),
  Schema.Struct({ format: Schema.Literal("localpdf"), operation: Schema.Literal("merge"),
    artifacts: Schema.Array(Capability.ArtifactRef).check(Schema.isMinLength(2), Schema.isMaxLength(10)) }).annotate(strict),
  Schema.Struct({ format: Schema.Literal("localpdf"), operation: Schema.Literal("split"), artifact: Capability.ArtifactRef,
    groups: Schema.Array(pages).check(Schema.isMinLength(1), Schema.isMaxLength(20)) }).annotate(strict),
  Schema.Struct({ format: Schema.Literal("localpdf"), operation: Schema.Literal("rotate"), artifact: Capability.ArtifactRef,
    expectedRevision: int(0, Number.MAX_SAFE_INTEGER), pages, degrees: Schema.Literals([90, 180, 270]) }).annotate(strict),
  Schema.Struct({ format: Schema.Literal("localpdf"), operation: Schema.Literal("stamp"), artifact: Capability.ArtifactRef,
    expectedRevision: int(0, Number.MAX_SAFE_INTEGER), pages, text: draw }).annotate(strict),
  Schema.Struct({ format: Schema.Literal("localpdf"), operation: Schema.Literal("fill"), artifact: Capability.ArtifactRef,
    expectedRevision: int(0, Number.MAX_SAFE_INTEGER), fields: Schema.Array(Schema.Struct({ name: text,
      value: Schema.Union([text, Schema.Boolean]) }).annotate(strict)).check(Schema.isMinLength(1), Schema.isMaxLength(100)),
    flatten: Schema.optional(Schema.Boolean) }).annotate(strict),
  Schema.Struct({ format: Schema.Literal("localpdf"), operation: Schema.Literal("flatten"), artifact: Capability.ArtifactRef,
    expectedRevision: int(0, Number.MAX_SAFE_INTEGER) }).annotate(strict),
  Schema.Struct({ format: Schema.Literal("localpdf"), operation: Schema.Literal("encrypt"), artifact: Capability.ArtifactRef }).annotate(strict),
])
export type Read = typeof Read.Type
export type Edit = typeof Edit.Type
export const Output = Schema.Struct({ result: Capability.Result, metadata: Schema.Json }).annotate(strict)
