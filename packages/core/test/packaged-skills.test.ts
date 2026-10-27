import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Cause, Effect, Layer, Schema } from "effect"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { Config } from "../src/config"
import { Global } from "../src/global"
import { InstallationVersion } from "../src/installation/version"
import { Location } from "../src/location"
import { AbsolutePath } from "../src/schema"
import { SkillV2 } from "../src/skill"
import { PackagedSkills } from "../src/packaged-skills"
import { location } from "./fixture/location"
import { bundle, isolated, snapshot, trees } from "./fixture/packaged-skills"
import { testEffect } from "./lib/effect"
import { host } from "./plugin/host"

test("source execution has no embedded trees and does not create an extraction cache", () => isolated(async (cache) => {
  expect(PackagedSkills.embedded()).toBeUndefined()
  const absent = path.join(cache, "unused")
  expect(await PackagedSkills.materialize({ cache: absent, version: "local" })).toEqual([])
  await expect(fs.lstat(absent)).rejects.toMatchObject({ code: "ENOENT" })
}))

test("Bun define embeds a nonempty binary-equivalent map; extraction needs no authored source tree", () => isolated(async (cache) => {
  const source = path.join(cache, "authored")
  await fs.mkdir(source)
  await fs.writeFile(path.join(source, "trees.json"), JSON.stringify(trees))
  const captured: unknown = JSON.parse(await fs.readFile(path.join(source, "trees.json"), "utf8"))
  const module = path.join(cache, "embedded.mjs")
  await bundle(path.resolve(import.meta.dirname, "../src/packaged-skills.ts"), captured, module)
  await fs.rm(source, { recursive: true })
  const compiled: typeof import("../src/packaged-skills") = await import(module)
  expect(compiled.embedded()).toEqual(trees)
  expect(Object.keys(trees).length).toBeGreaterThan(0)
  const roots = await compiled.materialize({ cache, version: "1.2.3" })
  expect(roots.map((root) => path.basename(root))).toEqual(Object.keys(trees).toSorted())
  for (const [id, files] of Object.entries(trees)) {
    const root = roots.find((root) => path.basename(root) === id)
    expect(root).toBeDefined()
    if (!root) throw new Error(`Missing extracted seat: ${id}`)
    for (const [file, text] of Object.entries(files)) {
      expect(await fs.readFile(path.join(root, ...file.split("/")))).toEqual(Buffer.from(text, "utf8"))
    }
  }
  await expect(fs.lstat(source)).rejects.toMatchObject({ code: "ENOENT" })
}))

test("defined empty Bun payload fails instead of becoming source mode", () => isolated(async (cache) => {
  const module = path.join(cache, "empty.mjs")
  await bundle(path.resolve(import.meta.dirname, "../src/packaged-skills.ts"), {}, module)
  const compiled: typeof import("../src/packaged-skills") = await import(module)
  expect(compiled.embedded()).toEqual({})
  await expect(compiled.materialize({ cache, version: "1" })).rejects.toThrow("Empty or invalid packaged skill trees")
}))

test("exact reuse keeps inodes; path order does not change digest; changed bytes retain old version", () => isolated(async (cache) => {
  const roots = await PackagedSkills.materialize({ cache, version: "1.2.3", trees })
  const first = path.join(roots[1], "backend-implement/SKILL.md")
  const original = await fs.lstat(first)
  expect(PackagedSkills.digest(trees)).toMatch(/^[a-f0-9]{64}$/)
  const reordered = Object.fromEntries(Object.entries(trees).reverse().map(([id, files]) => [
    id, Object.fromEntries(Object.entries(files).reverse()),
  ]))
  expect(PackagedSkills.digest(reordered)).toBe(PackagedSkills.digest(trees))
  expect(await PackagedSkills.materialize({ cache, version: "1.2.3", trees: reordered })).toEqual(roots)
  expect((await fs.lstat(first)).ino).toBe(original.ino)
  expect((await fs.lstat(first)).mtimeMs).toBe(original.mtimeMs)
  const changed = { ...trees, backend: { ...trees.backend, "backend-implement/SKILL.md": "Changed\n" } }
  const next = await PackagedSkills.materialize({ cache, version: "1.2.3", trees: changed })
  expect(path.dirname(next[0])).not.toBe(path.dirname(roots[0]))
  expect(path.basename(path.dirname(next[0]))).toBe(
    `1.2.3-${createHash("sha256").update("1.2.3", "utf8").digest("hex")}-${PackagedSkills.digest(changed)}`,
  )
  expect(await fs.readFile(first, "utf8")).toBe(trees.backend["backend-implement/SKILL.md"])
  expect(await fs.readFile(path.join(next[1], "backend-implement/SKILL.md"), "utf8")).toBe("Changed\n")
  const newer = await PackagedSkills.materialize({ cache, version: "2.0.0", trees })
  expect(path.dirname(newer[0])).not.toBe(path.dirname(roots[0]))
  const reference = "backend-implement/references/deep/contract.md"
  const references = { ...trees, backend: { ...trees.backend, [reference]: "Changed reference\n" } }
  const revised = await PackagedSkills.materialize({ cache, version: "1.2.3", trees: references })
  expect(path.dirname(revised[0])).not.toBe(path.dirname(roots[0]))
  expect(await fs.readFile(path.join(revised[1], reference), "utf8")).toBe("Changed reference\n")
  expect(await fs.readFile(path.join(roots[1], reference), "utf8")).toBe(trees.backend[reference])
}))

