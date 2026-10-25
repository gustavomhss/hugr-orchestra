import { Capability } from "@orchestra/schema/capability"
import { Schema } from "effect"
import { finite, int, strict, text } from "../document/schema"

export const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
export const name = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(31), Schema.isPattern(/^[^\\/*?:\[\]\u0000-\u001f]+(?![\s\S])/))
export const address = Schema.String.check(Schema.isPattern(/^[A-Z]{1,3}[1-9][0-9]{0,4}(?![\s\S])/))
export const Range = Schema.Struct({ startRow: int(1, 10000), endRow: int(1, 10000),
  startColumn: int(1, 256), endColumn: int(1, 256) }).annotate(strict)
const style = Schema.Struct({ bold: Schema.optional(Schema.Boolean), italic: Schema.optional(Schema.Boolean),
  fontSize: Schema.optional(finite(1, 72)), color: Schema.optional(Schema.String.check(Schema.isPattern(/^[0-9A-F]{8}(?![\s\S])/))),
  numberFormat: Schema.optional(Schema.String.check(Schema.isMaxLength(128))) }).annotate(strict)
const value = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("literal"), value: Schema.Union([text, Schema.Number.check(Schema.isFinite()), Schema.Boolean, Schema.Null]) }).annotate(strict),
  Schema.Struct({ kind: Schema.Literal("formula"), formula: text }).annotate(strict),
])
const cell = Schema.Struct({ address, value, style: Schema.optional(style) }).annotate(strict)
const cells = Schema.Array(cell).check(Schema.isMaxLength(10000))
const names = Schema.Array(Schema.Struct({ name: Schema.String.check(Schema.isPattern(/^[A-Za-z_][A-Za-z_0-9]{0,63}(?![\s\S])/)),
  sheet: name, range: Range }).annotate(strict)).check(Schema.isMaxLength(100))
const delimiter = Schema.Literals([",", ";", "\t", "|"])
export const Read = Schema.Struct({ format: Schema.Literals(["xlsx", "csv"]), artifact: Capability.ArtifactRef,
  sheet: Schema.optional(name), range: Schema.optional(Range), delimiter: Schema.optional(delimiter),
  header: Schema.optional(Schema.Boolean) }).annotate(strict)
export const Edit = Schema.Union([
  Schema.Struct({ format: Schema.Literal("xlsx"), operation: Schema.Literal("create"),
    worksheets: Schema.Array(Schema.Struct({ name, cells }).annotate(strict)).check(Schema.isMinLength(1), Schema.isMaxLength(20)),
    names: Schema.optional(names) }).annotate(strict),
  Schema.Struct({ format: Schema.Literal("xlsx"), operation: Schema.Literal("edit"), artifact: Capability.ArtifactRef,
    expectedRevision: int(0, Number.MAX_SAFE_INTEGER), sheet: name, cells, names: Schema.optional(names) }).annotate(strict),
  Schema.Struct({ format: Schema.Literal("xlsx"), operation: Schema.Literal("restructure"), artifact: Capability.ArtifactRef,
    expectedRevision: int(0, Number.MAX_SAFE_INTEGER), sheet: name, axis: Schema.Literals(["rows", "columns"]),
    action: Schema.Literals(["insert", "delete"]), index: int(1, 10000), count: int(1, 100) }).annotate(strict),
  Schema.Struct({ format: Schema.Literal("csv"), operation: Schema.Literal("create"),
    rows: Schema.Array(Schema.Array(text).check(Schema.isMaxLength(256))).check(Schema.isMaxLength(10000)),
    delimiter: Schema.optional(delimiter), header: Schema.optional(Schema.Boolean) }).annotate(strict),
  Schema.Struct({ format: Schema.Literal("csv"), operation: Schema.Literal("edit"), artifact: Capability.ArtifactRef,
    expectedRevision: int(0, Number.MAX_SAFE_INTEGER), cells: Schema.Array(Schema.Struct({ row: int(1, 10000), column: int(1, 256),
      value: text }).annotate(strict)).check(Schema.isMaxLength(10000)), delimiter: Schema.optional(delimiter), header: Schema.optional(Schema.Boolean) }).annotate(strict),
  Schema.Struct({ format: Schema.Literal("csv"), operation: Schema.Literal("import"), artifact: Capability.ArtifactRef,
    sheet: name, range: Schema.optional(Range), delimiter: Schema.optional(delimiter), header: Schema.optional(Schema.Boolean),
    formulas: Schema.optional(Schema.Boolean) }).annotate(strict),
  Schema.Struct({ format: Schema.Literal("xlsx"), operation: Schema.Literal("export"), artifact: Capability.ArtifactRef,
    sheet: name, range: Schema.optional(Range), delimiter: Schema.optional(delimiter), header: Schema.optional(Schema.Boolean),
    formulas: Schema.optional(Schema.Boolean) }).annotate(strict),
  Schema.Struct({ format: Schema.Literal("xlsx"), operation: Schema.Literal("recalculate"), artifact: Capability.ArtifactRef }).annotate(strict),
])
export type Read = typeof Read.Type
export type Edit = typeof Edit.Type
