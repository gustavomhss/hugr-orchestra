import fs from "fs/promises"
import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SkillV2 } from "@opencode-ai/core/skill"
import { SkillDiscovery } from "@opencode-ai/core/skill/discovery"
import { SkillFile } from "@opencode-ai/core/skill/file"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const discovery = Layer.succeed(SkillDiscovery.Service, SkillDiscovery.Service.of({ pull: () => Effect.succeed([]) }))
const it = testEffect(AppNodeBuilder.build(LayerNode.group([SkillV2.node]), [[SkillDiscovery.node, discovery]]))

const skillText = (name: string, extra = "") =>
  `---\nname: ${name}\ndescription: ${name} skill\n${extra}---\n# ${name}\n`

// A project with the source layout the config plugin registers, plus a global folder and a built-in skill.
function withProject<A, E>(body: (project: Project) => Effect.Effect<A, E, SkillV2.Service>) {
  return Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  ).pipe(
    Effect.flatMap((tmp) =>
      Effect.gen(function* () {
        const project = {
          path: path.join(tmp.path, "repo"),
          root: path.join(tmp.path, "repo", ".opencode", "skills"),
          global: path.join(tmp.path, "global"),
          outside: path.join(tmp.path, "outside"),
        }
        yield* Effect.promise(async () => {
          await write(path.join(project.root, "review", "SKILL.md"), skillText("review", "license: MIT\n"))
          await write(path.join(project.root, "own", "own_policy", "SKILL.md"), skillText("own_policy"))
          await write(path.join(project.root, "flat.md"), skillText("flat"))
          await write(path.join(project.global, "shared", "SKILL.md"), skillText("shared"))
          await write(path.join(project.outside, "linked", "SKILL.md"), skillText("linked"))
          await fs.symlink(path.join(project.outside, "linked"), path.join(project.root, "linked"))
        })
        const skill = yield* SkillV2.Service
        yield* skill.transform((editor) => {
          editor.source({ type: "directory", path: AbsolutePath.make(project.global) })
          editor.source({ type: "directory", path: AbsolutePath.make(project.root) })
          editor.source({
            type: "embedded",
            skill: SkillV2.Info.make({
              name: "builtin",
              description: "Built in",
              location: AbsolutePath.make("/builtin/builtin.md"),
              content: "built in",
            }),
          })
        })
        return yield* body(project)
      }),
    ),
  )
}

type Project = { path: string; root: string; global: string; outside: string }

function write(file: string, text: string) {
  return fs.mkdir(path.dirname(file), { recursive: true }).then(() => fs.writeFile(file, text))
}

const read = (file: string) => Effect.promise(() => fs.readFile(file, "utf8"))
const exists = (file: string) =>
  Effect.promise(() =>
    fs.lstat(file).then(
      () => true,
      () => false,
    ),
  )
const entries = (folder: string) => Effect.promise(() => fs.readdir(folder).then((items) => items.toSorted()))
const failure = <A>(effect: Effect.Effect<A, SkillFile.WriteError, SkillV2.Service>) =>
  effect.pipe(
    Effect.flip,
    Effect.map((error) => [error.reason, error.message]),
  )
const find = (name: string) =>
  Effect.gen(function* () {
    const skill = yield* SkillV2.Service
    return (yield* skill.list()).find((item) => item.name === name)
  })

