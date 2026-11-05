import { expect, test } from "bun:test"
import { ReviewActionlintYaml } from "../../src/review-toolkit/packs/actionlint-yaml"

test("accepts bounded workflows with remote uses", () => {
  expect(ReviewActionlintYaml.validateWorkflow("jobs:\n  build:\n    steps:\n      - uses: actions/checkout@v4\n")).toEqual({ status: "ok" })
})

test("refuses malformed, duplicate keys, and local action or reusable-workflow uses", () => {
  for (const text of ["jobs: [", "jobs: {}\njobs: {}\n", "jobs:\n  build:\n    steps:\n      - uses: ./local\n", "jobs:\n  build:\n    uses: ../workflow.yml\n"]) {
    expect(ReviewActionlintYaml.validateWorkflow(text).status).not.toBe("ok")
  }
})

test("rejects local uses with whitespace and absolute or Windows path prefixes", () => {
  for (const value of [" ./x", "/x", "\\\\server\\x", "C:\\x"]) {
    expect(ReviewActionlintYaml.validateWorkflow(`jobs:\n  x:\n    steps:\n      - uses: ${JSON.stringify(value)}\n`).status).not.toBe("ok")
  }
})

test("refuses aliases that cycle or exceed traversal limits", () => {
  expect(ReviewActionlintYaml.validateWorkflow("loop: &loop [*loop]\n").status).not.toBe("ok")
  expect(ReviewActionlintYaml.validateWorkflow("x: &x { uses: actions/checkout@v4 }\ny: *x\n").status).toBe("ok")
  expect(ReviewActionlintYaml.validateWorkflow(`x: &x 1\ny: [${Array.from({ length: 65 }, () => "*x").join(", ")}]\n`).status).not.toBe("ok")
})
