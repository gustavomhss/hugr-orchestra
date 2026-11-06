import { expect, test } from "bun:test"
import { constants } from "node:fs"
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Deferred, Effect, Exit, Fiber } from "effect"
import { ReviewOxlintInput } from "../../src/review-toolkit/packs/oxlint-input"
import { ReviewZizmorInput } from "../../src/review-toolkit/packs/zizmor-input"

const workflow = ".github/workflows/original.yml"
const javascript = "nested/original.js"
const typescript = "nested/original.ts"
const workflowText = "name: Test\non: push\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@main\n"

async function fixture() {
  const base = await mkdtemp(path.join(os.tmpdir(), "native-input-acceptance-"))
  const root = path.join(base, "source")
  const scratch = path.join(base, "scratch")
  await mkdir(path.join(root, ".github/workflows"), { recursive: true })
  await mkdir(path.join(root, "nested"))
  await mkdir(path.join(root, ".git"))
  await mkdir(path.join(root, ".host"))
  await mkdir(scratch)
  await writeFile(path.join(root, workflow), workflowText)
  await writeFile(path.join(root, javascript), "debugger;\n")
  await writeFile(path.join(root, typescript), "const value: any = 1;\n")
  await writeFile(path.join(root, ".oxlintrc.json"), "{")
  await writeFile(path.join(root, "nested/.oxlintrc.json"), "{")
  await writeFile(path.join(root, "zizmor.yaml"), "[")
  await writeFile(path.join(root, ".gitignore"), "*\n")
  await writeFile(path.join(root, "package-lock.json"), "{}")
  await writeFile(path.join(root, "plugin.js"), "throw new Error('must not execute')")
  await writeFile(path.join(root, ".git/a.js"), "debugger;\n")
  await writeFile(path.join(root, ".host/a.js"), "debugger;\n")
  await chmod(path.join(root, javascript), 0o640)
  return { base, root, scratch }
}

test("I1 zizmor projects selected bytes and source names, not repository metadata", async () => {
  const f = await fixture()
  await using cleanup = { [Symbol.asyncDispose]: () => rm(f.base, { recursive: true, force: true }) }
  const mode = (await lstat(path.join(f.root, workflow))).mode & 0o777
  let projection = ""
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const prepared = yield* ReviewZizmorInput.prepare({ ...f, files: [workflow, workflow] })
    if (!constants.O_NOFOLLOW) {
      expect(prepared).toEqual({ status: "not-run", reason: "no-follow-unavailable" })
      return
    }
    expect(prepared.status).toBe("ok")
    if (prepared.status !== "ok") throw new Error(prepared.reason)
    projection = prepared.root
    expect(path.dirname(prepared.root)).toBe(f.scratch)
    expect(prepared.paths).toEqual([{ file: workflow, path: workflow }])
    expect(prepared.files).toEqual([path.join(prepared.root, workflow)])
    expect(yield* Effect.promise(() => readFile(prepared.files[0], "utf8"))).toBe(workflowText)
    expect((yield* Effect.promise(() => lstat(prepared.files[0]))).mode & 0o777).toBe(mode)
    expect((yield* Effect.promise(() => lstat(path.join(prepared.root, ".git")))).isDirectory()).toBe(true)
    expect(yield* Effect.promise(() => Bun.file(path.join(prepared.root, "zizmor.yaml")).exists())).toBe(false)
    expect(yield* Effect.promise(() => Bun.file(path.join(prepared.root, ".gitignore")).exists())).toBe(false)
    expect((yield* Effect.promise(() => readdir(prepared.root))).sort()).toEqual([".git", ".github"])
    const built = ReviewZizmorInput.argv("/bin/zizmor", prepared)
    expect(built.status).toBe("ok")
    if (built.status !== "ok") throw new Error(built.reason)
    expect(built.argv).toEqual(["/bin/zizmor", "--offline", "--no-config", "--no-ignores", "--collect", "workflows", "--persona", "auditor", "--min-severity", "informational", "--min-confidence", "low", "--format", "sarif", "--", ...prepared.files])
  })))
  if (projection) expect(await Bun.file(projection).exists()).toBe(false)
  expect(await readFile(path.join(f.root, workflow), "utf8")).toBe(workflowText)
  expect(await readFile(path.join(f.root, "zizmor.yaml"), "utf8")).toBe("[")
  expect(await readdir(f.scratch)).toEqual([])
})

