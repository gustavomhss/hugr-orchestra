import { expect, test } from "bun:test"
import { decodeAction } from "./api"
import { Actions } from "@orchestra/schema/actions"
import { parseInputs } from "./input-definitions"

test("dispatch without input definitions omits inputs, including known empty definitions", () => {
  expect(parseInputs("", undefined, "gitlab", new FormData())).toEqual({ value: undefined })
  expect(parseInputs("", [], "gitlab", new FormData())).toEqual({ value: undefined })
  expect(parseInputs("{}", undefined, "gitlab", new FormData())).toEqual({ value: undefined })
})

test("defined false and zero remain real typed inputs", () => {
  const form = new FormData()
  form.set("input:count", "0")
  expect(
    parseInputs(
      "",
      [
        { name: "enabled", type: "boolean", required: false },
        { name: "count", type: "number", required: false },
      ],
      "gitlab",
      form,
    ),
  ).toEqual({ value: { enabled: false, count: 0 } })
})

test("empty form dispatch stays free of inputs at the native command boundary", () => {
  const parsed = parseInputs("", [], "gitlab", new FormData())
  const command = decodeAction(Actions.DispatchCommand, {
    id: Actions.OperationID.make("aop_no_inputs"),
    input: { provider: "gitlab", ref: "dev", inputs: parsed.value },
  })
  expect(command.input).toEqual({ provider: "gitlab", ref: "dev" })
  expect(Object.hasOwn(command.input, "inputs")).toBe(false)
})
