import { expect, test } from "bun:test"
import { constants } from "node:fs"
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { ReviewOxlintInput } from "../../src/review-toolkit/packs/oxlint-input"

test("projects original source names and prepares only the curated rules", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "oxlint-input-"))
  const root = path.join(base, "source"), scratch = path.join(base, "scratch")
  await Promise.all([mkdir(path.join(root, "nested"), { recursive: true }), mkdir(scratch)])
  await Promise.all([
    writeFile(path.join(root, "nested/space é name.js"), "debugger;\n"),
    writeFile(path.join(root, "nested/b.ts"), "const value: any = 1;\n"),
    writeFile(path.join(root, ".gitignore"), "*\n"),
    writeFile(path.join(root, ".oxlintrc.json"), "{"),
  ])
  let projection = ""
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const prepared = yield* ReviewOxlintInput.prepare({ root, scratch, files: ["nested/b.ts", "nested/space é name.js", "nested/space é name.js"] })
      if (!constants.O_NOFOLLOW) {
        expect(prepared).toEqual({ status: "not-run", reason: "no-follow-unavailable" })
        return
      }
      if (process.platform === "win32") expect(yield* ReviewOxlintInput.prepare({ root, scratch, files: ["nested/space é name.js", "nested/SPACE É NAME.js"] })).toEqual({ status: "not-run", reason: "case-alias-path" })
      expect(prepared.status).toBe("ok")
      if (prepared.status !== "ok") throw new Error(prepared.reason)
      projection = prepared.root
      expect(prepared.paths).toEqual([{ file: "nested/b.ts", path: "nested/b.ts" }, { file: "nested/space é name.js", path: "nested/space é name.js" }])
      expect(prepared.rules).toEqual(["eslint(no-debugger)", "typescript(no-explicit-any)"])
      expect(JSON.parse(yield* Effect.promise(() => readFile(prepared.config, "utf8")))).toEqual({ plugins: ["eslint", "typescript"], rules: { "eslint/no-debugger": "error", "typescript/no-explicit-any": "error" } })
      expect(ReviewOxlintInput.argv(path.resolve("bin/oxlint"), prepared)).toMatchObject({ status: "ok", argv: expect.arrayContaining(["--allow", "all", "--deny", "eslint/no-debugger", "--deny", "typescript/no-explicit-any"]) })
      expect(yield* Effect.promise(() => readFile(prepared.files[1], "utf8"))).toBe("debugger;\n")
    })))
    if (projection) expect(await Bun.file(projection).exists()).toBe(false)
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})
test("refuses source suppression markers without rewriting source", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "oxlint-input-"))
  const root = path.join(base, "source"), scratch = path.join(base, "scratch")
  await Promise.all([mkdir(path.join(root, ".git"), { recursive: true }), mkdir(path.join(root, ".host"), { recursive: true }), mkdir(scratch)])
  const original = '// eslint-disable-next-line -- fixture proves source-marker refusal\ndebugger;\n'
  await writeFile(path.join(root, "a.js"), original)
  await writeFile(path.join(root, ".git/a.js"), "debugger;\n")
  await writeFile(path.join(root, ".host/a.js"), "debugger;\n")
  await writeFile(path.join(root, "%61.js"), "debugger;\n")
  if (process.platform !== "win32") await writeFile(path.join(root, "literal\\slash.js"), "debugger;\n")
  try {
    if (!constants.O_NOFOLLOW) {
      expect(await Effect.runPromise(Effect.scoped(ReviewOxlintInput.prepare({ root, scratch, files: ["a.js"] })))).toEqual({ status: "not-run", reason: "no-follow-unavailable" })
      expect(await readFile(path.join(root, "a.js"), "utf8")).toBe(original)
      expect(await readdir(scratch)).toEqual([])
      return
    }
    for (const input of [{ root: `${root}/../source`, scratch }, { root, scratch: `${scratch}/../scratch` }]) expect(await Effect.runPromise(Effect.scoped(ReviewOxlintInput.prepare({ ...input, files: ["a.js"] })))).toEqual({ status: "not-run", reason: "unsafe-root-or-scratch" })
    for (const file of [".git/a.js", ".host/a.js"]) expect(await Effect.runPromise(Effect.scoped(ReviewOxlintInput.prepare({ root, scratch, files: [file] })))).toEqual({ status: "not-run", reason: "projection-metadata-path-unsupported" })
    const unsafeNames = [["%61.js"], ["%61.js", "a.js"], ...(process.platform === "win32" ? [] : [["literal\\slash.js"]])]
    for (const files of unsafeNames) expect(await Effect.runPromise(Effect.scoped(ReviewOxlintInput.prepare({ root, scratch, files })))).toEqual({ status: "not-run", reason: "native-uri-path-unsupported" })
    expect(await Effect.runPromise(Effect.scoped(ReviewOxlintInput.prepare({ root, scratch, files: ["a.js"] })))).toEqual({ status: "not-run", reason: "inline-directive-marker-unsupported" })
    expect(await readFile(path.join(root, "a.js"), "utf8")).toBe(original)
    expect(await readdir(scratch)).toEqual([])
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})
test("argv validates native paths without restricting literal names and strips color toggles case-insensitively", async () => {
  if (process.platform !== "win32") expect(await Effect.runPromise(Effect.scoped(ReviewOxlintInput.prepare({ root: "C:\\source", scratch: "C:\\scratch", files: ["a.js"] })))).toEqual(constants.O_NOFOLLOW ? { status: "unsupported", reason: "nonnative-root" } : { status: "not-run", reason: "no-follow-unavailable" })
  const root = path.resolve("projection")
  const relative = "nested/space é name.js"
  const posix = {
    status: "ok" as const, root, config: path.join(root, ".host/oxlint.json"), rules: ["eslint(no-debugger)"],
    files: [path.join(root, relative)], paths: [{ file: relative, path: relative }],
  }
  if (process.platform !== "win32") expect(ReviewOxlintInput.argv(path.resolve("bin/oxlint"), posix).status).toBe("ok")
  const windowsRoot = "C:\\projection"
  const windowsRelative = "nested/space é name.js"
  const windows = {
    status: "ok" as const, root: windowsRoot, config: "C:\\projection\\.host\\oxlint.json", rules: ["eslint(no-debugger)"],
    files: ["C:\\projection\\nested\\space é name.js"], paths: [{ file: windowsRelative, path: windowsRelative }],
  }
  expect(ReviewOxlintInput.argv("C:\\bin\\oxlint.exe", windows).status).toBe("ok")
  for (const [executable, prepared] of [["C:\\bin\\oxlint.exe", { ...windows, root: "\\\\?\\C:\\projection" }], ["\\\\?\\C:\\bin\\oxlint.exe", windows]] as const) expect(ReviewOxlintInput.argv(executable, prepared).status).not.toBe("ok")
  expect(ReviewOxlintInput.argv("C:\\bin\\oxlint.exe", { ...windows, files: [...windows.files, "C:\\projection\\nested\\SPACE é NAME.js"], paths: [...windows.paths, { file: "nested/SPACE é NAME.js", path: "nested/SPACE é NAME.js" }] }).status).not.toBe("ok")
  expect(ReviewOxlintInput.argv("C:\\bin\\oxlint.exe", { ...windows, files: ["C:\\projection\\nested\\%61.js", "C:\\projection\\nested\\a.js"], paths: [{ file: "nested/%61.js", path: "nested/%61.js" }, { file: "nested/a.js", path: "nested/a.js" }] })).toEqual({ status: "not-run", reason: "native-uri-path-unsupported" })
  for (const [file, mapping] of [["nested/CON.js", "C:\\projection\\nested\\CON.js"], ["nested/file:stream.js", "C:\\projection\\nested\\file:stream.js"], [".GIT/a.js", "C:\\projection\\.GIT\\a.js"]]) expect(ReviewOxlintInput.argv("C:\\bin\\oxlint.exe", { ...windows, files: [mapping], paths: [{ file, path: file }] }).status).not.toBe("ok")
  if (process.platform !== "win32") {
    expect(ReviewOxlintInput.argv(path.resolve("bin/oxlint"), { ...posix, files: [path.join(root, "nested/a\\b.js")], paths: [{ file: "nested/a\\b.js", path: "nested/a\\b.js" }] })).toEqual({ status: "not-run", reason: "native-uri-path-unsupported" })
    for (const forged of [{ ...posix, root: `${root}/./` }, { ...posix, files: [`${root}/nested//space é name.js`] }]) expect(ReviewOxlintInput.argv(path.resolve("bin/oxlint"), forged).status).not.toBe("ok")
  }
  expect(ReviewOxlintInput.argv(path.resolve("bin/oxlint"), { ...posix, files: [path.join(root, ".git/a.js")], paths: [{ file: ".git/a.js", path: ".git/a.js" }] }).status).not.toBe("ok")
  const env = ReviewOxlintInput.environment(root, { Force_Color: "1", cLiCoLoR_fOrCe: "1", hOmE: "outside", xDG_CONFIG_HOME: "outside", PATH: "/bin" })
  for (const key of ["Force_Color", "cLiCoLoR_fOrCe", "hOmE", "xDG_CONFIG_HOME"]) expect(Object.hasOwn(env, key)).toBe(false)
  expect(env.HOME).toBe(root)
})
