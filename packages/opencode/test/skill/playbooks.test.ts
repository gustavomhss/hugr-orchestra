import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { Npm } from "@opencode-ai/core/npm"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Agent } from "../../src/agent/agent"
import { Permission } from "../../src/permission"
import { MessageV2 } from "../../src/session/message-v2"
import { SessionPrompt } from "../../src/session/prompt"
import { Session } from "../../src/session/session"
import { Skill } from "../../src/skill"
import { NpmTest } from "../fake/npm"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"
import { makeHttp } from "../session/prompt.fixture"

// Maestro's playbooks ship with Orchestra, so they reach repositories that have no copy of their own.
// Config starts a detached npm install into every .opencode directory it loads. A real one outlives its test and,
// on Windows, starves file I/O for later test files in the same process.
const it = testEffect(makeHttp({ replacements: [[Npm.node, NpmTest.noop]] }))

it.instance(
  "a Maestro session in a repository without .opencode/skills lists and loads maestro-governed",
  () =>
    Effect.gen(function* () {
      const directory = (yield* TestInstance).directory
      const llm = yield* TestLLMServer
      yield* Effect.promise(() =>
        Bun.write(path.join(directory, "opencode.json"), JSON.stringify(testProviderConfig(llm.url))),
      )
      expect(yield* Effect.promise(() => fs.exists(path.join(directory, ".opencode", "skills")))).toBe(false)

      const sessions = yield* Session.Service
      const prompt = yield* SessionPrompt.Service
      const session = yield* sessions.create({ title: "governed playbook" })
      yield* prompt.prompt({
        sessionID: session.id,
        agent: "maestro",
        noReply: true,
        parts: [{ type: "text", text: "Run this as governed work." }],
      })
      yield* llm.tool("skill", { name: "maestro-governed" })
      yield* llm.text("loaded")
      yield* prompt.loop({ sessionID: session.id })

      const listing = (yield* llm.inputs)
        .map((input) => JSON.stringify(input))
        .find((input) => input.includes("<available_skills>"))
      expect(listing).toContain("<name>maestro-governed</name>")
      const loaded = (yield* MessageV2.filterCompactedEffect(session.id))
        .flatMap((message) => message.parts)
        .find((part): part is SessionV1.ToolPart => part.type === "tool" && part.tool === "skill")
      expect(loaded?.state.status).toBe("completed")
      const output = loaded?.state.status === "completed" ? loaded.state.output : ""
      expect(output).toContain('<skill_content name="maestro-governed">')
      expect(output).toContain("# Maestro Governed")
      expect(output).toContain(`Base directory for this skill: ${path.join(Skill.PLAYBOOKS_DIR, "maestro-governed")}`)
    }),
  { git: true },
  30000,
)

it.instance(
  "Maestro lists every shipped playbook and reads its files without a prompt",
  () =>
    Effect.gen(function* () {
      const skill = yield* Skill.Service
      const agents = yield* Agent.Service
      const maestro = yield* agents.get("maestro")
      const names = (yield* Effect.promise(() =>
        Array.fromAsync(new Bun.Glob("*/SKILL.md").scan({ cwd: Skill.PLAYBOOKS_DIR })),
      )).map((file) => path.dirname(file))
      expect(names).toEqual(expect.arrayContaining(["frame-request", "maestro-governed"]))

      const listed = (yield* skill.available(maestro)).filter((item) => names.includes(item.name))
      expect(listed.map((item) => item.name).toSorted()).toEqual(names.toSorted())
      expect(listed.filter((item) => !item.location.startsWith(Skill.PLAYBOOKS_DIR + path.sep))).toEqual([])
      const reference = path.join(Skill.PLAYBOOKS_DIR, "maestro-verify", "review-checks.md")
      expect(Permission.evaluate("external_directory", reference, maestro.permission).action).toBe("allow")
    }),
  { git: true },
)

it.instance(
  "a location rule on the playbooks keeps them off an agent's list but loadable by name",
  () =>
    Effect.gen(function* () {
      const skill = yield* Skill.Service
      const agents = yield* Agent.Service
      const maestro = yield* agents.get("maestro")
      const general = yield* agents.get("general")
      expect((yield* skill.available(maestro)).map((item) => item.name)).toContain("maestro-verify")
      const listed = (yield* skill.available(general)).map((item) => item.name)
      expect(listed).not.toContain("maestro-verify")
      expect(listed).not.toContain("frame-request")
      expect(Permission.evaluate("skill", "maestro-verify", general.permission).action).toBe("allow")
    }),
  { git: true },
)

it.instance(
  "a project skill with a playbook's name replaces the shipped one",
  () =>
    Effect.gen(function* () {
      const directory = (yield* TestInstance).directory
      yield* Effect.promise(() =>
        Bun.write(
          path.join(directory, ".opencode", "skills", "maestro-governed", "SKILL.md"),
          "---\nname: maestro-governed\ndescription: This repository's own governed flow.\n---\n\n# Project governed\n",
        ),
      )

      const skill = yield* Skill.Service
      expect(yield* skill.dirs()).toContain(path.join(Skill.PLAYBOOKS_DIR, "maestro-governed"))
      const loaded = yield* skill.require("maestro-governed")
      expect(loaded.description).toBe("This repository's own governed flow.")
      expect(loaded.location).toContain(path.join(".opencode", "skills", "maestro-governed", "SKILL.md"))
    }),
  { git: true },
)

test("the desktop app's packaged copy replaces the source copy", async () => {
  const previous = process.env.ORCHESTRA_PLAYBOOKS_DIR
  process.env.ORCHESTRA_PLAYBOOKS_DIR = path.join(path.sep, "opt", "orchestra", "resources", "playbooks")
  // The query loads a fresh copy of the module, which reads the variable as it loads.
  const fresh = "../../src/skill/index.ts?packaged"
  const packaged: typeof Skill = await import(fresh)
  if (previous === undefined) delete process.env.ORCHESTRA_PLAYBOOKS_DIR
  else process.env.ORCHESTRA_PLAYBOOKS_DIR = previous

  expect(packaged.PLAYBOOKS_DIR).toBe(path.join(path.sep, "opt", "orchestra", "resources", "playbooks"))
  expect(Skill.PLAYBOOKS_DIR).toBe(path.resolve(import.meta.dir, "../../playbooks"))
})