test("I2 oxlint projects JS and TS with an exact host rule selection", async () => {
  const f = await fixture()
  await using cleanup = { [Symbol.asyncDispose]: () => rm(f.base, { recursive: true, force: true }) }
  let projection = ""
  const mode = (await lstat(path.join(f.root, javascript))).mode
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const prepared = yield* ReviewOxlintInput.prepare({ ...f, files: [typescript, javascript, javascript], excluded: ["typescript(no-explicit-any)"] })
    if (!constants.O_NOFOLLOW) {
      expect(prepared).toEqual({ status: "not-run", reason: "no-follow-unavailable" })
      return
    }
    expect(prepared.status).toBe("ok")
    if (prepared.status !== "ok") throw new Error(prepared.reason)
    projection = prepared.root
    expect(path.dirname(prepared.root)).toBe(f.scratch)
    expect(prepared.paths).toEqual([{ file: javascript, path: javascript }, { file: typescript, path: typescript }])
    expect(prepared.rules).toEqual(["eslint(no-debugger)"])
    expect(yield* Effect.promise(() => readFile(prepared.files[0], "utf8"))).toBe("debugger;\n")
    expect((yield* Effect.promise(() => lstat(prepared.files[0]))).mode & 0o777).toBe(mode & 0o777)
    expect(yield* Effect.promise(() => readFile(prepared.files[1], "utf8"))).toBe("const value: any = 1;\n")
    expect(prepared.config).toBe(path.join(prepared.root, ".host/oxlint.json"))
    expect(JSON.parse(yield* Effect.promise(() => readFile(prepared.config, "utf8")))).toEqual({ plugins: ["eslint", "typescript"], rules: { "eslint/no-debugger": "error" } })
    expect(yield* Effect.promise(() => Bun.file(path.join(prepared.root, ".oxlintrc.json")).exists())).toBe(false)
    expect(yield* Effect.promise(() => Bun.file(path.join(prepared.root, "nested/.oxlintrc.json")).exists())).toBe(false)
    expect(yield* Effect.promise(() => Bun.file(path.join(prepared.root, ".gitignore")).exists())).toBe(false)
    expect((yield* Effect.promise(() => readdir(prepared.root))).sort()).toEqual([".git", ".host", "nested"])
    expect((yield* Effect.promise(() => readdir(path.join(prepared.root, "nested")))).sort()).toEqual(["original.js", "original.ts"])
    expect((yield* Effect.promise(() => lstat(path.join(prepared.root, ".git")))).isDirectory()).toBe(true)
    const built = ReviewOxlintInput.argv("/bin/oxlint", prepared)
    expect(built.status).toBe("ok")
    if (built.status !== "ok") throw new Error(built.reason)
    expect(built.argv).toEqual(["/bin/oxlint", "--config", prepared.config, "--disable-nested-config", "--no-ignore", "--allow", "all", "--deny", "eslint/no-debugger", "--format", "sarif", "--", ...prepared.files])
  })))
  if (projection) expect(await Bun.file(projection).exists()).toBe(false)
  expect(await readFile(path.join(f.root, javascript), "utf8")).toBe("debugger;\n")
  expect(await readFile(path.join(f.root, "nested/.oxlintrc.json"), "utf8")).toBe("{")
  expect((await lstat(path.join(f.root, javascript))).mode).toBe(mode)
  expect(await readdir(f.scratch)).toEqual([])
})

