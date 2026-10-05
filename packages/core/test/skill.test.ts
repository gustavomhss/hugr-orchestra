import fs from "fs/promises"
import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AgentV2 } from "@opencode-ai/core/agent"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SkillV2 } from "@opencode-ai/core/skill"
import { SkillDiscovery } from "@opencode-ai/core/skill/discovery"
import { SkillFile } from "@opencode-ai/core/skill/file"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const urls = new Map<string, AbsolutePath[]>()
let pulls = 0
const discovery = Layer.succeed(
  SkillDiscovery.Service,
  SkillDiscovery.Service.of({
    pull: (url) => {
      pulls++
      return Effect.succeed(urls.get(url) ?? [])
    },
  }),
)
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([SkillV2.node, AgentV2.node]), [[SkillDiscovery.node, discovery]]),
)

function write(directory: string, name: string, description: string) {
  return fs.writeFile(
    path.join(directory, name, "SKILL.md"),
    `---
name: ${name}
description: ${description}
---
# ${name}`,
  )
}

describe("SkillV2", () => {
  it.live("registers sources and resolves later source precedence", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const first = path.join(tmp.path, "first")
          const second = path.join(tmp.path, "second")
          yield* Effect.promise(async () => {
            await fs.mkdir(path.join(first, "review"), { recursive: true })
            await fs.mkdir(path.join(second, "review"), { recursive: true })
            await write(first, "review", "First")
            await write(second, "review", "Second")
            await fs.writeFile(path.join(first, "foo.md"), "---\nslash: true\n---\n# foo")
          })

          const skill = yield* SkillV2.Service
          yield* skill.transform((editor) => {
            editor.source({ type: "directory", path: AbsolutePath.make(first) })
            editor.source({ type: "directory", path: AbsolutePath.make(first) })
            editor.source({ type: "directory", path: AbsolutePath.make(second) })
            expect(editor.list()).toEqual([
              { type: "directory", path: AbsolutePath.make(first) },
              { type: "directory", path: AbsolutePath.make(second) },
            ])
          })

          expect(yield* skill.sources()).toEqual([
            { type: "directory", path: AbsolutePath.make(first) },
            { type: "directory", path: AbsolutePath.make(second) },
          ])
          expect(yield* skill.list()).toEqual([
            SkillV2.Info.make({
              name: "foo",
              slash: true,
              location: AbsolutePath.make(path.join(first, "foo.md")),
              content: "# foo",
            }),
            {
              name: "review",
              description: "Second",
              location: AbsolutePath.make(path.join(second, "review", "SKILL.md")),
              content: "# review",
            },
          ])
        }),
      ),
    ),
  )

  it.live("loads URL sources and filters skills for agents", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          yield* Effect.promise(async () => {
            await fs.mkdir(path.join(tmp.path, "deploy"), { recursive: true })
            await write(tmp.path, "deploy", "Deploy production")
          })
          pulls = 0
          urls.set("https://example.test/skills/", [AbsolutePath.make(tmp.path)])

          const agents = yield* AgentV2.Service
          yield* agents.transform((editor) =>
            editor.update(AgentV2.ID.make("reviewer"), (agent) => {
              agent.permissions.push({ action: "skill", resource: "deploy", effect: "deny" })
            }),
          )

          const skill = yield* SkillV2.Service
          yield* skill.transform((editor) => editor.source({ type: "url", url: "https://example.test/skills/" }))

          expect((yield* skill.list()).map((item) => item.name)).toEqual(["deploy"])
          expect((yield* skill.list()).map((item) => item.name)).toEqual(["deploy"])
          expect(pulls).toBe(1)
          expect(SkillV2.available(yield* skill.list(), (yield* agents.get(AgentV2.ID.make("reviewer")))!)).toEqual([])
        }),
      ),
    ),
  )

  it.live("creates, edits and removes registered skill files and refreshes the catalog", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const root = path.join(tmp.path, ".opencode", "skills")
          const outside = path.join(tmp.path, "outside.md")
          yield* Effect.promise(async () => {
            await fs.mkdir(path.join(root, "review"), { recursive: true })
            await fs.writeFile(
              path.join(root, "review", "SKILL.md"),
              "---\nname: review\ndescription: Old\nlicense: MIT\n---\n# Old\n",
            )
            await fs.writeFile(outside, "---\nname: outside\n---\nkeep\n")
          })
          const skill = yield* SkillV2.Service
          yield* skill.transform((editor) => {
            editor.source({ type: "directory", path: AbsolutePath.make(root) })
            editor.source({
              type: "embedded",
              skill: SkillV2.Info.make({
                name: "builtin",
                location: AbsolutePath.make("/builtin/builtin.md"),
                content: "built in",
              }),
            })
          })
          expect((yield* skill.list()).map((item) => item.name)).toEqual(["review", "builtin"])

          const created = yield* skill.save(tmp.path, { name: "docs", description: "Write: docs", content: "# Docs" })
          const docs = path.join(root, "docs", "SKILL.md")
          expect(created).toEqual(
            SkillV2.Info.make({
              name: "docs",
              description: "Write: docs",
              location: AbsolutePath.make(docs),
              content: "# Docs\n",
            }),
          )
          expect(yield* Effect.promise(() => fs.readFile(docs, "utf8"))).toBe(
            "---\nname: docs\ndescription: 'Write: docs'\n---\n# Docs\n",
          )
          expect((yield* skill.list()).find((item) => item.name === "docs")?.description).toBe("Write: docs")

          const review = path.join(root, "review", "SKILL.md")
          yield* skill.save(tmp.path, { name: "code-review", description: "New", content: "# New\n", location: review })
          expect(yield* Effect.promise(() => fs.readFile(review, "utf8"))).toBe(
            "---\nname: code-review\ndescription: New\nlicense: MIT\n---\n# New\n",
          )
          expect((yield* skill.list()).map((item) => item.name).toSorted()).toEqual(["builtin", "code-review", "docs"])

          const failure = (effect: Effect.Effect<unknown, SkillFile.WriteError>) =>
            effect.pipe(
              Effect.flip,
              Effect.map((error) => [error.reason, error.message]),
            )
          expect(yield* failure(skill.save(tmp.path, { name: "docs", description: "Again", content: "" }))).toEqual([
            "conflict",
            "A skill named docs is already registered.",
          ])
          expect(
            (yield* failure(skill.save(tmp.path, { name: "Code Review", description: "Bad", content: "" })))[0],
          ).toBe("invalid")
          expect(
            (yield* failure(skill.save(tmp.path, { name: "../escape", description: "Bad", content: "" })))[0],
          ).toBe("invalid")
          expect(yield* failure(skill.save(tmp.path, { name: "blank", description: "  ", content: "" }))).toEqual([
            "invalid",
            "A skill needs a description.",
          ])
          expect(
            yield* failure(
              skill.save(tmp.path, {
                name: "builtin",
                description: "Changed",
                content: "",
                location: "/builtin/builtin.md",
              }),
            ),
          ).toEqual(["invalid", "builtin is built in and cannot be changed."])
          expect(yield* failure(skill.remove(outside))).toEqual(["missing", `${outside} is not a registered skill.`])
          expect(yield* Effect.promise(() => fs.readFile(outside, "utf8"))).toBe("---\nname: outside\n---\nkeep\n")

          yield* skill.remove(docs)
          expect(yield* Effect.promise(() => fs.stat(path.dirname(docs)).then(() => true, () => false))).toBe(false)
          expect((yield* skill.list()).map((item) => item.name).toSorted()).toEqual(["builtin", "code-review"])
        }),
      ),
    ),
  )
})
