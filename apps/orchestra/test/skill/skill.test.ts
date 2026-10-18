import { describe, expect } from "bun:test"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Effect, Layer } from "effect"
import { Skill } from "../../src/skill"
import { Discovery } from "../../src/skill/discovery"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Config } from "../../src/config/config"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Npm } from "@orchestra/core/npm"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { provideInstance, provideTmpdirInstance, testInstanceStoreLayer, tmpdir, tmpdirScoped } from "../fixture/fixture"
import { NpmTest } from "../fake/npm"
import { testEffect } from "../lib/effect"
import path from "path"
import fs from "fs/promises"

const node = LayerNode.compile(CrossSpawnSpawner.node)
// Config starts a detached npm install into every .orchestra directory it loads. A real one keeps extracting
// packages after its test ends and, on Windows, starves file I/O for later test files in the same process.
const npm = [Npm.node, NpmTest.noop] as const

const it = testEffect(Layer.mergeAll(LayerNode.compile(Skill.node, [npm]), node, testInstanceStoreLayer))
const itWithoutClaudeCodeSkills = testEffect(
  Layer.mergeAll(
    LayerNode.compile(Skill.node, [npm, [RuntimeFlags.node, RuntimeFlags.layer({ disableClaudeCodeSkills: true })]]),
    node,
    testInstanceStoreLayer,
  ),
)
const itWithoutExternalSkills = testEffect(
  Layer.mergeAll(
    LayerNode.compile(Skill.node, [npm, [RuntimeFlags.node, RuntimeFlags.layer({ disableExternalSkills: true })]]),
    node,
    testInstanceStoreLayer,
  ),
)
// Tests provide Agent and Skill with their own home; a Skill built here would be reused through the shared memo map.
const withAgents = testEffect(Layer.mergeAll(node, testInstanceStoreLayer))

async function createGlobalSkill(homeDir: string) {
  const skillDir = path.join(homeDir, ".claude", "skills", "global-test-skill")
  await fs.mkdir(skillDir, { recursive: true })
  await Bun.write(
    path.join(skillDir, "SKILL.md"),
    `---
name: global-test-skill
description: A global skill from ~/.claude/skills for testing.
---

# Global Test Skill

This skill is loaded from the global home directory.
`,
  )
}

const withHome = <A, E, R>(home: string, self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const prev = process.env.ORCHESTRA_TEST_HOME
      process.env.ORCHESTRA_TEST_HOME = home
      return prev
    }),
    () => self,
    (prev) =>
      Effect.sync(() => {
        process.env.ORCHESTRA_TEST_HOME = prev
      }),
  )