test("I3 both engines refuse unsafe inputs, unsupported selection and suppression markers", async () => {
  const f = await fixture()
  await using cleanup = { [Symbol.asyncDispose]: () => rm(f.base, { recursive: true, force: true }) }
  for (const engine of [{ prepare: ReviewZizmorInput.prepare, file: workflow }, { prepare: ReviewOxlintInput.prepare, file: javascript }]) {
    for (const files of [[], ["../outside.js"], ["nested/../nested/original.js"], ["bad\0.js"], ["nested/missing.js"], ["zizmor.yaml"], ...(engine.file === workflow ? [[javascript]] : []), Array.from({ length: 10_001 }, () => engine.file)]) {
      const prepared = await Effect.runPromise(Effect.scoped(engine.prepare({ ...f, files })))
      expect(prepared.status).not.toBe("ok")
    }
    for (const scratch of [f.root, f.base]) {
      const prepared = await Effect.runPromise(Effect.scoped(engine.prepare({ ...f, files: [engine.file], scratch })))
      expect(prepared.status).not.toBe("ok")
    }
  }
  const excluded = await Effect.runPromise(Effect.scoped(ReviewZizmorInput.prepare({ ...f, files: [workflow], excluded: ["zizmor/artipacked"] })))
  expect(excluded).toEqual({ status: "not-run", reason: "native-rule-selection-unsupported" })
  for (const excluded of [["unknown"], ["eslint(no-debugger)", "typescript(no-explicit-any)"]]) {
    expect((await Effect.runPromise(Effect.scoped(ReviewOxlintInput.prepare({ ...f, files: [javascript], excluded })))).status).not.toBe("ok")
  }
  for (const file of [".git/a.js", ".host/a.js"]) {
    expect((await Effect.runPromise(Effect.scoped(ReviewOxlintInput.prepare({ ...f, files: [file] })))).status).not.toBe("ok")
  }
  for (const text of ["// oxlint-disable\ndebugger;\n", "// eslint-disable-next-line -- fixture proves marker refusal\ndebugger;\n", "/* oxlint-enable */\ndebugger;\n", 'const text = "oxlint-disable";\n', 'const text = "eslint-arbitrary";\n', 'const text = "oxlint-arbitrary";\n']) {
    await writeFile(path.join(f.root, javascript), text)
    const prepared = await Effect.runPromise(Effect.scoped(ReviewOxlintInput.prepare({ ...f, files: [javascript] })))
    expect(prepared).toEqual({ status: "not-run", reason: constants.O_NOFOLLOW ? "inline-directive-marker-unsupported" : "no-follow-unavailable" })
    expect(await readFile(path.join(f.root, javascript), "utf8")).toBe(text)
  }
  for (const file of [workflow, javascript]) {
    await writeFile(path.join(f.root, file), Buffer.from([255]))
    const engine = file === workflow ? ReviewZizmorInput : ReviewOxlintInput
    expect((await Effect.runPromise(Effect.scoped(engine.prepare({ ...f, files: [file] })))).status).not.toBe("ok")
    await writeFile(path.join(f.root, file), "x".repeat(4 * 1024 * 1024 + 1))
    expect((await Effect.runPromise(Effect.scoped(engine.prepare({ ...f, files: [file] })))).status).not.toBe("ok")
  }
  expect(await readdir(f.scratch)).toEqual([])
})

test("I4 identity-safe reads refuse replaced leaves and retain original bytes", async () => {
  const f = await fixture()
  await using cleanup = { [Symbol.asyncDispose]: () => rm(f.base, { recursive: true, force: true }) }
  if (!constants.O_NOFOLLOW) {
    expect((await Effect.runPromise(Effect.scoped(ReviewOxlintInput.prepare({ ...f, files: [javascript] }))))).toEqual({ status: "not-run", reason: "no-follow-unavailable" })
    return
  }
  for (const engine of [ReviewZizmorInput, ReviewOxlintInput]) {
    const file = engine === ReviewZizmorInput ? workflow : javascript
    const replaced = path.join(f.root, file)
    const original = `${replaced}.original`
    const bytes = await readFile(replaced)
    const prepared = await Effect.runPromise(Effect.scoped(engine.prepare({ ...f, files: [file] }).pipe(
      Effect.provideService(engine.BeforeRead, () => Effect.promise(async () => {
        await rename(replaced, original)
        await symlink(original, replaced)
      })),
    )))
    expect(prepared.status).not.toBe("ok")
    expect(await readFile(original)).toEqual(bytes)
    expect(await readdir(f.scratch)).toEqual([])
  }
})

