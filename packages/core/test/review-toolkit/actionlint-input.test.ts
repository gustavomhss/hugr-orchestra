import { expect, test } from "bun:test"
import { constants } from "node:fs"
import { chmod, mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Deferred, Effect, Fiber } from "effect"
import { ReviewActionlintInput } from "../../src/review-toolkit/packs/actionlint-input"

test("projects only selected workflow bytes into a host-owned isolated project", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "actionlint-input-test-"))
  const source = path.join(base, "source")
  const scratch = path.join(base, "scratch")
  await mkdir(path.join(source, ".github", "workflows"), { recursive: true })
  await mkdir(scratch)
  await writeFile(path.join(source, ".github", "workflows", "ci.yml"), "name: CI\n")
  await writeFile(path.join(source, ".github", "actionlint.yaml"), "self-hosted: true\n")
  if (!constants.O_NOFOLLOW) {
    const result = await Effect.runPromise(Effect.scoped(ReviewActionlintInput.prepare({ root: source, files: [".github/workflows/ci.yml"], scratch })))
    expect(result).toEqual({ status: "not-run", reason: "no-follow-unavailable" })
    expect(await readFile(path.join(source, ".github", "workflows", "ci.yml"), "utf8")).toBe("name: CI\n")
    expect(await readdir(scratch)).toEqual([])
    await rm(base, { recursive: true, force: true })
    return
  }
  let projection = ""
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const result = yield* ReviewActionlintInput.prepare({ root: source, files: [".github/workflows/ci.yml"], scratch })
    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("projection refused")
    projection = result.root
    expect(result.paths[0].file).toBe(".github/workflows/input-0.yaml")
    expect(yield* Effect.promise(() => readFile(path.join(result.root, result.paths[0].file), "utf8"))).toBe("name: CI\n")
    expect(yield* Effect.promise(() => readFile(result.config, "utf8"))).toBe("{}\n")
    expect(result.paths[0].path).toBe(".github/workflows/ci.yml")
    expect(ReviewActionlintInput.argv("/usr/bin/actionlint", result).status).toBe("ok")
    const env = ReviewActionlintInput.environment(result.root, { PATH: "/bin", ACTIONLINT_CONFIG: "bad", GOFLAGS: "bad" })
    expect(env).toMatchObject({ PATH: "/bin", NO_COLOR: "1", HOME: result.root })
    expect(Object.hasOwn(env, "ACTIONLINT_CONFIG")).toBe(false)
    expect(Object.hasOwn(env, "GOFLAGS")).toBe(false)
  })))
  expect(await Bun.file(projection).exists()).toBe(false)
  await rm(base, { recursive: true, force: true })
})

test("keeps sorted/deduplicated projection bytes paired with their source names", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "actionlint-map-test-"))
  const source = path.join(base, "source")
  const scratch = path.join(base, "scratch")
  await mkdir(path.join(source, ".github", "workflows"), { recursive: true })
  await mkdir(scratch)
  await writeFile(path.join(source, ".github", "workflows", "a.yml"), "name: A\n")
  await writeFile(path.join(source, ".github", "workflows", "z.yaml"), "name: Z\n")
  if (!constants.O_NOFOLLOW) {
    const result = await Effect.runPromise(Effect.scoped(ReviewActionlintInput.prepare({ root: source, files: [".github/workflows/z.yaml", ".github/workflows/a.yml", ".github/workflows/z.yaml"], scratch })))
    expect(result).toEqual({ status: "not-run", reason: "no-follow-unavailable" })
    expect(await readFile(path.join(source, ".github", "workflows", "a.yml"), "utf8")).toBe("name: A\n")
    expect(await readdir(scratch)).toEqual([])
    await rm(base, { recursive: true, force: true })
    return
  }
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const result = yield* ReviewActionlintInput.prepare({ root: source, files: [".github/workflows/z.yaml", ".github/workflows/a.yml", ".github/workflows/z.yaml"], scratch })
    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("projection refused")
    expect(result.paths.map((entry) => entry.path)).toEqual([".github/workflows/a.yml", ".github/workflows/z.yaml"])
    expect(yield* Effect.promise(() => readFile(path.join(result.root, result.paths[1].file), "utf8"))).toBe("name: Z\n")
  })))
  await rm(base, { recursive: true, force: true })
})

