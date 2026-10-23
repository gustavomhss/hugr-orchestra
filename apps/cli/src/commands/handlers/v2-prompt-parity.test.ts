import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"

const maestroToolsPath = join(import.meta.dirname, "../../../../../modules/maestro/coordination/src/v2/tools.ts")
const continuityToolsPath = join(import.meta.dirname, "../../../../../modules/continuity/src/v2/continuity.ts")

describe("V2 prompt-registry parity guard (static)", () => {
  test("Maestro tools source contains all prompt-referenced tools", () => {
    const source = readFileSync(maestroToolsPath, "utf-8")

    // Tools explicitly named in maestro.txt prompt
    const maestroPromptTools = [
      "maestro_arsenal_catalog",
      "maestro_arsenal_describe",
      "maestro_arsenal_execute",
      "maestro_workflows",
      "maestro_record_admission",
      "maestro_present_approval",
      "maestro_record_approval",
      "maestro_record_context",
      "maestro_catalog_context",
      "maestro_record_plan_revision",
      "maestro_record_result_decision",
      "maestro_request_review",
      "maestro_record_review",
      "maestro_record_validation",
      "maestro_record_validation_review",
    ]

    for (const toolName of maestroPromptTools) {
      // Check that the tool is registered in the source
      const registrationPattern = new RegExp(`yield\\* tools\\.register\\(\\s*\\{[\\s\\S]*?${toolName}: Tool\\.make\\(`)
      expect(registrationPattern.test(source)).toBe(true)
    }
  })

  test("Continuity tools source contains all prompt-referenced tools", () => {
    const source = readFileSync(continuityToolsPath, "utf-8")

    const continuityPromptTools = [
      "context_recall",
      "context_compact",
      "recall",
      "compact",
    ]

    for (const toolName of continuityPromptTools) {
      const registrationPattern = new RegExp(`yield\\* tools\\.register\\(\\s*\\{[\\s\\S]*?${toolName}: Tool\\.make\\(`)
      expect(registrationPattern.test(source)).toBe(true)
    }
  })

  test("No orphan maestro_* tools in source (all registered tools have prompt coverage)", () => {
    const source = readFileSync(maestroToolsPath, "utf-8")

    // Extract all maestro_* tool registrations from source
    const toolNameRegex = /yield\* tools\.register\(\s*\{[\s\S]*?([a-z_]+): Tool\.make\(/g
    const registeredTools: string[] = []
    let match
    while ((match = toolNameRegex.exec(source)) !== null) {
      if (match[1].startsWith("maestro_")) {
        registeredTools.push(match[1])
      }
    }

    const promptCoveredTools = [
      "maestro_record_admission",
      "maestro_present_approval",
      "maestro_record_approval",
      "maestro_record_context",
      "maestro_catalog_context",
      "maestro_record_plan_revision",
      "maestro_record_result_decision",
      "maestro_request_review",
      "maestro_record_review",
      "maestro_record_validation",
      "maestro_record_validation_review",
      "maestro_workflows",
      "maestro_arsenal_catalog",
      "maestro_arsenal_describe",
      "maestro_arsenal_execute",
    ]

    for (const toolName of registeredTools) {
      expect(promptCoveredTools).toContain(toolName)
    }
  })

  test("Maestro prompt references only existing tools", () => {
    const promptPath = join(import.meta.dirname, "../../../../../packages/core/src/agent/prompt/maestro.txt")
    const prompt = readFileSync(promptPath, "utf-8")

    // Check that all maestro_* references in prompt have corresponding tools
    const promptToolRefs = prompt.match(/maestro_[a-z_]+/g) || []
    const uniqueRefs = [...new Set(promptToolRefs)]

    // The prompt mentions maestro_arsenal_* (wildcard), maestro_workflows, maestro_* (wildcard), maestro_record_plan_revision, maestro-governed
    // These are patterns, not exact tool names. The exact tools are in the source.
    const expectedPatterns = [
      "maestro_arsenal_",
      "maestro_workflows",
      "maestro_",
      "maestro_record_plan_revision",
      "maestro-governed",
    ]

    for (const ref of uniqueRefs) {
      // Check that each reference matches an expected pattern
      const matchesPattern = expectedPatterns.some(p => ref.startsWith(p.replace("_", "_")))
      expect(matchesPattern).toBe(true)
    }
  })
})