test("I5 argv validation rejects forged projections and tool environments cannot steer scans", () => {
  const root = path.resolve("native-projection")
  const executable = path.resolve("bin/native-scanner")
  const projected = { status: "ok" as const, root, files: [path.join(root, workflow)], paths: [{ file: workflow, path: workflow }] }
  const oxlint = { ...projected, files: [path.join(root, javascript)], paths: [{ file: javascript, path: javascript }], config: path.join(root, ".host/oxlint.json"), rules: ["eslint(no-debugger)"] }
  expect(ReviewZizmorInput.argv(executable, projected).status).toBe("ok")
  expect(ReviewOxlintInput.argv(executable, oxlint).status).toBe("ok")
  for (const engine of [ReviewZizmorInput, ReviewOxlintInput]) {
    const prepared = engine === ReviewZizmorInput ? { ...projected, config: oxlint.config, rules: oxlint.rules } : oxlint
    for (const executable of ["relative/tool", "/bin/tool\0bad"]) expect(engine.argv(executable, prepared).status).not.toBe("ok")
    for (const changed of [
      { ...prepared, files: [] }, { ...prepared, paths: [] },
      { ...prepared, paths: [{ ...prepared.paths[0], path: "../escape.js" }] },
      { ...prepared, root: "relative/root" }, { ...prepared, root: "\\\\?\\C:\\projection" },
      { ...prepared, files: [path.resolve("outside.js")] },
      { ...prepared, files: [...prepared.files, ...prepared.files], paths: [...prepared.paths, ...prepared.paths] },
      { ...prepared, paths: [{ ...prepared.paths[0], file: "different.js" }] },
      { ...prepared, files: [path.join(root, "wrong.txt")], paths: [{ file: "wrong.txt", path: "wrong.txt" }] },
    ]) {
      expect(engine.argv(executable, changed).status).not.toBe("ok")
    }
    const relative = (index: number) => engine === ReviewZizmorInput ? `.github/workflows/input-${index}.yml` : `nested/input-${index}.js`
    const many = Array.from({ length: 10_001 }, (_, index) => relative(index))
    expect(engine.argv(executable, { ...prepared, files: many.map((file) => path.join(root, file)), paths: many.map((file) => ({ file, path: file })) }).status).not.toBe("ok")
    const large = engine === ReviewZizmorInput ? `.github/workflows/${"x".repeat(4 * 1024 * 1024)}.yml` : `nested/${"x".repeat(4 * 1024 * 1024)}.js`
    expect(engine.argv(executable, { ...prepared, files: [path.join(root, large)], paths: [{ file: large, path: large }] })).toEqual({ status: "not-run", reason: "argv-bound" })
    const denied = ["GH_TOKEN", "GITHUB_TOKEN", "GH_HOST", "ZIZMOR_GITHUB_TOKEN", "ZIZMOR_CONFIG", "ZIZMOR_RENDER_LINKS", "OXLINT_CONFIG", "ESLINT_CONFIG", "NODE_OPTIONS", "RUST_BACKTRACE", "FORCE_COLOR", "CLICOLOR_FORCE"]
    const aliases = ["home", "userprofile", "tmpdir", "tmp", "temp", "xdg_config_home", "xdg_cache_home", "force_color", "clicolor_force"]
    const env = engine.environment(root, { ...Object.fromEntries([...denied, ...aliases].map((key) => [key, "steering"])), PATH: "/bin", SystemRoot: "keep", ZIZMOR_OFFLINE: "false", RUST_LOG: "off", HOME: "outside", USERPROFILE: "outside", XDG_CONFIG_HOME: "outside", XDG_CACHE_HOME: "outside", TMPDIR: "outside", TMP: "outside", TEMP: "outside" })
    expect(env).toMatchObject({ PATH: "/bin", SystemRoot: "keep", HOME: root, USERPROFILE: root, XDG_CONFIG_HOME: path.join(root, ".config"), XDG_CACHE_HOME: path.join(root, ".cache"), TMPDIR: root, TMP: root, TEMP: root, NO_COLOR: "1" })
    for (const key of [...denied, ...aliases]) expect(Object.hasOwn(env, key)).toBe(false)
    expect(env.RUST_LOG === undefined || env.RUST_LOG === "info").toBe(true)
    expect(env.ZIZMOR_OFFLINE === undefined || env.ZIZMOR_OFFLINE === "true").toBe(true)
    expect(engine.argv(executable, { ...prepared, paths: [{ ...prepared.paths[0], file: "../escape.js" }] }).status).not.toBe("ok")
  }
  expect(ReviewOxlintInput.argv(executable, { ...oxlint, config: "/outside/config.json" }).status).not.toBe("ok")
  expect(ReviewOxlintInput.argv(executable, { ...oxlint, rules: ["unknown"] }).status).not.toBe("ok")
})