test("preserves literal backslashes in POSIX source filenames", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "actionlint-backslash-"))
  const source = path.join(base, "source")
  const scratch = path.join(base, "scratch")
  await mkdir(path.join(source, ".github", "workflows"), { recursive: true })
  await mkdir(scratch)
  const workflow = path.sep === "/" ? ".github/workflows/literal\\name.yml" : ".github/workflows/native-name.yml"
  await writeFile(path.join(source, workflow), "name: Literal\n")
  if (!constants.O_NOFOLLOW) {
    const result = await Effect.runPromise(Effect.scoped(ReviewActionlintInput.prepare({ root: source, files: [workflow], scratch })))
    expect(result).toEqual({ status: "not-run", reason: "no-follow-unavailable" })
    expect(await readFile(path.join(source, workflow), "utf8")).toBe("name: Literal\n")
    expect(await readdir(scratch)).toEqual([])
    await rm(base, { recursive: true, force: true })
    return
  }
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const result = yield* ReviewActionlintInput.prepare({ root: source, files: [workflow], scratch })
    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("projection refused")
    expect(result.paths[0].path).toBe(workflow)
  })))
  await rm(base, { recursive: true, force: true })
})

test("refuses empty, traversing, outside, wrong-location and oversized selections", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "actionlint-refuse-test-"))
  const source = path.join(base, "source")
  const scratch = path.join(base, "scratch")
  await mkdir(path.join(source, ".github", "workflows"), { recursive: true })
  await mkdir(scratch)
  await writeFile(path.join(source, ".github", "workflows", "large.yml"), "#".repeat(4 * 1024 * 1024 + 1))
  for (const files of [[], ["../outside.yml"], [".github/workflows/../workflows/large.yml"], [".github/workflows/large\0.yml"], [path.join(base, "outside.yml")], [".github/other.yml"], [".github/workflows/no.txt"], [".github/workflows/large.yml"]]) {
    const result = await Effect.runPromise(Effect.scoped(ReviewActionlintInput.prepare({ root: source, files, scratch })))
    expect(result.status).not.toBe("ok")
  }
  const overlap = await Effect.runPromise(Effect.scoped(ReviewActionlintInput.prepare({ root: source, files: [".github/workflows/large.yml"], scratch: source })))
  expect(overlap.status).not.toBe("ok")
  expect((await Effect.runPromise(Effect.scoped(ReviewActionlintInput.prepare({ root: source, files: Array.from({ length: 10_001 }, () => ".github/workflows/large.yml"), scratch })))).status).not.toBe("ok")
  expect((await Effect.runPromise(Effect.scoped(ReviewActionlintInput.prepare({ root: source, files: [".github/workflows/large.yml"], scratch: base })))).status).not.toBe("ok")
  await rm(base, { recursive: true, force: true })
})

