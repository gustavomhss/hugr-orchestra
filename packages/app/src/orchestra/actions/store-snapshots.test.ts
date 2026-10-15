import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import { decodeAction, ReviewSourceForm, snapshotAction } from "./api"

const base: Actions.SourceBase = { bindingID: Actions.BindingID.make("ab_snapshot"), ref: "release/雪", commit: "a".repeat(40) }
const source: Actions.Source = { ...base, path: ".github/workflows/native.yml", version: "native:observed",
  text: "# café 雪 🦴\r\nquoted: '\\n'\r\njobs: {}\r\n", editable: false,
  includes: ["templates/雪.yml"], diagnostics: ["line 2: café"] }

describe("Actions trusted DTO snapshots", () => {
  test("preserves native identities and source bytes while detaching nested arrays", () => {
    const native = { ...source, includes: [...(source.includes ?? [])], diagnostics: [...(source.diagnostics ?? [])] }
    const captured = snapshotAction(Actions.Source, native)
    expect(captured).toEqual(source)
    expect(captured).not.toBe(native)
    expect(captured.includes).not.toBe(native.includes)
    expect(captured.diagnostics).not.toBe(native.diagnostics)
    expect(new TextEncoder().encode(captured.text)).toEqual(new TextEncoder().encode(source.text))
    native.text = "later edit"
    native.includes.push("later.yml")
    native.diagnostics[0] = "later diagnostic"
    expect(captured).toEqual(source)
    ;[captured, captured.includes, captured.diagnostics].forEach((value) => {
      expect(value).toBeDefined()
      if (value) expect(Object.getOwnPropertySymbols(value)).toEqual([])
    })
  })

  test.each([null, undefined, false, 7, "release/雪", [], { ...base, ref: 7 },
    { ...base, commit: "not-a-native-head" }, { ...base, extra: "untrusted" }].map((value) => [value] as const))(
    "keeps SourceBase primitive and excess-shape validation strict: %j", (value) => {
      expect(() => decodeAction(Actions.SourceBase, value)).toThrow("invalid_input")
      expect(() => snapshotAction(Actions.SourceBase, value)).toThrow("invalid_input")
    },
  )

  test.each([{ ...source, editable: "false" }, { ...source, text: null },
    { ...source, diagnostics: [7] }, { ...source, includes: [{ path: "nested.yml" }] }, { ...source, extra: true }])(
    "revalidates Source fields and nested array elements: %j", (value) => {
      expect(() => decodeAction(Actions.Source, value)).toThrow("invalid_input")
      expect(() => snapshotAction(Actions.Source, value)).toThrow("invalid_input")
    },
  )

  test("untrusted forms still reject runtime values before JSON can erase or coerce them", () => {
    const form = { branch: "proposal", message: "ci: change", title: "Review" }
    expect(decodeAction(ReviewSourceForm, form)).toEqual(form)
    expect(() => decodeAction(ReviewSourceForm, { ...form, branch: 7 })).toThrow("invalid_input")
    expect(() => decodeAction(ReviewSourceForm, { ...form, extra: undefined })).toThrow("invalid_input")
    ;[Infinity, NaN, undefined, () => "erased", Symbol("untrusted")].forEach((value) => {
      expect(() => decodeAction(Schema.Record(Schema.String, Schema.Json), { value })).toThrow("invalid_input")
    })
  })
})
