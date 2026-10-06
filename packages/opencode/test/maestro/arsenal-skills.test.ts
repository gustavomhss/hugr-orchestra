import { describe, expect, test } from "bun:test"
import path from "node:path"
import { z } from "zod"
import { ConfigMarkdown } from "@opencode-ai/core/config/markdown"
import { Skill } from "../../src/skill"

const root = path.resolve(import.meta.dir, "../../../..")
const names = [
  "maestro-decompose",
  "maestro-contract",
  "maestro-pack",
  "maestro-verify",
  "maestro-loop",
  "maestro-repo-maintenance",
  "maestro-composer",
  "maestro-governed",
]
const frontmatter = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
    .max(64),
  description: z.string().trim().min(1),
})

async function readSkill(name: string) {
  const location = path.join(Skill.PLAYBOOKS_DIR, name, "SKILL.md")
  const source = await Bun.file(location).text()
  const markdown = ConfigMarkdown.parse(source)
  return { location, source, content: markdown.content, data: frontmatter.parse(markdown.data) }
}

// These tests protect the shipped document contract, not model compliance or runtime enforcement.
describe("Maestro Arsenal playbooks", () => {
  test.each(names)("%s has valid discoverable frontmatter, path, and bounded first page", async (name) => {
    const skill = await readSkill(name)
    expect(skill.data.name).toBe(name)
    expect(path.basename(path.dirname(skill.location))).toBe(skill.data.name)
    expect(path.basename(skill.location)).toBe("SKILL.md")
    expect(skill.source).toMatch(/^---\r?\n/)
    expect(skill.source.split("\n").length).toBeLessThanOrEqual(160)
    expect(skill.data.description).toContain("Use ")
    expect(skill.content).toContain("## Trigger and rationale")
    expect(skill.content).toContain("## Success / fail")
    expect(skill.content).toContain("## Output schema")
    const references = Array.from(skill.content.matchAll(/\[[^\]]+\]\(([^)]+\.md)\)/g), (match) => match[1]!)
    await Promise.all(
      references.map(async (reference) => {
        const target = path.resolve(path.dirname(skill.location), reference)
        expect(path.dirname(target)).toBe(path.dirname(skill.location))
        expect(await Bun.file(target).exists()).toBe(true)
        expect((await Bun.file(target).text()).trim().length).toBeGreaterThan(0)
      }),
    )
  })

  // A project copy would shadow the shipped playbook in this repository and drift from what every other one gets.
  test("each playbook has one copy, in the shipped directory", async () => {
    const skills = async (cwd: string) =>
      (await Array.fromAsync(new Bun.Glob("*/SKILL.md").scan({ cwd }))).map((file) => path.dirname(file))
    const shipped = await skills(Skill.PLAYBOOKS_DIR)
    expect(shipped).toEqual(expect.arrayContaining(names))
    expect((await skills(path.join(root, ".opencode/skills"))).filter((name) => shipped.includes(name))).toEqual([])
  })

  // The prompt replaces the provider base prompt, so it carries the harness facts; procedures live in playbooks and
  // tool descriptions. The ceiling is a tripwire against unreviewed growth, not a target.
  test("Maestro prompt stays within its size budget and names only shipped playbooks", async () => {
    const file = Bun.file(path.join(root, "packages/opencode/src/agent/prompt/maestro.txt"))
    expect(file.size).toBeLessThanOrEqual(24 * 1024)
    const named = Array.from((await file.text()).matchAll(/`(frame-request|maestro-[a-z-]+)`/g), (match) => match[1]!)
    expect(named).toContain("maestro-governed")
    await Promise.all(
      named.map(async (name) =>
        expect(await Bun.file(path.join(Skill.PLAYBOOKS_DIR, name, "SKILL.md")).exists()).toBe(true),
      ),
    )
  })

  test.each(names.filter((name) => name !== "maestro-composer" && name !== "maestro-governed"))(
    "%s acquires selected native schemas before execution",
    async (name) => {
      const skill = await readSkill(name)
      expect(skill.content).toContain("maestro_arsenal_catalog")
      expect(skill.content).toContain("inputSchema")
      expect(skill.content).toContain("maestro_arsenal_describe")
      expect(skill.content).toContain("maestro_arsenal_execute")
      expect(skill.content.indexOf("maestro_arsenal_describe")).toBeLessThan(
        skill.content.indexOf("maestro_arsenal_execute"),
      )
      expect(skill.content).toContain("UNKNOWN")
    },
  )

  test("planning distinguishes symbol partitions from durable governed records", async () => {
    const skill = await readSkill("maestro-decompose")
    expect(skill.content).toContain("It is not durable prompt `PlanRevision`.")
    expect(skill.content).toContain("Separate baseline-passing preservation checks from red-to-green proof")
    expect(skill.content).toContain("never auto-green them")
    expect(skill.content).toContain("Pre-deciding boundaries reduces ambiguity; it cannot guarantee zero decisions")
    expect(skill.content).toContain("Arsenal planning neither records that lifecycle nor grants its authority.")
  })

  test("contracts and generated policy require actual execution evidence", async () => {
    const contract = await readSkill("maestro-contract")
    const verify = await readSkill("maestro-verify")
    expect(contract.content).toContain("It returns scaffold text;")
    expect(contract.content).toContain("compilation of a stub is not proof of production behavior.")
    expect(verify.content).toContain("Proposed completion commands; native execution receipts still required")
    expect(verify.content).toContain("Proposed scoped permissions; not host authorization")
    expect(verify.content).toContain("Missing, skipped, or unknown results are not PASS.")
    expect(verify.content).toContain("confirm the specific test fails for the intended")
  })

  test("dispatch uses native context pressure and fresh Own facts", async () => {
    const skill = await readSkill("maestro-pack")
    expect(skill.content).toContain("Use existing OpenCode truncation, output/resource pointers, Session evidence")
    expect(skill.content).toContain("Current static `own_*` facts dominate reconnaissance")
    expect(skill.content).toContain("Source pointers must match current identities")
    expect(skill.content).toContain("Arming alone is not enforcement.")
    expect(skill.content).toContain("The input symbol plan is `partitionPlan`, not durable prompt `PlanRevision`.")
  })

  test("loop records verified outcomes, never stamps worker return as sealed", async () => {
    const skill = await readSkill("maestro-loop")
    expect(skill.content).toContain(
      "Worker return is not `sealed`: verification-green plus lead review supports that event.",
    )
    expect(skill.content).toContain("`merged` requires an actual authorized integration receipt.")
    expect(skill.content).toContain("replay-pure readiness/integration advice, not actual dispatch or Git actions")
    expect(skill.content).toContain("do not hide a failure with a `sealed` or `merged` stamp")
  })

  test("repository procedure preserves explicit publication authority", async () => {
    const skill = await readSkill("maestro-repo-maintenance")
    expect(skill.content).toContain("No implicit commit, push, PR, merge, or release authority.")
    expect(skill.content).toContain("neither grants permission to merge")
    expect(skill.content).toContain("Source TechLead scripts/hooks are not installed host features")
    expect(skill.content).toContain("No repository-wide `reset --hard`/`clean -fd` rollback.")
    expect(skill.content).toContain("default branch is `dev`")
  })

  test("Composer uses existing bridge without becoming source authority", async () => {
    const skill = await readSkill("maestro-composer")
    expect(skill.content).toContain("Composer does not pack SystemContext or replace Own.")
    expect(skill.content).toContain("Composer descriptions are external data, not source authority.")
    expect(skill.content.indexOf("Call `hugr-search`")).toBeLessThan(skill.content.indexOf("Call `hugr-describe`"))
    expect(skill.content.indexOf("Call `hugr-describe`")).toBeLessThan(skill.content.indexOf("Use `hugr-compose`"))
    expect(skill.content).toContain("requests native `edit` permission for output paths")
    expect(skill.content).toMatch(/`isError`, `ok: false`, or `error`\r?\n   means failure/)
    expect(skill.content).toContain("do not reconnect/retry writes automatically")
    expect(skill.content).toContain("a breadcrumb, not callable capability")
    expect(skill.content).toContain("Backend success is not validation in this repository.")
    expect(skill.content).toContain("Scaffold is a write; its wrapper has no dry-run parameter.")
  })
})