test("I6 both readers enforce physical containment and explicit no-follow refusal", async () => {
  const f = await fixture()
  await using cleanup = { [Symbol.asyncDispose]: () => rm(f.base, { recursive: true, force: true }) }
  for (const engine of [ReviewZizmorInput, ReviewOxlintInput]) {
    const file = engine === ReviewZizmorInput ? workflow : javascript
    for (const root of ["\\\\?\\C:\\projection", "\\\\.\\C:\\projection"]) {
      expect((await Effect.runPromise(Effect.scoped(engine.prepare({ ...f, root, files: [file] })))).status).not.toBe("ok")
    }
    expect(await Effect.runPromise(Effect.scoped(engine.prepare({ ...f, files: [file] }).pipe(Effect.provideService(engine.NoFollow, false))))).toEqual({ status: "not-run", reason: "no-follow-unavailable" })
    if (!constants.O_NOFOLLOW) continue
    for (const scenario of ["leaf-link", "parent-link", "directory", "leaf-replaced", "parent-replaced"]) {
      const isolated = await fixture()
      await using cleanup = { [Symbol.asyncDispose]: () => rm(isolated.base, { recursive: true, force: true }) }
      const selected = path.join(isolated.root, file)
      const mode = (await lstat(selected)).mode
      const bytes = await readFile(selected)
      const replace = async () => {
        if (scenario === "parent-replaced" || scenario === "parent-link") {
          const parent = path.dirname(selected)
          await rename(parent, `${parent}.old`)
          if (scenario === "parent-link") return symlink(`${parent}.old`, parent)
          await mkdir(parent)
          await writeFile(selected, bytes)
          return
        }
        await rename(selected, `${selected}.old`)
        if (scenario === "leaf-link") return symlink(`${selected}.old`, selected)
        if (scenario === "directory") return mkdir(selected)
        await writeFile(selected, bytes)
      }
      if (!scenario.endsWith("replaced")) await replace()
      const result = await Effect.runPromise(Effect.scoped(engine.prepare({ ...isolated, files: [file] }).pipe(
        Effect.provideService(engine.BeforeRead, () => scenario.endsWith("replaced") ? Effect.promise(replace) : Effect.void),
      )))
      expect(result.status).not.toBe("ok")
      const original = scenario.startsWith("parent") ? path.join(`${path.dirname(selected)}.old`, path.basename(file)) : `${selected}.old`
      expect(await readFile(original)).toEqual(bytes)
      expect((await lstat(original)).mode).toBe(mode)
      expect(await readdir(isolated.scratch)).toEqual([])
    }
    const selected = path.join(f.root, file)
    await rename(selected, `${selected}.socket-original`)
    const socket = Bun.listen({ unix: selected, socket: { data() {} } })
    try {
      expect((await Effect.runPromise(Effect.scoped(engine.prepare({ ...f, files: [file] }))))).toMatchObject({ status: "not-run", reason: "not-file" })
    } finally {
      socket.stop(true)
    }
  }
})

