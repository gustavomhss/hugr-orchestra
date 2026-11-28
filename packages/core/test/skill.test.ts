import fs from "fs/promises"
import path from "path"
import { describe, expect } from "bun:test"
import { Deferred, Effect, Fiber, Layer } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionScope } from "@orchestra/core/session/store"
import { SkillV2 } from "@orchestra/core/skill"
import { SkillDiscovery } from "@orchestra/core/skill/discovery"
import { SkillTool } from "@orchestra/core/tool/skill"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const urls = new Map<string, readonly SkillDiscovery.RemoteSkill[]>()
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
  it.live("catalog omits body bytes while exact-name reads preserve the full registered skill", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(Effect.flatMap((tmp) => Effect.gen(function* () {
      const body = "BODY_ONLY_".repeat(4096)
      yield* Effect.promise(async () => {
        await fs.mkdir(path.join(tmp.path, "review"))
        await fs.writeFile(path.join(tmp.path, "review", "SKILL.md"),
          `---\nname: review\ndescription: Review changes\ninternal: true\nslash: true\n---\n${body}`)
      })
      const skill = yield* SkillV2.Service
      yield* skill.transform((editor) => editor.source({ type: "directory", path: AbsolutePath.make(tmp.path) }))
      const listed = yield* skill.list()
      const catalog = yield* skill.catalog()
      expect(listed[0]?.content).toBe(body)
      expect(catalog).toEqual([{ name: "review", description: "Review changes", internal: true, slash: true,
        location: listed[0]?.location, mtime: listed[0]?.mtime }])
      expect(catalog.every((item) => !Object.hasOwn(item, "content"))).toBe(true)
      expect(JSON.stringify(catalog)).not.toContain("BODY_ONLY_")
      expect(Buffer.byteLength(JSON.stringify(listed)) - Buffer.byteLength(JSON.stringify(catalog))).toBeGreaterThan(body.length)
      expect(yield* skill.get("review")).toEqual(listed[0])
      expect(yield* skill.get("Review")).toBeUndefined()
      expect(yield* skill.get("../review/SKILL.md")).toBeUndefined()
    }))),
  )

  it.live("reuses loaded skills until reload refreshes external directory edits", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(Effect.flatMap((tmp) => Effect.gen(function* () {
      yield* Effect.promise(async () => {
        await fs.mkdir(path.join(tmp.path, "review"))
        await write(tmp.path, "review", "Before reload")
      })
      const skill = yield* SkillV2.Service
      yield* skill.transform((editor) => editor.source({ type: "directory", path: AbsolutePath.make(tmp.path) }))
      const first = (yield* skill.list())[0]
      expect(first?.description).toBe("Before reload")
      expect((yield* skill.list())[0]).toBe(first)
      yield* Effect.promise(() => write(tmp.path, "review", "After reload"))
      expect((yield* skill.list())[0]).toBe(first)
      yield* skill.reload()
      expect((yield* skill.list()).map((item) => item.description)).toEqual(["After reload"])
    }))),
  )

  it.live("does not revive a disposed source cache when the same directory is registered again", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(Effect.flatMap((tmp) => Effect.gen(function* () {
      yield* Effect.promise(async () => {
        await fs.mkdir(path.join(tmp.path, "review"))
        await write(tmp.path, "review", "Original registration")
      })
      const skill = yield* SkillV2.Service
      const registration = yield* skill.transform((editor) => editor.source({ type: "directory", path: AbsolutePath.make(tmp.path) }))
      expect((yield* skill.list()).map((item) => item.description)).toEqual(["Original registration"])
      yield* registration.dispose
      expect(yield* skill.list()).toEqual([])
      yield* Effect.promise(() => write(tmp.path, "review", "New registration"))
      yield* skill.transform((editor) => editor.source({ type: "directory", path: AbsolutePath.make(tmp.path) }))
      expect((yield* skill.list()).map((item) => item.description)).toEqual(["New registration"])
    }))),
  )

  it.live("refreshes cached project skills after create, edit and remove", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(Effect.flatMap((tmp) => Effect.gen(function* () {
      const directory = path.join(tmp.path, ".orchestra", "skills")
      yield* Effect.promise(() => fs.mkdir(directory, { recursive: true }))
      const skill = yield* SkillV2.Service
      yield* skill.transform((editor) => editor.source({ type: "directory", path: AbsolutePath.make(directory) }))
      expect(yield* skill.list()).toEqual([])
      const saved = yield* skill.save(tmp.path, { name: "review", description: "Created", content: "# Created" })
      expect((yield* skill.list()).map((item) => [item.description, item.content])).toEqual([["Created", "# Created\n"]])
      yield* skill.save(tmp.path, { name: "review", description: "Edited", content: "# Edited", location: saved.location })
      expect((yield* skill.list()).map((item) => [item.description, item.content])).toEqual([["Edited", "# Edited\n"]])
      yield* skill.remove(tmp.path, saved.location)
      expect(yield* skill.list()).toEqual([])
    }))),
  )

  for (const action of ["save", "reload"] as const) {
    it.live(`does not let an old in-flight directory read refill the cache after ${action}`, () =>
      Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
      ).pipe(Effect.flatMap((tmp) => Effect.gen(function* () {
        const directory = path.join(tmp.path, ".orchestra", "skills")
        const file = path.join(directory, "review", "SKILL.md")
        yield* Effect.promise(async () => {
          await fs.mkdir(path.dirname(file), { recursive: true })
          await write(directory, "review", "Captured before change")
        })
        const filesystem = yield* FSUtil.Service
        const captured = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const gate = { pending: true }
        const gated = Layer.succeed(FSUtil.Service, FSUtil.Service.of({
          ...filesystem,
          readFileStringSafe: (filepath) => Effect.gen(function* () {
            const text = yield* filesystem.readFileStringSafe(filepath)
            if (filepath.endsWith(path.join("review", "SKILL.md")) && gate.pending) {
              gate.pending = false
              yield* Deferred.succeed(captured, undefined)
              yield* Deferred.await(release)
            }
            return text
          }),
        }))
        yield* Effect.gen(function* () {
          const skill = yield* SkillV2.Service
          yield* skill.transform((editor) => editor.source({ type: "directory", path: AbsolutePath.make(directory) }))
          const old = yield* skill.list().pipe(Effect.forkScoped)
          yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined))
          yield* Deferred.await(captured).pipe(Effect.timeout("3 seconds"))
          if (action === "save")
            yield* skill.save(tmp.path, { name: "review", description: "Changed", content: "# Changed", location: file })
          if (action === "reload") {
            yield* Effect.promise(() => write(directory, "review", "Changed"))
            yield* skill.reload()
          }
          yield* Deferred.succeed(release, undefined)
          expect((yield* Fiber.join(old).pipe(Effect.timeout("3 seconds"))).map((item) => item.description)).toEqual(["Captured before change"])
          expect((yield* skill.list()).map((item) => item.description)).toEqual(["Changed"])
        }).pipe(Effect.provide(AppNodeBuilder.build(LayerNode.group([SkillV2.node, FSUtil.node]), [
          [FSUtil.node, gated], [SkillDiscovery.node, discovery],
        ]).pipe(Layer.fresh)))
      }))),
    )
  }

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
            await fs.writeFile(path.join(first, "foo.md"), "---\nslash: true\ninternal: yes\n---\n# foo")
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
              internal: true,
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

  it.live("a reserved source keeps its skill names against every other source", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const bundled = path.join(tmp.path, "bundled")
          const project = path.join(tmp.path, "project")
          yield* Effect.promise(async () => {
            await fs.mkdir(path.join(bundled, "review"), { recursive: true })
            await fs.mkdir(path.join(project, "review"), { recursive: true })
            await fs.mkdir(path.join(project, "lint"), { recursive: true })
            await write(bundled, "review", "Bundled")
            await write(project, "review", "Project")
            await write(project, "lint", "Lint")
          })

          const skill = yield* SkillV2.Service
          yield* skill.transform((editor) => {
            editor.source({ type: "directory", path: AbsolutePath.make(bundled) }, { first: true, reserved: true })
            editor.source({ type: "directory", path: AbsolutePath.make(project) })
          })

          const listed = yield* skill.list()
          expect(listed.map((item) => [item.name, item.description]).toSorted()).toEqual([
            ["lint", "Lint"],
            ["review", "Bundled"],
          ])
          expect(yield* skill.get("review")).toEqual(listed.find((item) => item.name === "review"))
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
          urls.set("https://example.test/skills/", [{
            directory: AbsolutePath.make(tmp.path),
            markdown: [{
              filepath: path.join(tmp.path, "deploy", "SKILL.md"),
              content: yield* Effect.promise(() => fs.readFile(path.join(tmp.path, "deploy", "SKILL.md"), "utf8")),
            }],
          }])

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

  it.live("narrows the listing to a Session's scope and never widens the agent's grant", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          yield* Effect.promise(async () => {
            for (const name of ["lucy-lens", "team-stack", "lucy-audit"]) {
              await fs.mkdir(path.join(tmp.path, name), { recursive: true })
              await write(tmp.path, name, `About ${name}`)
            }
          })
          const agents = yield* AgentV2.Service
          yield* agents.transform((editor) =>
            editor.update(AgentV2.ID.make("scoped-reviewer"), (agent) => {
              agent.permissions.push({ action: "skill", resource: "lucy-audit", effect: "deny" })
            }),
          )
          const skill = yield* SkillV2.Service
          yield* skill.transform((editor) => editor.source({ type: "directory", path: AbsolutePath.make(tmp.path) }))
          const all = (yield* skill.list()).filter((item) => ["lucy-lens", "team-stack", "lucy-audit"].includes(item.name))
          const agent = (yield* agents.get(AgentV2.ID.make("scoped-reviewer")))!
          const names = (scope?: SessionScope.Scope) =>
            SkillV2.available(all, agent, scope)
              .map((item) => item.name)
              .toSorted()

          // An unscoped Session lists what the agent's permissions allow, as before.
          expect(names()).toEqual(["lucy-lens", "team-stack"])
          // A scope naming a node the agent is denied leaves it denied.
          expect(
            names({
              skills: { entry: "lucy-lens", allow: ["team-stack", "lucy-audit"] },
              tools: [],
              budgets: { loads: 2, toolCalls: 15 },
            }),
          ).toEqual(["team-stack"])
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