describe("skill", () => {
  it.effect("formats verbose locations as XML-safe filesystem paths", () =>
    Effect.sync(() => {
      const output = Skill.fmt(
        [
          {
            name: "tagged-skill",
            description: "A tagged skill.",
            location: "/tmp/plugin.git#v1.3.0/SKILL.md",
            content: "",
          },
          {
            name: "built-in-skill",
            description: "A built-in skill.",
            location: "<built-in>",
            content: "",
          },
        ],
        { verbose: true },
      )

      expect(output).toContain("<location>/tmp/plugin.git#v1.3.0/SKILL.md</location>")
      expect(output).toContain("<location>&lt;built-in&gt;</location>")
      expect(output).not.toContain("file://")
      expect(output).not.toContain("%23")
    }),
  )

  it.live("discovers skills from .orchestra/skill/ directory", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".orchestra", "skill", "test-skill", "SKILL.md"),
              `---
name: test-skill
description: A test skill for verification.
---

# Test Skill

Instructions here.
`,
            ),
          )

          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter(written)
          expect(list.length).toBe(1)
          const item = list.find((x) => x.name === "test-skill")
          expect(item).toBeDefined()
          expect(item!.description).toBe("A test skill for verification.")
          expect(item!.location).toContain(path.join("skill", "test-skill", "SKILL.md"))
        }),
      { git: true },
    ),
  )

  it.live("rescans after saving and removing a project skill, and only after a successful write", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const review = path.join(dir, ".orchestra", "skill", "review", "SKILL.md")
          yield* Effect.promise(() =>
            Bun.write(review, "---\nname: review\ndescription: Review changes.\n---\n\n# Review\n"),
          )
          const skill = yield* Skill.Service
          const project = () => skill.all().pipe(Effect.map((list) => list.filter(written)))
          const before = (yield* project()).find((item) => item.name === "review")
          expect(typeof before?.mtime).toBe("number")

          const saved = yield* skill.save({ name: "release", description: "Ship it.", content: "# Release" })
          expect(saved.location).toBe(path.join(dir, ".orchestra", "skills", "release", "SKILL.md"))
          expect((yield* project()).map((item) => item.name).toSorted()).toEqual(["release", "review"])

          yield* skill.save({
            name: "review",
            description: "Review the diff.",
            content: "# Review\n",
            location: review,
            mtime: before?.mtime,
          })
          expect((yield* project()).find((item) => item.name === "review")?.description).toBe("Review the diff.")

          yield* skill.remove(saved.location)
          expect((yield* project()).map((item) => item.name)).toEqual(["review"])

          const failed = yield* skill
            .save({ name: "review", description: "Stale", content: "", location: review, mtime: 1 })
            .pipe(Effect.flip)
          expect(failed.reason).toBe("conflict")
          expect((yield* project()).find((item) => item.name === "review")?.description).toBe("Review the diff.")
        }),
      { git: true },
    ),
  )

  it.live("returns skill directories from Skill.dirs", () =>
    provideTmpdirInstance(
      (dir) =>
        withHome(
          dir,
          Effect.gen(function* () {
            yield* Effect.promise(() =>
              Bun.write(
                path.join(dir, ".orchestra", "skill", "dir-skill", "SKILL.md"),
                `---
name: dir-skill
description: Skill for dirs test.
---

# Dir Skill
`,
              ),
            )

            const skill = yield* Skill.Service
            const dirs = (yield* skill.dirs()).filter((item) => !shipped(item))
            expect(dirs).toEqual([path.join(dir, ".orchestra", "skill", "dir-skill")])
          }),
        ),
      { git: true },
    ),
  )

  it.live("discovers multiple skills from .orchestra/skill/ directory", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              Bun.write(
                path.join(dir, ".orchestra", "skill", "skill-one", "SKILL.md"),
                `---
name: skill-one
description: First test skill.
---

# Skill One
`,
              ),
              Bun.write(
                path.join(dir, ".orchestra", "skill", "skill-two", "SKILL.md"),
                `---
name: skill-two
description: Second test skill.
---

# Skill Two
`,
              ),
            ]),
          )

          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter(written)
          expect(list.length).toBe(2)
          expect(list.find((x) => x.name === "skill-one")).toBeDefined()
          expect(list.find((x) => x.name === "skill-two")).toBeDefined()
        }),
      { git: true },
    ),
  )

  it.live("skips skills with missing frontmatter", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".orchestra", "skill", "no-frontmatter", "SKILL.md"),
              `# No Frontmatter

Just some content without YAML frontmatter.
`,
            ),
          )

          const skill = yield* Skill.Service
          expect((yield* skill.all()).filter(written)).toEqual([])
        }),
      { git: true },
    ),
  )

  it.live("discovers skills without descriptions", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".orchestra", "skill", "manual-skill", "SKILL.md"),
              `---
name: manual-skill
---

# Manual Skill

Instructions here.
`,
            ),
          )

          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter(written)
          expect(list.length).toBe(1)
          const item = list.find((x) => x.name === "manual-skill")
          expect(item).toBeDefined()
          expect(item!.description).toBeUndefined()
          expect(Skill.fmt(list, { verbose: false })).toBe("No skills are currently available.")
          expect(Skill.fmt(list, { verbose: true })).toBe("No skills are currently available.")
        }),
      { git: true },
    ),
  )

  it.live("discovers skills from .claude/skills/ directory", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".claude", "skills", "claude-skill", "SKILL.md"),
              `---
name: claude-skill
description: A skill in the .claude/skills directory.
---

# Claude Skill
`,
            ),
          )

          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter(written)
          expect(list.length).toBe(1)
          const item = list.find((x) => x.name === "claude-skill")
          expect(item).toBeDefined()
          expect(item!.location).toContain(path.join(".claude", "skills", "claude-skill", "SKILL.md"))
        }),
      { git: true },
    ),
  )

  it.live("discovers global skills from ~/.claude/skills/ directory", () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir({ git: true })),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )

      yield* withHome(
        tmp.path,
        Effect.gen(function* () {
          yield* Effect.promise(() => createGlobalSkill(tmp.path))
          yield* Effect.gen(function* () {
            const skill = yield* Skill.Service
            const list = (yield* skill.all()).filter(written)
            expect(list.length).toBe(1)
            expect(list[0].name).toBe("global-test-skill")
            expect(list[0].description).toBe("A global skill from ~/.claude/skills for testing.")
            expect(list[0].location).toContain(path.join(".claude", "skills", "global-test-skill", "SKILL.md"))
          }).pipe(provideInstance(tmp.path))
        }),
      )
    }),
  )

  it.live("returns empty array when no skills exist", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const skill = yield* Skill.Service
          expect((yield* skill.all()).filter(written)).toEqual([])
        }),
      { git: true },
    ),
  )

  it.live("fails with typed error when requiring a missing skill", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const skill = yield* Skill.Service
          const error = yield* Effect.flip(skill.require("missing-skill"))
          expect(error).toBeInstanceOf(Skill.NotFoundError)
          expect(error._tag).toBe("Skill.NotFoundError")
          expect(error.name).toBe("missing-skill")
          expect(error.message).toContain('Skill "missing-skill" not found.')
        }),
      { git: true },
    ),
  )

  it.effect("exposes tagged expected skill failure classes", () =>
    Effect.sync(() => {
      const invalid = new Skill.InvalidError({ path: "/tmp/SKILL.md", message: "Invalid skill frontmatter" })
      const mismatch = new Skill.NameMismatchError({
        path: "/tmp/SKILL.md",
        expected: "expected-skill",
        actual: "actual-skill",
      })

      expect(invalid).toBeInstanceOf(Skill.InvalidError)
      expect(invalid._tag).toBe("SkillInvalidError")
      expect(mismatch).toBeInstanceOf(Skill.NameMismatchError)
      expect(mismatch._tag).toBe("SkillNameMismatchError")
    }),
  )

  it.live("discovers skills from .agents/skills/ directory", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Bun.write(
              path.join(dir, ".agents", "skills", "agent-skill", "SKILL.md"),
              `---
name: agent-skill
description: A skill in the .agents/skills directory.
---

# Agent Skill
`,
            ),
          )

          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter(written)
          expect(list.length).toBe(1)
          const item = list.find((x) => x.name === "agent-skill")
          expect(item).toBeDefined()
          expect(item!.location).toContain(path.join(".agents", "skills", "agent-skill", "SKILL.md"))
        }),
      { git: true },
    ),
  )

  it.live("discovers global skills from ~/.agents/skills/ directory", () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir({ git: true })),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      )

      yield* withHome(
        tmp.path,
        Effect.gen(function* () {
          const skillDir = path.join(tmp.path, ".agents", "skills", "global-agent-skill")
          yield* Effect.promise(() => fs.mkdir(skillDir, { recursive: true }))
          yield* Effect.promise(() =>
            Bun.write(
              path.join(skillDir, "SKILL.md"),
              `---
name: global-agent-skill
description: A global skill from ~/.agents/skills for testing.
---

# Global Agent Skill

This skill is loaded from the global home directory.
`,
            ),
          )

          yield* Effect.gen(function* () {
            const skill = yield* Skill.Service
            const list = (yield* skill.all()).filter(written)
            expect(list.length).toBe(1)
            expect(list[0].name).toBe("global-agent-skill")
            expect(list[0].description).toBe("A global skill from ~/.agents/skills for testing.")
            expect(list[0].location).toContain(path.join(".agents", "skills", "global-agent-skill", "SKILL.md"))
          }).pipe(provideInstance(tmp.path))
        }),
      )
    }),
  )

  it.live("discovers skills from both .claude/skills/ and .agents/skills/", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              Bun.write(
                path.join(dir, ".claude", "skills", "claude-skill", "SKILL.md"),
                `---
name: claude-skill
description: A skill in the .claude/skills directory.
---

# Claude Skill
`,
              ),
              Bun.write(
                path.join(dir, ".agents", "skills", "agent-skill", "SKILL.md"),
                `---
name: agent-skill
description: A skill in the .agents/skills directory.
---

# Agent Skill
`,
              ),
            ]),
          )

          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter(written)
          expect(list.length).toBe(2)
          expect(list.find((x) => x.name === "claude-skill")).toBeDefined()
          expect(list.find((x) => x.name === "agent-skill")).toBeDefined()
        }),
      { git: true },
    ),
  )

  itWithoutClaudeCodeSkills.live("skips Claude Code skills when disabled", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              Bun.write(
                path.join(dir, ".claude", "skills", "claude-skill", "SKILL.md"),
                `---
name: claude-skill
description: A skill in the .claude/skills directory.
---

# Claude Skill
`,
              ),
              Bun.write(
                path.join(dir, ".agents", "skills", "agent-skill", "SKILL.md"),
                `---
name: agent-skill
description: A skill in the .agents/skills directory.
---

# Agent Skill
`,
              ),
            ]),
          )

          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter(written)
          expect(list.map((s) => s.name)).toEqual(["agent-skill"])
        }),
      { git: true },
    ),
  )

  itWithoutExternalSkills.live("skips external skill directories when disabled", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              Bun.write(
                path.join(dir, ".claude", "skills", "claude-skill", "SKILL.md"),
                `---
name: claude-skill
description: A skill in the .claude/skills directory.
---

# Claude Skill
`,
              ),
              Bun.write(
                path.join(dir, ".agents", "skills", "agent-skill", "SKILL.md"),
                `---
name: agent-skill
description: A skill in the .agents/skills directory.
---

# Agent Skill
`,
              ),
              Bun.write(
                path.join(dir, ".orchestra", "skill", "orchestra-skill", "SKILL.md"),
                `---
name: orchestra-skill
description: A skill in the .orchestra/skill directory.
---

# Orchestra Skill
`,
              ),
            ]),
          )

          const skill = yield* Skill.Service
          const list = (yield* skill.all()).filter(written)
          expect(list.map((s) => s.name)).toEqual(["orchestra-skill"])
        }),
      { git: true },
    ),
  )

  it.live("properly resolves directories that skills live in", () =>
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            Promise.all([
              Bun.write(
                path.join(dir, ".claude", "skills", "claude-skill", "SKILL.md"),
                `---
name: claude-skill
description: A skill in the .claude/skills directory.
---

# Claude Skill
`,
              ),
              Bun.write(
                path.join(dir, ".agents", "skills", "agent-skill", "SKILL.md"),
                `---
name: agent-skill
description: A skill in the .agents/skills directory.
---

# Agent Skill
`,
              ),
              Bun.write(
                path.join(dir, ".orchestra", "skill", "agent-skill", "SKILL.md"),
                `---
name: orchestra-skill
description: A skill in the .orchestra/skill directory.
---

# Orchestra Skill
`,
              ),
              Bun.write(
                path.join(dir, ".orchestra", "skills", "agent-skill", "SKILL.md"),
                `---
name: orchestra-skill
description: A skill in the .orchestra/skills directory.
---

# Orchestra Skill
`,
              ),
            ]),
          )

          const skill = yield* Skill.Service
          expect((yield* skill.dirs()).filter((item) => !shipped(item)).length).toBe(4)
        }),
      { git: true },
    ),
  )

  withAgents.live("lists global skills for every agent but maestro and general", () =>
    Effect.gen(function* () {
      const home = yield* globalSkills()
      yield* provideTmpdirInstance(
        (dir) =>
          Effect.gen(function* () {
            yield* Effect.promise(() =>
              Promise.all([
                writeSkill(path.join(dir, ".claude", "skills"), "claude-project"),
                writeSkill(path.join(dir, ".agents", "skills"), "agents-project"),
                writeSkill(path.join(dir, ".orchestra", "skills"), "orchestra-project"),
                writeSkill(path.join(dir, "team-skills"), "configured-path"),
              ]),
            )
            expect(yield* listed("maestro")).toEqual([
              "agents-project",
              "claude-project",
              "configured-path",
              "orchestra-project",
            ])
            expect(yield* listed("general")).toEqual(yield* listed("maestro"))
            expect(yield* listed("conductor")).toEqual([
              "agents-global",
              "agents-project",
              "claude-global",
              "claude-project",
              "configured-path",
              "orchestra-project",
            ])
            expect(yield* listed("scout")).toEqual(yield* listed("conductor"))
          }).pipe(Effect.provide(agentLayer(home))),
        {
          git: true,
          config: {
            skills: { paths: ["team-skills"] },
            agent: {
              conductor: { description: "Configured primary agent", mode: "primary" },
              scout: { description: "Configured subagent", mode: "subagent" },
            },
          },
        },
      )
    }),
  )

  withAgents.live("lists global skills for maestro again when config allows their location", () =>
    Effect.gen(function* () {
      const home = yield* globalSkills()
      yield* provideTmpdirInstance(
        () =>
          Effect.gen(function* () {
            expect(yield* listed("maestro")).toEqual(["claude-global"])
          }).pipe(Effect.provide(agentLayer(home))),
        {
          git: true,
          config: {
            agent: { maestro: { permission: { skill: { [path.join(home, ".claude", "skills", "*")]: "allow" } } } },
          },
        },
      )
    }),
  )
})