test("I7 aggregate byte bounds and default or excluded oxlint rules have positive controls", async () => {
  const f = await fixture()
  await using cleanup = { [Symbol.asyncDispose]: () => rm(f.base, { recursive: true, force: true }) }
  for (const engine of [ReviewZizmorInput, ReviewOxlintInput]) {
    const files = engine === ReviewZizmorInput ? [workflow, ".github/workflows/second.yaml"] : [javascript, typescript]
    for (const file of files) await writeFile(path.join(f.root, file), " ".repeat(2 * 1024 * 1024))
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const prepared = yield* engine.prepare({ ...f, files })
      expect(prepared.status).toBe(constants.O_NOFOLLOW ? "ok" : "not-run")
    })))
    await writeFile(path.join(f.root, files[1]), " ".repeat(2 * 1024 * 1024 + 1))
    expect((await Effect.runPromise(Effect.scoped(engine.prepare({ ...f, files })))).status).not.toBe("ok")
  }
  await writeFile(path.join(f.root, javascript), "debugger;\n")
  for (const excluded of [[], ["eslint(no-debugger)"], ["typescript(no-explicit-any)"]]) {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const prepared = yield* ReviewOxlintInput.prepare({ ...f, files: [javascript], excluded })
      if (!constants.O_NOFOLLOW) {
        expect(prepared).toEqual({ status: "not-run", reason: "no-follow-unavailable" })
        return
      }
      expect(prepared.status).toBe("ok")
      if (prepared.status !== "ok") throw new Error(prepared.reason)
      expect(prepared.rules).toEqual(["eslint(no-debugger)", "typescript(no-explicit-any)"].filter((rule) => !excluded.includes(rule)))
      const ruleNames = prepared.rules.map((rule) => rule === "eslint(no-debugger)" ? "eslint/no-debugger" : "typescript/no-explicit-any")
      expect(JSON.parse(yield* Effect.promise(() => readFile(prepared.config, "utf8")))).toEqual({ plugins: ["eslint", "typescript"], rules: Object.fromEntries(ruleNames.map((rule) => [rule, "error"])) })
      expect(ReviewOxlintInput.argv(path.resolve("bin/oxlint"), prepared)).toEqual({ status: "ok", argv: [path.resolve("bin/oxlint"), "--config", prepared.config, "--disable-nested-config", "--no-ignore", "--allow", "all", ...ruleNames.flatMap((rule) => ["--deny", rule]), "--format", "sarif", "--", ...prepared.files] })
    })))
  }
  expect(await readdir(f.scratch)).toEqual([])
})

test("I8 projections are released after failure and interruption during copying", async () => {
  const f = await fixture()
  await using cleanup = { [Symbol.asyncDispose]: () => rm(f.base, { recursive: true, force: true }) }
  for (const engine of [ReviewZizmorInput, ReviewOxlintInput]) {
    const file = engine === ReviewZizmorInput ? workflow : javascript
    if (!constants.O_NOFOLLOW) {
      expect(await Effect.runPromise(Effect.scoped(engine.prepare({ ...f, files: [file] })))).toEqual({ status: "not-run", reason: "no-follow-unavailable" })
      continue
    }
    const failed = await Effect.runPromiseExit(Effect.scoped(engine.prepare({ ...f, files: [file] }).pipe(
      Effect.provideService(engine.Copied, () => Effect.die(new Error("copy observer failure"))),
    )))
    expect(Exit.isFailure(failed)).toBe(true)
    expect(await readdir(f.scratch)).toEqual([])
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const copied = yield* Deferred.make<void>()
      const fiber = yield* engine.prepare({ ...f, files: [file] }).pipe(
        Effect.provideService(engine.Copied, () => Deferred.succeed(copied, undefined).pipe(Effect.andThen(Effect.never))),
        Effect.scoped,
        Effect.forkScoped,
      )
      yield* Deferred.await(copied)
      yield* Fiber.interrupt(fiber)
    })))
    expect(await readdir(f.scratch)).toEqual([])
  }
})

