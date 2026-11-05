import fs from "fs/promises"
import path from "path"
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { AbsolutePath } from "@orchestra/core/schema"
import { SkillV2 } from "@orchestra/core/skill"
import { SkillTool } from "@orchestra/core/tool/skill"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)

const withFs = <A, E>(body: (input: { root: string; fs: FSUtil.Interface }) => Effect.Effect<A, E, never>) =>
  Effect.acquireUseRelease(
    Effect.promise(() => tmpdir()),
    (tmp) =>
      Effect.gen(function* () {
        return yield* body({ root: tmp.path, fs: yield* FSUtil.Service })
      }).pipe(Effect.provide(AppNodeBuilder.build(LayerNode.group([FSUtil.node]), []))),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  )

const skill = (name: string, location = `/skills/${name}/SKILL.md`) =>
  SkillV2.Info.make({ name, description: name, location: AbsolutePath.make(location), content: name })

describe("SkillTool.sampleFiles", () => {
  it.live("returns at most ten files, shallowest first, without SKILL.md", () =>
    withFs(({ root, fs: files }) =>
      Effect.gen(function* () {
        yield* Effect.promise(async () => {
          await fs.writeFile(path.join(root, "SKILL.md"), "skill")
          await Promise.all(
            Array.from({ length: 15 }, (_, index) =>
              fs.writeFile(path.join(root, `file-${String(index).padStart(2, "0")}.md`), "x"),
            ),
          )
          await fs.mkdir(path.join(root, "nested"))
          await fs.writeFile(path.join(root, "nested", "deep.md"), "x")
        })
        const sample = yield* SkillTool.sampleFiles(files, root)
        expect(sample.map((file) => path.relative(root, file))).toEqual(
          Array.from({ length: 10 }, (_, index) => `file-${String(index).padStart(2, "0")}.md`),
        )
      }),
    ),
  )

  it.live("reads a fixed number of directories, so a wide tree beside the skill is not scanned", () =>
    withFs(({ root, fs: files }) =>
      Effect.gen(function* () {
        // 80 sibling directories; the BFS visits the skill directory plus the first 49 of them, then stops.
        const names = Array.from({ length: 80 }, (_, index) => `d${String(index).padStart(2, "0")}`)
        yield* Effect.promise(async () => {
          await Promise.all(names.map((name) => fs.mkdir(path.join(root, name))))
          await fs.writeFile(path.join(root, "d10", "near.md"), "x")
          await fs.writeFile(path.join(root, "d70", "far.md"), "x")
          await fs.mkdir(path.join(root, "node_modules", "pkg"), { recursive: true })
          await fs.writeFile(path.join(root, "node_modules", "pkg", "ignored.md"), "x")
        })
        const sample = yield* SkillTool.sampleFiles(files, root)
        expect(sample.map((file) => path.relative(root, file))).toEqual([path.join("d10", "near.md")])
      }),
    ),
  )

  it.live("skips node_modules and .git markers while an allowed directory marker is sampled", () =>
    withFs(({ root, fs: files }) =>
      Effect.gen(function* () {
        yield* Effect.promise(async () => {
          await fs.mkdir(path.join(root, "allowed"))
          await fs.writeFile(path.join(root, "allowed", "seen.md"), "x")
          await fs.mkdir(path.join(root, "node_modules"))
          await fs.writeFile(path.join(root, "node_modules", "ignored-nm.md"), "x")
          await fs.mkdir(path.join(root, ".git"))
          await fs.writeFile(path.join(root, ".git", "ignored-git.md"), "x")
        })
        const sample = yield* SkillTool.sampleFiles(files, root)
        expect(sample.map((file) => path.relative(root, file))).toEqual([path.join("allowed", "seen.md")])
      }),
    ),
  )

  it.live("does not enqueue a directory symlink, while the real target still samples", () =>
    withFs(({ root, fs: files }) =>
      Effect.gen(function* () {
        const skillRoot = path.join(root, "skill")
        const target = path.join(root, "target")
        yield* Effect.promise(async () => {
          await fs.mkdir(path.join(skillRoot, "allowed"), { recursive: true })
          await fs.writeFile(path.join(skillRoot, "allowed", "seen.md"), "x")
          await fs.mkdir(target)
          await fs.writeFile(path.join(target, "target-marker.md"), "x")
          // junction: directory junction on Windows, directory symlink on macOS and Linux.
          await fs.symlink(target, path.join(skillRoot, "via-link"), "junction")
        })
        const throughLink = yield* SkillTool.sampleFiles(files, skillRoot)
        expect(throughLink.map((file) => path.relative(skillRoot, file))).toEqual([path.join("allowed", "seen.md")])
        const direct = yield* SkillTool.sampleFiles(files, target)
        expect(direct.map((file) => path.relative(target, file))).toEqual(["target-marker.md"])
      }),
    ),
  )

  it.live("reaches the marker in the 49th child and not the 50th", () =>
    withFs(({ root, fs: files }) =>
      Effect.gen(function* () {
        // Root is the first visit. Children c00..c59 sort in that order, so c48 is the 49th child (visit 50) and c49 is not read.
        const names = Array.from({ length: 60 }, (_, index) => `c${String(index).padStart(2, "0")}`)
        yield* Effect.promise(async () => {
          await Promise.all(names.map((name) => fs.mkdir(path.join(root, name))))
          await fs.writeFile(path.join(root, "c48", "reached.md"), "x")
          await fs.writeFile(path.join(root, "c49", "beyond.md"), "x")
        })
        const sample = yield* SkillTool.sampleFiles(files, root)
        expect(sample.map((file) => path.relative(root, file))).toEqual([path.join("c48", "reached.md")])
      }),
    ),
  )

  it.live("treats an unreadable directory as empty", () =>
    withFs(({ root, fs: files }) =>
      Effect.gen(function* () {
        expect(yield* SkillTool.sampleFiles(files, path.join(root, "missing"))).toEqual([])
      }),
    ),
  )
})

