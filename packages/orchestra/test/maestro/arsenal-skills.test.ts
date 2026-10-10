import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import path from "node:path"
import ts from "typescript"
import { z } from "zod"
import { ConfigMarkdown } from "@orchestra/core/config/markdown"
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
    expect((await skills(path.join(root, ".orchestra/skills"))).filter((name) => shipped.includes(name))).toEqual([])
  })

  // The prompt replaces the base prompt, so it carries the harness facts; procedures live in playbooks and
  // tool descriptions. The ceiling is a tripwire against unreviewed growth, not a target.
  test("Maestro prompt stays within its size budget and names only shipped playbooks", async () => {
    const file = Bun.file(path.join(root, "packages/core/src/agent/prompt/maestro.txt"))
    expect(file.size).toBeLessThanOrEqual(24 * 1024)
    const named = Array.from((await file.text()).matchAll(/`(frame-request|maestro-[a-z-]+)`/g), (match) => match[1]!)
    expect(named).toContain("maestro-governed")
    await Promise.all(
      named.map(async (name) =>
        expect(await Bun.file(path.join(Skill.PLAYBOOKS_DIR, name, "SKILL.md")).exists()).toBe(true),
      ),
    )
  })

  // Source correspondence only: parse the real Task boundary, not comment/string sentries or runtime evidence.
  test("authoring documents reference the unconditional native Task completion boundary", async () => {
    const source = ts.createSourceFile("task.ts", await Bun.file(path.join(root, "packages/orchestra/src/tool/task.ts")).text(), ts.ScriptTarget.Latest, true)
    const calls: ts.CallExpression[] = []
    const variables: ts.VariableDeclaration[] = []
    const properties: ts.PropertyAccessExpression[] = []
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) calls.push(node)
      if (ts.isVariableDeclaration(node)) variables.push(node)
      if (ts.isPropertyAccessExpression(node)) properties.push(node)
      ts.forEachChild(node, visit)
    }
    visit(source)
    const before = calls.filter((call) => ts.isPropertyAccessExpression(call.expression) &&
      ts.isIdentifier(call.expression.expression) && call.expression.expression.text === "completion" &&
      call.expression.name.text === "beforeDispatch")
    if (before.length !== 1) throw new Error("TASK_COMPLETION_BOUNDARY_MISSING_OR_AMBIGUOUS")
    const delegated = before[0].parent
    if (!ts.isYieldExpression(delegated) || !delegated.asteriskToken || !ts.isVariableDeclaration(delegated.parent))
      throw new Error("TASK_COMPLETION_BOUNDARY_NOT_AWAITED")
    const statement = delegated.parent.parent.parent
    if (!ts.isVariableStatement(statement) || !ts.isBlock(statement.parent) ||
      !ts.isFunctionExpression(statement.parent.parent) || !statement.parent.parent.asteriskToken)
      throw new Error("TASK_COMPLETION_BOUNDARY_CONDITIONAL_OR_DETACHED")
    const generator = statement.parent.parent
    const runs = variables.filter((variable) => ts.isIdentifier(variable.name) && variable.name.text === "run")
    if (runs.length !== 1 || !runs[0].initializer || !ts.isCallExpression(runs[0].initializer) ||
      !runs[0].initializer.arguments.includes(generator))
      throw new Error("TASK_COMPLETION_BOUNDARY_OUTSIDE_DISPATCH")
    const factories = variables.filter((variable) => ts.isIdentifier(variable.name) && variable.name.text === "completion")
    const factory = factories[0]?.initializer
    if (factories.length !== 1 || !factory || !ts.isYieldExpression(factory) || !factory.asteriskToken ||
      properties.filter((property) => property.pos >= factory.pos && property.end <= factory.end &&
        ts.isIdentifier(property.expression) && property.expression.text === "ArsenalCompletion" && property.name.text === "make").length !== 1)
      throw new Error("TASK_COMPLETION_NATIVE_FACTORY_MISSING_OR_AMBIGUOUS")
    const workflow = calls.filter((call) => ts.isPropertyAccessExpression(call.expression) &&
      ts.isIdentifier(call.expression.expression) && call.expression.expression.text === "WorkflowBinding" &&
      call.expression.name.text === "read" && call.arguments[0]?.getText(source) === "ctx.sessionID" &&
      call.pos > generator.body.pos && call.end < before[0].pos)
    if (workflow.length !== 1 || !ts.isYieldExpression(workflow[0].parent) || !workflow[0].parent.asteriskToken ||
      !ts.isIfStatement(workflow[0].parent.parent) || workflow[0].parent.parent.expression !== workflow[0].parent)
      throw new Error("TASK_PARENT_WORKFLOW_GUARD_MISSING_OR_DRIFTED")
    const documents = [
      await Bun.file(path.join(root, "packages/core/src/agent/prompt/maestro.txt")).text(),
      ...await Promise.all(["maestro-decompose", "maestro-contract", "maestro-pack"].map(async (name) => (await readSkill(name)).content)),
    ]
    documents.forEach((document) => {
      const references = Array.from(document.matchAll(/`(completion\.[a-zA-Z0-9_]+)`/g), (match) => match[1])
      expect(references).toEqual([before[0].expression.getText(source)])
    })
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

  // REPAIR + STRENGTHENING: full-file SHA-256 pins replace obsolete sentence sentries.
  // Source: specs/upstream-specialist/maestro-planning-handoff.md, independently reviewed replacements;
  // native API clarification: specs/upstream-specialist/maestro-transfer-gate.md.
  // Naming-only refreeze: specs/upstream-specialist/NAMING-CORRECTION.md; prior hashes are historical receipts.
  // REPAIR: authoring observation delegates to the actual Task boundary; no model-side inspection API is promised.
  // Update pins only with reviewed procedure changes. Artifact drift protection does not grade prose or prove
  // semantic correctness, model compliance or runtime enforcement.
  test.each([
    ["maestro-decompose", "52c132a44e03e23b56566514d0a10d3a12305d3e16dbc3aa7700b2cf19a8f17d"],
    ["maestro-contract", "cc91d68a944ceba506ff1c5b24bd2bc1a4b873d6d39acf948d01f6fe54a8dcaa"],
    ["maestro-pack", "158e22580f1476781a29b9e3db6fcd73e0d7eb0ea21e5c12a7edc1b3ea54dd92"],
  ])("%s matches its reviewed procedure artifact SHA-256", async (name, digest) => {
    const skill = await readSkill(name)
    expect(createHash("sha256").update(await Bun.file(skill.location).bytes()).digest("hex")).toBe(digest)
  })

  test("generated policy requires actual execution evidence", async () => {
    const verify = await readSkill("maestro-verify")
    expect(verify.content).toContain("Proposed completion commands; native execution receipts still required")
    expect(verify.content).toContain("Proposed scoped permissions; not host authorization")
    expect(verify.content).toContain("Missing, skipped, or unknown results are not PASS.")
    expect(verify.content).toContain("confirm the specific test fails for the intended")
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