test.each([
  ["1.2.3+build", "1.2.3-build", "1.2.3-build"],
  ["Release", "release", "Release"],
  [`${"v".repeat(60)}+first`, `${"v".repeat(60)}-second`, "v".repeat(60)],
])("exact version %s never aliases %s", (version, other, prefix) => isolated(async (cache) => {
  const roots = await PackagedSkills.materialize({ cache, version, trees })
  const next = await PackagedSkills.materialize({ cache, version: other, trees })
  expect(path.basename(path.dirname(roots[0]))).toBe(
    `${prefix}-${createHash("sha256").update(version, "utf8").digest("hex")}-${PackagedSkills.digest(trees)}`,
  )
  expect(path.dirname(next[0]).toLowerCase()).not.toBe(path.dirname(roots[0]).toLowerCase())
  expect(await fs.readdir(path.join(cache, "packaged-skills"))).toHaveLength(2)
  expect(await PackagedSkills.materialize({ cache, version, trees })).toEqual(roots)
  expect(await PackagedSkills.materialize({ cache, version: other, trees })).toEqual(next)
}))

test.each([
  {}, [], null, { backend: {} }, { "../backend": trees.backend },
  { backend: { "references/only.md": "missing entry" } },
  { backend: { "SKILL.md": " \n" } }, { backend: { "SKILL.md": 42 } },
  { backend: { "SKILL.md": "\ud800" } },
  ...["../SKILL.md", "/SKILL.md", "x//SKILL.md", "x/./SKILL.md", "x\\SKILL.md", "C:/SKILL.md", "nul/SKILL.md", "x./SKILL.md", "x\u0000/SKILL.md"]
    .map((file) => ({ backend: { [file]: "entry" } })),
  { backend: { "SKILL.md": "entry", "x.md": "one", "X.md": "two" } },
  { backend: { "SKILL.md": "entry", x: "file", "x/ref.md": "reference" } },
].map((invalid) => [invalid] as const))("invalid embedded map refuses before touching cache: %#", (invalid) => isolated(async (cache) => {
  const unused = path.join(cache, "unused")
  await expect(PackagedSkills.materialize({ cache: unused, version: "1", trees: invalid })).rejects.toBeInstanceOf(PackagedSkills.PackagingError)
  await expect(fs.lstat(unused)).rejects.toMatchObject({ code: "ENOENT" })
}))

const it = testEffect(AppNodeBuilder.build(SkillV2.node))
const configIt = testEffect(Layer.empty)