test("I9 file-count boundary accepts ten thousand distinct files and rejects one more", async () => {
  const f = await fixture()
  await using cleanup = { [Symbol.asyncDispose]: () => rm(f.base, { recursive: true, force: true }) }
  for (const engine of [ReviewZizmorInput, ReviewOxlintInput]) {
    const files = Array.from({ length: 10_000 }, (_, index) => engine === ReviewZizmorInput ? `.github/workflows/count-${index}.yml` : `nested/count-${index}.js`)
    if (constants.O_NOFOLLOW) {
      for (let index = 0; index < files.length; index += 64) {
        await Promise.all(files.slice(index, index + 64).map((file) => writeFile(path.join(f.root, file), "")))
      }
    }
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const prepared = yield* engine.prepare({ ...f, files })
      if (!constants.O_NOFOLLOW) {
        expect(prepared).toEqual({ status: "not-run", reason: "no-follow-unavailable" })
        return
      }
      expect(prepared.status).toBe("ok")
      if (prepared.status !== "ok") throw new Error(prepared.reason)
      expect(prepared.files).toHaveLength(10_000)
      expect(prepared.paths).toHaveLength(10_000)
    })))
    const extra = engine === ReviewZizmorInput ? ".github/workflows/extra.yml" : "nested/extra.js"
    // Count admission precedes capability refusal; valid-count inputs reach the explicit no-follow check.
    expect(await Effect.runPromise(Effect.scoped(engine.prepare({ ...f, files: [...files, extra] })))).toEqual({ status: "not-run", reason: "too-many-inputs" })
    expect(await readdir(f.scratch)).toEqual([])
  }
}, 180_000)

test("I10 native emitter URI aliases are refused before scanning without rewriting filenames", async () => {
  const f = await fixture()
  await using cleanup = { [Symbol.asyncDispose]: () => rm(f.base, { recursive: true, force: true }) }
  for (const engine of [ReviewZizmorInput, ReviewOxlintInput]) {
    const file = engine === ReviewZizmorInput ? workflow : javascript
    const positive = engine === ReviewZizmorInput ? ".github/workflows/space é.yml" : "nested/space é.js"
    await writeFile(path.join(f.root, positive), "valid input bytes\n")
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const prepared = yield* engine.prepare({ ...f, files: [positive] })
      expect(prepared.status).toBe(constants.O_NOFOLLOW ? "ok" : "not-run")
    })))
    for (const unsafe of [file.replace("original", "%6Friginal"), file.replace("original", "hash#name"), file.replace("original", "query?name"), ...(engine === ReviewOxlintInput && path.sep === "/" ? ["nested/literal\\name.js"] : [])]) {
      if (path.sep === "\\" && unsafe.includes("?")) continue
      const bytes = "unmodified unsafe-path bytes\n"
      await writeFile(path.join(f.root, unsafe), bytes)
      const prepared = await Effect.runPromise(Effect.scoped(engine.prepare({ ...f, files: [file, unsafe] })))
      expect(prepared.status).not.toBe("ok")
      expect(prepared).toMatchObject({ reason: constants.O_NOFOLLOW ? "native-uri-path-unsupported" : "no-follow-unavailable" })
      expect(await readFile(path.join(f.root, unsafe), "utf8")).toBe(bytes)
    }
  }
  expect(await readdir(f.scratch)).toEqual([])
})

test("I11 pure Windows argv maps reject case and device aliases without changing valid paths", () => {
  const api = path.win32
  for (const engine of [ReviewZizmorInput, ReviewOxlintInput]) {
    const root = "C:\\projection"
    const relative = engine === ReviewZizmorInput ? ".github/workflows/A.yml" : "nested/A.js"
    const prepared = { status: "ok" as const, root, files: [api.join(root, relative)], paths: [{ file: relative, path: relative }], config: api.join(root, ".host/oxlint.json"), rules: ["eslint(no-debugger)"] }
    expect(engine.argv("C:\\tools\\native.exe", prepared).status).toBe("ok")
    const alias = relative.replace("A.", "a.")
    expect(engine.argv("C:\\tools\\native.exe", { ...prepared, files: [...prepared.files, api.join(root, alias)], paths: [...prepared.paths, { file: alias, path: alias }] }).status).not.toBe("ok")
    const device = relative.replace("A.", "CON.")
    expect(engine.argv("C:\\tools\\native.exe", { ...prepared, files: [api.join(root, device)], paths: [{ file: device, path: device }] }).status).not.toBe("ok")
    const deviceRoot = "\\\\?\\C:\\projection"
    expect(engine.argv("C:\\tools\\native.exe", { ...prepared, root: deviceRoot, files: [api.join(deviceRoot, relative)], config: api.join(deviceRoot, ".host/oxlint.json") }).status).not.toBe("ok")
  }
})
