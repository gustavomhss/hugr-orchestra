import { expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { ActionsAuthoring } from "../../src/actions/authoring/index"
import { ActionsError } from "../../src/actions/error"
import { diagnostics, read } from "../../src/actions/source/document"
import { AuthoringFixture } from "./authoring-fixture"

test("schedule edit preserves comments, unknown keys, non-schedule trigger semantics and source immutability", () => {
  const text = "# document comment\non:\n  push: # push comment\n    branches: [dev]\n  schedule: # schedule comment\n    - cron: '17 2 * * *' # cron comment\n      timezone: UTC # native unknown\njobs: {build: {steps: [], custom: untouched}}\n"
  const result = ActionsAuthoring.editSchedule(text, ["23 3 * * *", "40 4 * * *"])
  expect(text).toContain("'17 2 * * *'")
  const comments = ["document comment", "push comment", "schedule comment", "cron comment", "native unknown"]
  comments.forEach((comment) => expect(result).toContain(comment))
  expect(read(result, "github", diagnostics())?.value).toEqual({ on: {
    push: { branches: ["dev"] }, schedule: [{ cron: "23 3 * * *", timezone: "UTC" }, { cron: "40 4 * * *" }],
  }, jobs: { build: { steps: [], custom: "untouched" } } })
})

test("identical schedule edit returns original bytes; removal keeps other events", () => {
  const text = "\uFEFF# comment\r\non: {push: null, schedule: [{cron: '17 2 * * *'}]}\r\njobs: {build: {steps: []}}\r\n"
  expect(ActionsAuthoring.editSchedule(text, ["17 2 * * *"])).toBe(text)
  const deleted = ActionsAuthoring.editSchedule(text, [])
  expect(deleted.startsWith("\uFEFF")).toBe(true)
  expect(deleted).toContain("\r\n")
  expect(read(deleted, "github", diagnostics())?.value.on).toEqual({ push: null })
  const scalar = ActionsAuthoring.editSchedule("on: push\njobs: {build: {steps: []}}\n", ["17 2 * * *"])
  expect(read(scalar, "github", diagnostics())?.value.on).toEqual({ push: null, schedule: [{ cron: "17 2 * * *" }] })
})

test.each([
  ["duplicate events", "on: push\non: workflow_dispatch\njobs: {}\n"],
  ["missing trigger alias", "on: *missing\njobs: {}\n"],
  ["missing schedule alias", "on: {schedule: *missing}\njobs: {}\n"],
  ["anchored event map", "on: &events {push: null}\nx-other: *events\njobs: {}\n"],
  ["anchored schedule entry", "on: {schedule: [&entry {cron: '17 2 * * *'}]}\nx-other: *entry\njobs: {}\n"],
  ["duplicate cron", "on: {schedule: [{cron: '1 2 * * *', cron: '2 3 * * *'}]}\njobs: {}\n"],
  ["scalar schedule entry", "on: {schedule: [not-a-mapping]}\njobs: {}\n"],
  ["unsafe tag", "on: {schedule: [{cron: !!js/function evil}]}\njobs: {}\n"],
  ["multiple documents", "on: push\njobs: {}\n---\non: push\n"],
  ["malformed Unicode", "on: push\njobs: {}\n#\uD800"],
  ["excess trivia", "on: push\njobs: {}\n" + "#x\n".repeat(600)],
  ["excess source bytes", "on: push\njobs: {}\n#" + "x".repeat(1024 * 1024)],
])("schedule rejects unsafe or excessive source before composition: %s", (_, text) => {
  expect(() => ActionsAuthoring.editSchedule(text, ["17 2 * * *"])).toThrow(ActionsError)
})

test("pure validation uses qualified graph projection, preserves raw source and never evaluates expressions", () => {
  const binding = AuthoringFixture.binding("github")
  const source = Actions.Source.make({ bindingID: binding.id, path: AuthoringFixture.path("github"), ref: AuthoringFixture.commit,
    commit: AuthoringFixture.commit, version: AuthoringFixture.version("github"), text: "on: push\njobs: {build: {strategy: {matrix: '${{ secrets.NEVER_EVALUATE }}'}, steps: []}}\n", editable: false })
  const graph = ActionsAuthoring.validate(binding, source)
  expect(graph.source).toBe(source)
  expect(graph.state).toBe("partial")
  expect(graph.diagnostics).toContain("source_partial:matrix_dynamic:jobs.build")
  const unicode = ActionsAuthoring.validate(binding, { ...source, text: "#\uD800" })
  expect(unicode.state).toBe("unresolved")
  expect(unicode.diagnostics).toContain("source_unresolved:unicode_invalid:source must be well-formed Unicode")
})