configIt.live("required compiled Config initialization admits valid roots and rejects empty payload or corrupt publication", () =>
  Effect.acquireRelease(
    Effect.promise(() => fs.mkdtemp(path.join(tmpdir(), "orchestra-packaged-config-"))),
    (cache) => Effect.promise(() => fs.rm(cache, { recursive: true, force: true })),
  ).pipe(Effect.flatMap((cache) => Effect.gen(function* () {
    const directory = path.join(cache, "location")
    const globalDirectory = path.join(cache, "global")
    const validModule = path.join(cache, "config-valid.mjs")
    const emptyModule = path.join(cache, "config-empty.mjs")
    yield* Effect.promise(async () => {
      await fs.mkdir(directory)
      await fs.mkdir(globalDirectory)
      await bundle(path.resolve(import.meta.dirname, "../src/config.ts"), trees, validModule)
      await bundle(path.resolve(import.meta.dirname, "../src/config.ts"), {}, emptyModule)
    })
    const compiled: typeof import("../src/config") = yield* Effect.promise(() => import(validModule))
    const empty: typeof import("../src/config") = yield* Effect.promise(() => import(emptyModule))
    const boot = (node: typeof Config.node) => Effect.gen(function* () {
      const config = yield* Config.Service
      return config
    }).pipe(
      Effect.provide(AppNodeBuilder.build(node, [
        [Global.node, Global.layerWith({
          home: cache,
          cache,
          config: globalDirectory,
          data: path.join(cache, "data"),
          state: path.join(cache, "state"),
          tmp: path.join(cache, "tmp"),
          bin: path.join(cache, "bin"),
          log: path.join(cache, "log"),
          repos: path.join(cache, "repos"),
        })],
        [
          Location.node,
          Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make(directory) }))),
        ],
      ])),
    )
    // Positive control uses the same required node and real filesystem/policy dependencies.
    const admitted = yield* boot(compiled.node)
    expect(yield* admitted.entries()).toMatchObject([{ type: "directory", path: globalDirectory }])
    if (!admitted.packagedSkills) throw new Error("Required Config did not expose admitted packaged roots")
    const roots = yield* admitted.packagedSkills()
    expect(roots.map((root) => path.basename(root))).toEqual(["archie", "backend"])
    expect(path.basename(path.dirname(roots[0]))).toBe(
      `${InstallationVersion.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 60)}-${createHash("sha256").update(InstallationVersion, "utf8").digest("hex")}-${PackagedSkills.digest(trees)}`,
    )
    for (const [relative, text] of Object.entries(trees.backend)) {
      const file = path.join(roots[1], relative)
      yield* Effect.promise(() => fs.writeFile(file, "tampered"))
      const before = yield* Effect.promise(() => snapshot(path.join(cache, "packaged-skills")))
      // Accessors reuse admission; reopening the required Config layer revalidates every reference too.
      expect(yield* admitted.packagedSkills()).toBe(roots)
      const corrupt = yield* boot(compiled.node).pipe(Effect.exit)
      expect(corrupt._tag).toBe("Failure")
      if (corrupt._tag !== "Failure") throw new Error(`Corrupt publication admitted required Config: ${relative}`)
      expect(Cause.pretty(corrupt.cause)).toContain(`Packaged skill bytes differ: backend/${relative}`)
      expect(yield* Effect.promise(() => snapshot(path.join(cache, "packaged-skills")))).toEqual(before)
      expect(yield* Effect.promise(() => fs.readFile(file, "utf8"))).toBe("tampered")
      // Restore only in the test, so the next iteration corrupts exactly one file.
      yield* Effect.promise(() => fs.writeFile(file, text))
      const restored = yield* boot(compiled.node)
      if (!restored.packagedSkills) throw new Error("Restored required Config did not expose packaged roots")
      expect(yield* restored.packagedSkills()).toEqual(roots)
    }
    const absent = yield* boot(empty.node).pipe(Effect.exit)
    expect(absent._tag).toBe("Failure")
    if (absent._tag !== "Failure") throw new Error("Empty compiled payload admitted required Config")
    expect(Cause.pretty(absent.cause)).toContain("Empty or invalid packaged skill trees")
  }))),
)

it.live("config plugin registers admitted packaged roots first and preserves user overrides", () =>
  Effect.acquireRelease(
    Effect.promise(() => fs.mkdtemp(path.join(tmpdir(), "orchestra-packaged-plugin-"))),
    (cache) => Effect.promise(() => fs.rm(cache, { recursive: true, force: true })),
  ).pipe(Effect.flatMap((cache) => Effect.gen(function* () {
    const module = path.join(cache, "plugin.mjs")
    const directory = path.join(cache, "user")
    yield* Effect.promise(async () => {
      await bundle(path.resolve(import.meta.dirname, "../src/config/plugin/skill.ts"), trees, module)
      await fs.mkdir(path.join(directory, "skills/backend-implement"), { recursive: true })
      await fs.writeFile(path.join(directory, "skills/backend-implement/SKILL.md"), "---\nname: backend-implement\n---\nUser wins\n")
    })
    const compiled: typeof import("../src/config/plugin/skill") = yield* Effect.promise(() => import(module))
    const packaged = yield* Effect.promise(() => PackagedSkills.materialize({ cache, version: InstallationVersion, trees }))
    const skill = yield* SkillV2.Service
    const open = compiled.Plugin.effect(host({ skill: {
      reload: skill.reload,
      transform: (callback) => skill.transform((draft) => callback({
        source: (source) => draft.source(Schema.decodeUnknownSync(SkillV2.Source)(source)),
        list: draft.list,
      })),
    } })).pipe(
      Effect.provideService(Global.Service, Global.Service.of({ ...Global.make(), cache })),
      Effect.provideService(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make(directory) }))),
      Effect.provideService(Config.Service, Config.Service.of({
        packagedSkills: () => Effect.succeed(packaged),
        entries: () => Effect.succeed([
          new Config.Directory({ type: "directory", path: AbsolutePath.make(directory) }),
          new Config.Document({
            type: "document",
            info: Schema.decodeUnknownSync(Config.Info)({ skills: [path.join(directory, "configured")] }),
          }),
        ]),
      })),
    )
    yield* open
    const sources = yield* skill.sources()
    expect(sources).toHaveLength(5)
    expect(sources.slice(0, 2).map((source) => source.type === "directory" ? path.basename(source.path) : source.type))
      .toEqual(["archie", "backend"])
    expect(sources.slice(2)).toEqual(["skill", "skills", "configured"].map((name) =>
      SkillV2.DirectorySource.make({ type: "directory", path: AbsolutePath.make(path.join(directory, name)) }),
    ))
    const listed = yield* skill.list()
    expect(listed.map((skill) => skill.name).toSorted()).toEqual(["archie-design", "backend-implement"])
    expect(listed.find((skill) => skill.name === "backend-implement")?.content.trim()).toBe("User wins")
  }))),
)