test("refuses selected symlinks and preserves source content, mode, and config", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "actionlint-symlink-test-"))
  const source = path.join(base, "source")
  const scratch = path.join(base, "scratch")
  await mkdir(path.join(source, ".github", "workflows"), { recursive: true })
  await mkdir(scratch)
  const original = path.join(source, ".github", "workflows", "real.yml")
  await writeFile(original, "name: Original\n")
  await chmod(original, 0o640)
  const originalMode = (await Bun.file(original).stat()).mode & 0o777
  await writeFile(path.join(source, ".github", "actionlint.yaml"), "owner: repo\n")
  await symlink(original, path.join(source, ".github", "workflows", "link.yml"))
  if (!constants.O_NOFOLLOW) {
    const result = await Effect.runPromise(Effect.scoped(ReviewActionlintInput.prepare({ root: source, files: [".github/workflows/link.yml"], scratch })))
    expect(result).toEqual({ status: "unsupported", reason: "symlink" })
    expect(await readFile(original, "utf8")).toBe("name: Original\n")
    expect((await Bun.file(original).stat()).mode & 0o777).toBe(originalMode)
    expect(await readFile(path.join(source, ".github", "actionlint.yaml"), "utf8")).toBe("owner: repo\n")
    expect(await readdir(scratch)).toEqual([])
    await rm(base, { recursive: true, force: true })
    return
  }
  const result = await Effect.runPromise(Effect.scoped(ReviewActionlintInput.prepare({ root: source, files: [".github/workflows/link.yml"], scratch })))
  expect(result.status).not.toBe("ok")
  expect(await readFile(original, "utf8")).toBe("name: Original\n")
  expect((await Bun.file(original).stat()).mode & 0o777).toBe(originalMode)
  expect(await readFile(path.join(source, ".github", "actionlint.yaml"), "utf8")).toBe("owner: repo\n")
  await rm(base, { recursive: true, force: true })
})

test("rejects empty or forged argv projections and strips case-insensitive tool variables", () => {
  const root = path.resolve("actionlint-project")
  const prepared = { status: "ok" as const, root, files: [path.join(root, ".github/workflows/input-0.yaml")], paths: [{ file: ".github/workflows/input-0.yaml", path: ".github/workflows/source.yml" }], config: path.join(root, ".github/actionlint.yaml") }
  expect(ReviewActionlintInput.argv("/bin/actionlint", { ...prepared, files: [] }).status).not.toBe("ok")
  expect(ReviewActionlintInput.argv("/bin/actionlint", { ...prepared, paths: [] }).status).not.toBe("ok")
  expect(ReviewActionlintInput.argv("/bin/actionlint", { ...prepared, config: "/tmp/actionlint.yaml" }).status).not.toBe("ok")
  expect(ReviewActionlintInput.argv("relative/actionlint", prepared).status).not.toBe("ok")
  expect(ReviewActionlintInput.argv("/bin/actionlint\0evil", prepared).status).not.toBe("ok")
  expect(ReviewActionlintInput.argv("/bin/actionlint", { ...prepared, paths: [{ file: "..", path: ".github/workflows/source.yml" }] }).status).not.toBe("ok")
  expect(ReviewActionlintInput.argv("/bin/actionlint", { ...prepared, files: [...prepared.files, path.join(root, ".github/workflows/input-1.yaml")], paths: [...prepared.paths, { file: ".github/workflows/input-1.yaml", path: ".github/workflows/source.yml" }] }).status).not.toBe("ok")
  const env = ReviewActionlintInput.environment(root, { ACTIONLINT: "x", actionlint_MORE: "x", SHELLCHECK: "x", SHELLCHECK_OPTS: "x", Pyflakes: "x", PYFLAKES_ARGS: "x", GO: "x", GOFLAGS: "x", SystemRoot: "keep" })
  const entries = Object.entries(env)
  for (const key of ["ACTIONLINT", "actionlint_MORE", "SHELLCHECK", "SHELLCHECK_OPTS", "Pyflakes", "PYFLAKES_ARGS", "GO", "GOFLAGS"]) expect(entries.some(([name]) => name === key)).toBe(false)
  expect(entries.find(([name]) => name === "SystemRoot")?.[1]).toBe("keep")
  expect(env.NO_COLOR).toBe("1")
})

test("rejects raw invalid roots and validates Windows projections using Windows path rules", () => {
  const winRoot = "C:\\review\\project"
  const winPrepared = {
    status: "ok" as const,
    root: winRoot,
    files: ["C:\\review\\project\\.github\\workflows\\input-0.yaml"],
    paths: [{ file: ".github/workflows/input-0.yaml", path: ".github/workflows/source.yml" }],
    config: "C:\\review\\project\\.github\\actionlint.yaml",
  }
  expect(ReviewActionlintInput.argv("C:\\tools\\actionlint.exe", winPrepared).status).toBe("ok")
  for (const source of [".github/workflows/..\\outside.yml", ".github/workflows/../outside.yml"]) {
    expect(ReviewActionlintInput.argv("C:\\tools\\actionlint.exe", { ...winPrepared, paths: [{ ...winPrepared.paths[0], path: source }] }).status).not.toBe("ok")
  }
  for (const root of ["", "relative/project", "C:\\review\0project"]) {
    expect(ReviewActionlintInput.argv("/bin/actionlint", { ...winPrepared, root }).status).not.toBe("ok")
  }
})

