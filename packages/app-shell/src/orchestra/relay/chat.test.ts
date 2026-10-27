import { describe, expect, test } from "bun:test"
import { resolveTemplate, translator } from "@solid-primitives/i18n"
import { WORKFLOWS_COPY } from "../../i18n/orchestra-chapters/workflows"
import type { RelayDocument } from "./client"
import { runBlockedBy, workflowPrompt } from "./chat"

type Translate = Parameters<typeof workflowPrompt>[0]
const t = translator(() => WORKFLOWS_COPY, resolveTemplate) as Translate

const workflow = (overrides: Partial<RelayDocument>) =>
  ({ id: "relay-wp-execute", name: "Build one work package", activeVersionId: "v1", runnable: true, ...overrides }) as RelayDocument

describe("workflow chat prefill", () => {
  test("Run opens a Maestro chat that names the workflow and its id", () => {
    expect(workflowPrompt(t, "run", workflow({ name: "Nightly checks", id: "wf-7" }))).toBe(
      "Run workflow “Nightly checks” (workflow id: wf-7) for: ",
    )
  })

  test("Use in chat carries the same name and id, with its own sentence", () => {
    expect(workflowPrompt(t, "use", workflow({ name: "Nightly checks", id: "wf-7" }))).toBe(
      "Use the published workflow “Nightly checks” (workflow id: wf-7) for: ",
    )
  })

  test("Run is off until the workflow is published", () => {
    const blocked = runBlockedBy(workflow({ activeVersionId: undefined }))
    expect(blocked).toBe("orchestra.workflows.row.publishFirst")
    expect(t(blocked!)).toBe("Publish before running")
  })

  test("Run names the missing Relay tools for an unavailable profile", () => {
    const blocked = runBlockedBy(workflow({ runnable: false }))
    expect(blocked).toBe("orchestra.workflows.row.toolsMissing")
    expect(t(blocked!)).toBe("Needs Relay tools that are not available yet, so it cannot run")
  })

  test("Run is on for a published, runnable workflow", () => {
    expect(runBlockedBy(workflow({}))).toBeUndefined()
  })
})
