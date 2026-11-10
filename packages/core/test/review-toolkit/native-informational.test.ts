import { expect, test } from "bun:test"
import { ReviewNativeSarif } from "../../src/review-toolkit/native-sarif"

const options: ReviewNativeSarif.Options = {
  pack: "host-fixture", version: "1.2.3", root: "/native",
  paths: [{ file: "input.yml", path: "reviewed/workflow.yml" }], rules: ["fixture/rule"],
}
const report = (kind: string, level: string) => JSON.stringify({
  version: "2.1.0",
  runs: [{ tool: { driver: { name: options.pack, version: options.version } }, results: [{
    kind, level, ruleId: "fixture/rule", message: { text: "informational candidate" },
    locations: [{ physicalLocation: { artifactLocation: { uri: "input.yml" }, region: { startLine: 3 } } }],
  }] }],
})

test("native review/note is admitted as an informational candidate", () => {
  expect(ReviewNativeSarif.parse(report("review", "note"), options)).toMatchObject({
    status: "ok", nativeErrors: 0, excluded: [],
    results: [{ pack: options.pack, rule: "fixture/rule", path: "reviewed/workflow.yml", line: 3, message: "informational candidate" }],
  })
})

test("native review warning is not admitted", () => {
  expect(ReviewNativeSarif.parse(report("review", "warning"), options).status).toBe("acquisition-error")
})