test("reads every byte of a workflow larger than one read chunk", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "actionlint-chunks-"))
  const source = path.join(base, "source")
  const scratch = path.join(base, "scratch")
  await mkdir(path.join(source, ".github", "workflows"), { recursive: true })
  await mkdir(scratch)
  const bytes = Buffer.from(`name: Chunked\n${"# padding\n".repeat(40_000)}`)
  const file = path.join(source, ".github", "workflows", "chunked.yml")
  await writeFile(file, bytes)
  if (!constants.O_NOFOLLOW) {
    const result = await Effect.runPromise(Effect.scoped(ReviewActionlintInput.prepare({ root: source, files: [".github/workflows/chunked.yml"], scratch })))
    expect(result).toEqual({ status: "not-run", reason: "no-follow-unavailable" })
    expect(await readFile(file)).toEqual(bytes)
    expect(await readdir(scratch)).toEqual([])
    await rm(base, { recursive: true, force: true })
    return
  }
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const result = yield* ReviewActionlintInput.prepare({ root: source, files: [".github/workflows/chunked.yml"], scratch })
    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("projection refused")
    expect(yield* Effect.promise(() => readFile(path.join(result.root, result.paths[0].file)))).toEqual(bytes)
  })))
  await rm(base, { recursive: true, force: true })
})

test("detects leaf and ancestor replacement at the pre-open observation seam", async () => {
  for (const replaceAncestor of [false, true]) {
    const base = await mkdtemp(path.join(os.tmpdir(), "actionlint-replacement-"))
    const source = path.join(base, "source")
    const scratch = path.join(base, "scratch")
    const workflows = path.join(source, ".github", "workflows")
    const file = path.join(workflows, "ci.yml")
    const outside = path.join(base, "outside")
    await mkdir(workflows, { recursive: true })
    await mkdir(scratch)
    await mkdir(outside)
    await writeFile(file, "name: Inside\n")
    await writeFile(path.join(outside, "ci.yml"), "name: Outside\n")
    if (!constants.O_NOFOLLOW) {
      const result = await Effect.runPromise(Effect.scoped(ReviewActionlintInput.prepare({ root: source, files: [".github/workflows/ci.yml"], scratch })))
      expect(result).toEqual({ status: "not-run", reason: "no-follow-unavailable" })
      expect(await readFile(file, "utf8")).toBe("name: Inside\n")
      expect(await readFile(path.join(outside, "ci.yml"), "utf8")).toBe("name: Outside\n")
      expect(await readdir(scratch)).toEqual([])
      await rm(base, { recursive: true, force: true })
      continue
    }
    const result = await Effect.runPromise(Effect.scoped(ReviewActionlintInput.prepare({ root: source, files: [".github/workflows/ci.yml"], scratch }).pipe(
      Effect.provideService(ReviewActionlintInput.BeforeRead, (observed) => Effect.tryPromise({ try: async () => {
        if (replaceAncestor) {
          await rename(workflows, path.join(source, ".github", "workflows.saved"))
          await symlink(outside, workflows)
        } else {
          await rename(file, `${file}.saved`)
          await symlink(path.join(outside, "ci.yml"), file)
        }
      }, catch: () => new Error(`replacement failed at ${observed.file}`) })),
    )))
    expect(result.status).not.toBe("ok")
    if (result.status === "ok") throw new Error("replaced source unexpectedly projected")
    expect(result.reason).toBe("workflow-read-or-path-replaced")
    expect(await readdir(scratch)).toEqual([])
    await rm(base, { recursive: true, force: true })
  }
})

