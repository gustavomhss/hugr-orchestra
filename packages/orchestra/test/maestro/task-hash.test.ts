import { describe, expect, test } from "bun:test"
import { taskHash } from "../../src/maestro/task-hash"
import { Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"

const binding = {
  subagentType: "general",
  prompt: "implement dark mode",
  model: "test/model",
  planRevisionID: "plan_v1",
  revisionHash: "revision-hash",
  validationRecordID: "val_v1",
  validationHash: "validation-hash",
  contextHash: "context-hash",
  policyHash: "policy-hash",
}

describe("Maestro task hash", () => {
  test("immutable governed task intent and evidence fields change hash", () => {
    const expected = taskHash(binding)
    for (const key of Object.keys(binding) as (keyof typeof binding)[]) {
      expect(taskHash({ ...binding, [key]: `${binding[key]}-mutated` })).not.toBe(expected)
    }
  })

  test("runtime taskID does not change hash", () => {
    const initial = { ...binding, taskID: "ses_initial" }
    const resume = { ...binding, taskID: "ses_resume" }
    expect(taskHash(initial)).toBe(taskHash(resume))
  })

  test("workflow publication, materialization, skills, parameters and approved scope bind the owner hash", () => {
    const workflowBinding = Schema.decodeUnknownSync(RelayArm.WorkflowDefinition)({
      publication: { projectID: "project", documentID: "packet", activeVersionID: "version-1",
        immutableVersionBodyChecksum: "1".repeat(64), livePublicationChecksum: "2".repeat(64) },
      materialization: { schemaIdentifier: "RelaySprint.Sprint", digest: "3".repeat(64), byteLength: 128 },
      resolvedSkills: [{ id: "implementation", content: "Approved skill", sha256: "4".repeat(64) }],
      parameters: { target: "src", mode: "product" }, writePaths: ["src"],
    })
    const approved = { ...binding, workflowBinding, writePaths: ["src"] }
    const expected = taskHash(approved)
    expect(expected).not.toBe(taskHash(binding))
    const changed = [
      ...Object.keys(workflowBinding.publication).map((key) => ({ ...workflowBinding,
        publication: { ...workflowBinding.publication, [key]: "different" } })),
      { ...workflowBinding, materialization: { ...workflowBinding.materialization, digest: "5".repeat(64) } },
      { ...workflowBinding, materialization: { ...workflowBinding.materialization, byteLength: 129 } },
      { ...workflowBinding, resolvedSkills: workflowBinding.resolvedSkills.map((skill) => ({ ...skill, content: "Changed skill" })) },
      { ...workflowBinding, resolvedSkills: workflowBinding.resolvedSkills.map((skill) => ({ ...skill, sha256: "6".repeat(64) })) },
      { ...workflowBinding, parameters: { target: "test", mode: "product" } },
      { ...workflowBinding, writePaths: ["test"] },
    ]
    changed.forEach((workflowBinding) => expect(taskHash({ ...approved, workflowBinding })).not.toBe(expected))
    expect(taskHash({ ...approved, writePaths: ["test"] })).not.toBe(expected)
    expect(taskHash({ ...approved, workflowBinding: { ...workflowBinding,
      parameters: { mode: "product", target: "src" } } })).toBe(expected)
  })
})