describe("SkillV2 writes", () => {
  it.live("creates a project skill and keeps a body that starts with front-matter fences", () =>
    withProject((project) =>
      Effect.gen(function* () {
        const skill = yield* SkillV2.Service
        const body = "---\ntitle: part of the body\n---\n# Docs"
        const created = yield* skill.save(project.path, { name: "docs", description: "Write: docs", content: body })
        const docs = path.join(project.root, "docs", "SKILL.md")
        expect(created).toEqual(
          SkillV2.Info.make({
            name: "docs",
            description: "Write: docs",
            location: AbsolutePath.make(docs),
            content: `${body}\n`,
            mtime: (yield* Effect.promise(() => fs.stat(docs))).mtime.getTime(),
          }),
        )
        expect(yield* read(docs)).toBe(`---\nname: docs\ndescription: 'Write: docs'\n---\n${body}\n`)
        expect(yield* entries(path.dirname(docs))).toEqual(["SKILL.md"])
        const listed = yield* find("docs")
        expect(listed?.content).toBe(`${body}\n`)
        expect(listed?.mtime).toBe(created.mtime)
      }),
    ),
  )

  it.live("rewrites a registered project skill in place, keeping other front matter", () =>
    withProject((project) =>
      Effect.gen(function* () {
        const skill = yield* SkillV2.Service
        const review = path.join(project.root, "review", "SKILL.md")
        const before = yield* find("review")
        yield* skill.save(project.path, {
          name: "code-review",
          description: "New",
          content: "# New\n",
          location: review,
          mtime: before?.mtime,
        })
        expect(yield* read(review)).toBe("---\nname: code-review\ndescription: New\nlicense: MIT\n---\n# New\n")
        expect(yield* entries(path.dirname(review))).toEqual(["SKILL.md"])
        expect(yield* find("review")).toBeUndefined()
        expect((yield* find("code-review"))?.description).toBe("New")
      }),
    ),
  )

  it.live("refuses a stale modification time and leaves the file alone", () =>
    withProject((project) =>
      Effect.gen(function* () {
        const skill = yield* SkillV2.Service
        const review = path.join(project.root, "review", "SKILL.md")
        const before = (yield* find("review"))?.mtime ?? 0
        yield* Effect.promise(() => fs.utimes(review, new Date(before + 5_000), new Date(before + 5_000)))
        expect(
          yield* failure(
            skill.save(project.path, {
              name: "review",
              description: "Mine",
              content: "",
              location: review,
              mtime: before,
            }),
          ),
        ).toEqual(["conflict", "review changed on disk after it was read. Reopen it and try again."])
        expect(yield* read(review)).toBe(skillText("review", "license: MIT\n"))
      }),
    ),
  )

  it.live("rejects taken names, existing files and invalid input", () =>
    withProject((project) =>
      Effect.gen(function* () {
        const skill = yield* SkillV2.Service
        const stray = path.join(project.root, "stray", "SKILL.md")
        yield* Effect.promise(() => write(stray, "no front matter\n"))
        expect(yield* failure(skill.save(project.path, { name: "shared", description: "Again", content: "" }))).toEqual(
          ["conflict", "A skill named shared is already registered."],
        )
        expect(yield* failure(skill.save(project.path, { name: "stray", description: "Mine", content: "" }))).toEqual([
          "conflict",
          `${stray} already exists.`,
        ])
        expect(yield* read(stray)).toBe("no front matter\n")
        expect(yield* entries(path.dirname(stray))).toEqual(["SKILL.md"])
        for (const name of ["Code Review", "../escape", "a--b", "x".repeat(65)])
          expect((yield* failure(skill.save(project.path, { name, description: "Bad", content: "" })))[0]).toBe(
            "invalid",
          )
        expect(yield* failure(skill.save(project.path, { name: "blank", description: "  ", content: "" }))).toEqual([
          "invalid",
          "A skill needs a description.",
        ])
        expect(yield* exists(path.join(project.root, "blank"))).toBe(false)
      }),
    ),
  )

  it.live("keeps built-in, global, governed, unregistered and missing skills out of reach", () =>
    withProject((project) =>
      Effect.gen(function* () {
        const skill = yield* SkillV2.Service
        const edit = (location: string, name: string) =>
          failure(skill.save(project.path, { name, description: "Changed", content: "", location }))
        const shared = path.join(project.global, "shared", "SKILL.md")
        const governed = path.join(project.root, "own", "own_policy", "SKILL.md")
        const unregistered = path.join(project.root, "ghost", "SKILL.md")
        expect(yield* edit("/builtin/builtin.md", "builtin")).toEqual([
          "readonly",
          "builtin is built in and cannot be changed.",
        ])
        expect(yield* edit(shared, "shared")).toEqual([
          "readonly",
          "shared is outside this project's skill folders and is read-only here.",
        ])
        expect(yield* failure(skill.remove(project.path, shared))).toEqual([
          "readonly",
          "shared is outside this project's skill folders and is read-only here.",
        ])
        expect(yield* edit(governed, "own_policy")).toEqual([
          "readonly",
          "own_policy is governed by Atlas and is read-only.",
        ])
        expect(yield* failure(skill.remove(project.path, governed))).toEqual([
          "readonly",
          "own_policy is governed by Atlas and is read-only.",
        ])
        expect(yield* edit(unregistered, "ghost")).toEqual(["missing", `${unregistered} is not a registered skill.`])
        expect(yield* failure(skill.remove(project.path, unregistered))).toEqual([
          "missing",
          `${unregistered} is not a registered skill.`,
        ])
        const review = path.join(project.root, "review", "SKILL.md")
        yield* skill.list()
        yield* Effect.promise(() => fs.rm(review))
        expect(yield* failure(skill.remove(project.path, review))).toEqual([
          "missing",
          `${review} no longer exists on disk.`,
        ])
        expect(yield* read(shared)).toBe(skillText("shared"))
        expect(yield* read(governed)).toBe(skillText("own_policy"))
      }),
    ),
  )

  it.live("refuses targets that resolve through a symbolic link", () =>
    withProject((project) =>
      Effect.gen(function* () {
        const skill = yield* SkillV2.Service
        const linked = path.join(project.root, "linked", "SKILL.md")
        const message = `${linked} resolves through a symbolic link and cannot be changed.`
        expect((yield* find("linked"))?.location).toBe(AbsolutePath.make(linked))
        expect(
          yield* failure(
            skill.save(project.path, { name: "linked", description: "Mine", content: "", location: linked }),
          ),
        ).toEqual(["readonly", message])
        expect(yield* failure(skill.remove(project.path, linked))).toEqual(["readonly", message])
        expect(yield* read(path.join(project.outside, "linked", "SKILL.md"))).toBe(skillText("linked"))

        const other = path.join(project.outside, "other")
        yield* Effect.promise(async () => {
          await fs.mkdir(path.join(other, ".opencode"), { recursive: true })
          await fs.symlink(project.outside, path.join(other, ".opencode", "skills"))
        })
        expect(yield* failure(skill.save(other, { name: "escape", description: "Mine", content: "" }))).toEqual([
          "readonly",
          `${path.join(other, ".opencode", "skills", "escape", "SKILL.md")} resolves through a symbolic link and cannot be changed.`,
        ])
        expect(yield* exists(path.join(project.outside, "escape"))).toBe(false)
      }),
    ),
  )

  it.live("removes a skill file and only an emptied skill folder", () =>
    withProject((project) =>
      Effect.gen(function* () {
        const skill = yield* SkillV2.Service
        const created = yield* skill.save(project.path, { name: "docs", description: "Docs", content: "# Docs" })
        yield* skill.remove(project.path, created.location)
        expect(yield* exists(path.dirname(created.location))).toBe(false)

        const review = path.join(project.root, "review", "SKILL.md")
        yield* Effect.promise(() => fs.writeFile(path.join(project.root, "review", "notes.txt"), "keep"))
        yield* skill.remove(project.path, review)
        expect(yield* entries(path.join(project.root, "review"))).toEqual(["notes.txt"])

        const flat = path.join(project.root, "flat.md")
        yield* skill.remove(project.path, flat)
        expect(yield* exists(flat)).toBe(false)
        expect(yield* exists(project.root)).toBe(true)
        expect((yield* skill.list()).map((item) => item.name).toSorted()).toEqual([
          "builtin",
          "linked",
          "own_policy",
          "shared",
        ])
      }),
    ),
  )
})