test("cleanup removes partial projection after a settled copy failure", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "actionlint-copy-fail-"))
  const source = path.join(base, "source")
  const scratch = path.join(base, "scratch")
  await mkdir(path.join(source, ".github", "workflows"), { recursive: true })
  await mkdir(scratch)
  await writeFile(path.join(source, ".github", "workflows", "a.yml"), "name: A\n")
  await writeFile(path.join(source, ".github", "workflows", "b.yml"), "name: B\n")
  if (!constants.O_NOFOLLOW) {
    const result = await Effect.runPromise(Effect.scoped(ReviewActionlintInput.prepare({ root: source, files: [".github/workflows/a.yml", ".github/workflows/b.yml"], scratch })))
    expect(result).toEqual({ status: "not-run", reason: "no-follow-unavailable" })
    expect(await readFile(path.join(source, ".github", "workflows", "a.yml"), "utf8")).toBe("name: A\n")
    expect(await readFile(path.join(source, ".github", "workflows", "b.yml"), "utf8")).toBe("name: B\n")
    expect(await readdir(scratch)).toEqual([])
    await rm(base, { recursive: true, force: true })
    return
  }
  let projection = ""
  const effect = Effect.scoped(ReviewActionlintInput.prepare({ root: source, files: [".github/workflows/a.yml", ".github/workflows/b.yml"], scratch }).pipe(Effect.provideService(ReviewActionlintInput.Copied, (input) => Effect.suspend(() => {
    projection = input.root
    return input.index === 0 ? Effect.tryPromise(() => mkdir(path.join(input.root, ".github/workflows/input-1.yaml"))) : Effect.void
  }))))
  const result = await Effect.runPromise(effect)
  expect(result.status).not.toBe("ok")
  expect(projection).not.toBe("")
  await expect(readFile(projection)).rejects.toThrow()
  await rm(base, { recursive: true, force: true })
})

test("cleanup removes the acquired projection when interrupted after the first settled copy", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "actionlint-interrupt-"))
  const source = path.join(base, "source")
  const scratch = path.join(base, "scratch")
  await mkdir(path.join(source, ".github", "workflows"), { recursive: true })
  await mkdir(scratch)
  await writeFile(path.join(source, ".github", "workflows", "a.yml"), "name: A\n")
  await writeFile(path.join(source, ".github", "workflows", "b.yml"), "name: B\n")
  if (!constants.O_NOFOLLOW) {
    const result = await Effect.runPromise(Effect.scoped(ReviewActionlintInput.prepare({ root: source, files: [".github/workflows/a.yml", ".github/workflows/b.yml"], scratch })))
    expect(result).toEqual({ status: "not-run", reason: "no-follow-unavailable" })
    expect(await readFile(path.join(source, ".github", "workflows", "a.yml"), "utf8")).toBe("name: A\n")
    expect(await readFile(path.join(source, ".github", "workflows", "b.yml"), "utf8")).toBe("name: B\n")
    expect(await readdir(scratch)).toEqual([])
    await rm(base, { recursive: true, force: true })
    return
  }
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const copied = yield* Deferred.make<void>()
    const hold = yield* Deferred.make<void>()
    let projection = ""
    const fiber = yield* Effect.scoped(ReviewActionlintInput.prepare({ root: source, files: [".github/workflows/a.yml", ".github/workflows/b.yml"], scratch }).pipe(
      Effect.provideService(ReviewActionlintInput.Copied, (input) => Effect.gen(function* () {
        projection = input.root
        if (input.index === 0) { yield* Deferred.succeed(copied, undefined); yield* Deferred.await(hold) }
      })),
    )).pipe(Effect.forkChild)
    yield* Deferred.await(copied)
    yield* Fiber.interrupt(fiber)
    expect(projection).not.toBe("")
    expect(yield* Effect.promise(() => readFile(projection).then(() => false, () => true))).toBe(true)
  })))
  await rm(base, { recursive: true, force: true })
})