describe("SkillTool.missingSkill", () => {
  it.effect("lists every top-level skill name when there are few, leaving out tree nodes", () =>
    Effect.sync(() => {
      const skills = [
        skill("zeta"),
        skill("alpha"),
        skill("alpha-node", "/skills/alpha/node/SKILL.md"),
      ]
      expect(SkillTool.missingSkill("beta", skills)).toBe(
        "Unable to load skill beta: not found. Available skills: alpha, zeta",
      )
    }),
  )

  it.effect("names the closest few when there are many", () =>
    Effect.sync(() => {
      const skills = [
        ...Array.from({ length: 30 }, (_, index) => skill(`unrelated-${String(index).padStart(2, "0")}`)),
        skill("effect-ts"),
      ]
      const message = SkillTool.missingSkill("efect-ts", skills)
      expect(message).toStartWith("Unable to load skill efect-ts: not found. Closest of 31 available skills: effect-ts")
      expect(message.split(": ").at(-1)?.split(", ")).toHaveLength(5)
    }),
  )

  it.effect("says so when no skills exist", () =>
    Effect.sync(() => {
      expect(SkillTool.missingSkill("any", [])).toBe("Unable to load skill any: not found, and no skills are available")
    }),
  )

  it.effect("lists all twenty root names", () =>
    Effect.sync(() => {
      const names = Array.from({ length: 20 }, (_, index) => `skill-${String(index + 1).padStart(2, "0")}`)
      const skills = [...names.map((name) => skill(name)), skill("aaa-node", "/skills/skill-01/node/SKILL.md")]
      expect(SkillTool.missingSkill("missing", skills)).toBe(
        `Unable to load skill missing: not found. Available skills: ${names.join(", ")}`,
      )
    }),
  )

  it.effect("names the five nearest of twenty-one in alphabetical tie order", () =>
    Effect.sync(() => {
      // Six one-edit names of "core", supplied reverse-alphabetical, plus fifteen far names.
      // Equal distance keeps the sorted-name order, so the fifth tie wins and cove loses.
      const tied = ["cove", "corex", "cores", "cor", "care", "bore"]
      const far = Array.from({ length: 15 }, (_, index) => `unrelated-${String(index).padStart(2, "0")}`)
      const message = SkillTool.missingSkill("core", [...far, ...tied].map((name) => skill(name)))
      expect(message).toBe(
        "Unable to load skill core: not found. Closest of 21 available skills: bore, care, cor, cores, corex",
      )
    }),
  )
})
