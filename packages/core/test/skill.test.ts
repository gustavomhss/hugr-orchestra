import fs from "fs/promises"
import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { AbsolutePath } from "@orchestra/core/schema"
import { SkillV2 } from "@orchestra/core/skill"
import { SkillDiscovery } from "@orchestra/core/skill/discovery"
import { SkillTool } from "@orchestra/core/tool/skill"
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
  AppNodeBuilder.build(LayerNode.group([SkillV2.node, AgentV2.node, FSUtil.node]), [[SkillDiscovery.node, discovery]]),
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
          const listed = yield* skill.list()
          expect(listed.every((item) => typeof item.mtime === "number")).toBe(true)
          expect(listed.map((item): SkillV2.Info => ({ ...item, mtime: 0 }))).toEqual([
            SkillV2.Info.make({
              name: "foo",
              slash: true,
              location: AbsolutePath.make(path.join(first, "foo.md")),
              content: "# foo",
              mtime: 0,
            }),
            {
              name: "review",
              description: "Second",
              location: AbsolutePath.make(path.join(second, "review", "SKILL.md")),
              content: "# review",
              mtime: 0,
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

  it.live("lists only a skill tree's root and indexes each node's children when it loads", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const node = (relative: string, extra = "") =>
            fs
              .mkdir(path.join(tmp.path, relative), { recursive: true })
              .then(() =>
                fs.writeFile(
                  path.join(tmp.path, relative, "SKILL.md"),
                  `---\nname: ${relative.replaceAll("/", "-")}\ndescription: About ${relative}\n${extra}---\n# ${relative}`,
                ),
              )
          yield* Effect.promise(async () => {
            await node("stack")
            await node("stack/python", "when: Python code\nnot-when: Go code\n")
            await node("stack/go")
            await node("stack/python/fastapi")
            await node("review")
          })

          const skill = yield* SkillV2.Service
          yield* skill.transform((editor) => editor.source({ type: "directory", path: AbsolutePath.make(tmp.path) }))
          const all = yield* skill.list()
          const byName = (name: string) => all.find((item) => item.name === name)!

          expect(
            all
              .filter((item) => !SkillV2.nested(all, item))
              .map((item) => item.name)
              .toSorted(),
          ).toEqual(["review", "stack"])
          expect(SkillV2.children(all, byName("stack")).map((item) => item.name)).toEqual(["stack-go", "stack-python"])
          expect(SkillV2.children(all, byName("stack-python")).map((item) => item.name)).toEqual([
            "stack-python-fastapi",
          ])
          expect(SkillV2.children(all, byName("review"))).toEqual([])

          const fsutil = yield* FSUtil.Service
          const root = yield* SkillTool.load(fsutil, byName("stack"), SkillV2.children(all, byName("stack")))
          expect(root).toContain("## Next level")
          expect(root).toContain("- `stack-go`: About stack/go")
          expect(root).toContain("- `stack-python`: About stack/python When: Python code Not when: Go code")
          expect(root).not.toContain("stack-python-fastapi`")
          expect(yield* SkillTool.load(fsutil, byName("review"))).not.toContain("## Next level")
        }),
      ),
    ),
  )
})