test("cooperative concurrent starts publish one complete tree and clean their stages and locks", () => isolated(async (cache) => {
  const results = await Promise.all(Array.from({ length: 12 }, () => PackagedSkills.materialize({ cache, version: "1", trees })))
  expect(results).toHaveLength(12)
  results.forEach((roots) => expect(roots).toEqual(results[0]))
  expect(await fs.readdir(path.join(cache, "packaged-skills"))).toEqual([
    `1-${createHash("sha256").update("1", "utf8").digest("hex")}-${PackagedSkills.digest(trees)}`,
  ])
  expect(await fs.readFile(path.join(results[0][1], "backend-implement/references/deep/contract.md"), "utf8"))
    .toBe(trees.backend["backend-implement/references/deep/contract.md"])
}))

test("valid publication reuses before an abandoned lock; corrupt or partial publication still fails closed", () => isolated(async (cache) => {
  const roots = await PackagedSkills.materialize({ cache, version: "1", trees })
  const target = path.dirname(roots[0])
  const file = path.join(roots[1], "backend-implement/SKILL.md")
  const before = await fs.lstat(file)
  await fs.mkdir(`${target}.lock`)
  await fs.mkdir(`${target}.stage-other`)
  const lock = await fs.lstat(`${target}.lock`)
  expect(await PackagedSkills.materialize({ cache, version: "1", trees, lockTimeoutMs: 0 })).toEqual(roots)
  expect((await fs.lstat(file)).ino).toBe(before.ino)
  expect((await fs.lstat(file)).mtimeMs).toBe(before.mtimeMs)
  await fs.writeFile(file, "tampered")
  await expect(PackagedSkills.materialize({ cache, version: "1", trees, lockTimeoutMs: 0 }))
    .rejects.toThrow("Packaged skill bytes differ")
  expect(await fs.readFile(file, "utf8")).toBe("tampered")
  await fs.unlink(file)
  await expect(PackagedSkills.materialize({ cache, version: "1", trees, lockTimeoutMs: 0 }))
    .rejects.toThrow("Incomplete packaged skill tree")
  expect((await fs.lstat(`${target}.lock`)).ino).toBe(lock.ino)
  expect((await fs.readdir(path.dirname(target))).sort()).toEqual([
    path.basename(target), `${path.basename(target)}.lock`, `${path.basename(target)}.stage-other`,
  ])
}))

test("bounded wait never steals another writer's lock or stage", () => isolated(async (cache) => {
  const namespace = path.join(cache, "packaged-skills")
  await fs.mkdir(namespace)
  const target = path.join(
    namespace,
    `1-${createHash("sha256").update("1", "utf8").digest("hex")}-${PackagedSkills.digest(trees)}`,
  )
  await fs.mkdir(`${target}.lock`)
  await fs.mkdir(`${target}.stage-other`)
  await expect(PackagedSkills.materialize({ cache, version: "1", trees, lockTimeoutMs: 40 }))
    .rejects.toThrow("Timed out waiting for packaged skill lock")
  // readdir order is filesystem-defined.
  expect((await fs.readdir(namespace)).toSorted()).toEqual([`${path.basename(target)}.lock`, `${path.basename(target)}.stage-other`])
}))

test("canonicalizes cache and refuses a symlinked packaged-skills namespace", () => isolated(async (cache) => {
  const real = path.join(cache, "real")
  const alias = path.join(cache, "alias")
  await fs.mkdir(real)
  await fs.symlink(real, alias, process.platform === "win32" ? "junction" : "dir")
  const roots = await PackagedSkills.materialize({ cache: alias, version: "1", trees })
  expect(path.dirname(path.dirname(roots[0]))).toBe(path.join(await fs.realpath(real), "packaged-skills"))
  await fs.rename(path.join(real, "packaged-skills"), path.join(real, "retained"))
  await fs.symlink(path.join(real, "retained"), path.join(real, "packaged-skills"), process.platform === "win32" ? "junction" : "dir")
  await expect(PackagedSkills.materialize({ cache: real, version: "1", trees })).rejects.toThrow("Invalid packaged skill directory")
}))