// Agent and Skill read the global home from the same Global service.
const agentLayer = (home: string) =>
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[Global.node, Global.layerWith({ home })], npm],
  )

const writeSkill = (root: string, name: string) =>
  Bun.write(path.join(root, name, "SKILL.md"), `---\nname: ${name}\ndescription: The ${name} skill.\n---\n\n# ${name}\n`)

const globalSkills = Effect.fn("SkillTest.globalSkills")(function* () {
  const home = yield* tmpdirScoped()
  yield* Effect.promise(() =>
    Promise.all([
      writeSkill(path.join(home, ".claude", "skills"), "claude-global"),
      writeSkill(path.join(home, ".agents", "skills"), "agents-global"),
    ]),
  )
  return home
})

const listed = Effect.fn("SkillTest.listed")(function* (agentID: string) {
  const skill = yield* Skill.Service
  const agents = yield* Agent.Service
  const agent = yield* agents.get(agentID)
  return (yield* skill.available(agent)).filter((item) => !shipped(item.location)).map((item) => item.name)
})

// Every instance also has Maestro's shipped playbooks (see playbooks.test.ts); these tests look at the other sources.
const shipped = (location: string) => location.startsWith(Skill.PLAYBOOKS_DIR + path.sep)
const written = (skill: Skill.Info) => !shipped(skill.location)
