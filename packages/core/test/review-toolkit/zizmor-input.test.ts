import { expect, test } from "bun:test"
import { constants } from "node:fs"
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { ReviewZizmorInput } from "../../src/review-toolkit/packs/zizmor-input"

test("projects selected workflow bytes/name, denies config and cleans its owned scope", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "zizmor-input-")), root = path.join(base, "source"), scratch = path.join(base, "scratch")
  await mkdir(path.join(root, ".github/workflows"), { recursive: true }); await mkdir(scratch)
  const file = ".github/workflows/original.yaml", bytes = "name: sample\n"
  await writeFile(path.join(root, file), bytes); await writeFile(path.join(root, "zizmor.yaml"), "invalid")
  await chmod(path.join(root, file), 0o640)
  let projection = ""
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const result = yield* ReviewZizmorInput.prepare({ root, scratch, files: [file, file] })
      if (!constants.O_NOFOLLOW) { expect(result).toEqual({ status: "not-run", reason: "no-follow-unavailable" }); return }
      expect(result.status).toBe("ok"); if (result.status !== "ok") return
      projection = result.root
      expect(result.paths).toEqual([{ file, path: file }]); expect(path.basename(result.files[0])).toBe("original.yaml")
      expect(yield* Effect.promise(() => readFile(result.files[0], "utf8"))).toBe(bytes)
      expect((yield* Effect.promise(() => lstat(result.files[0]))).mode & 0o777).toBe(0o640)
      const entries = yield* Effect.promise(() => readdir(result.root))
      expect([...entries].sort()).toEqual([".git", ".github"])
      expect(ReviewZizmorInput.argv("/bin/zizmor", result)).toMatchObject({ status: "ok", argv: ["/bin/zizmor", "--offline", "--no-config", "--no-ignores", "--collect", "workflows", "--persona", "auditor", "--min-severity", "informational", "--min-confidence", "low", "--format", "sarif", "--", result.files[0]] })
    })))
    expect(await ReviewZizmorInput.prepare({ root, scratch, files: [file], excluded: ["zizmor/artipacked"] }).pipe(Effect.scoped, Effect.runPromise)).toEqual({ status: "not-run", reason: "native-rule-selection-unsupported" })
    const sanitized = ReviewZizmorInput.environment(root, {
      GH_TOKEN: "secret", ZIZMOR_CONFIG: "outside", NODE_OPTIONS: "evil", PATH: "/bin",
      home: "outside", userprofile: "outside", tmpdir: "outside", tmp: "outside", temp: "outside",
      xdg_config_home: "outside", xdg_cache_home: "outside",
    })
    expect(sanitized).toMatchObject({ HOME: root, NO_COLOR: "1", PATH: "/bin" })
    for (const key of ["home", "userprofile", "tmpdir", "tmp", "temp", "xdg_config_home", "xdg_cache_home", "GH_TOKEN"]) expect(Object.hasOwn(sanitized, key)).toBe(false)
  } finally {
    if (projection) expect(await Bun.file(projection).exists()).toBe(false)
    expect(await readFile(path.join(root, file), "utf8")).toBe(bytes)
    await rm(base, { recursive: true, force: true })
  }
})

test("rejects empty, oversized, escaped, excluded, and forged inputs", async () => {
  expect(await Effect.runPromise(Effect.scoped(ReviewZizmorInput.prepare({ root: "/missing", scratch: "/missing", files: [] })))).toEqual({ status: "not-run", reason: "no-input" })
  expect(await Effect.runPromise(Effect.scoped(ReviewZizmorInput.prepare({ root: "/missing", scratch: "/missing", files: Array.from({ length: 10001 }, () => "x") })))).toEqual({ status: "not-run", reason: "too-many-inputs" })
  const prepared = { status: "ok" as const, root: "/tmp/project", files: ["/tmp/project/.github/workflows/x.yml"], paths: [{ file: ".github/workflows/x.yml", path: ".github/workflows/x.yml" }] }
  expect(ReviewZizmorInput.argv("/bin/zizmor", { ...prepared, paths: [{ ...prepared.paths[0], path: "../outside.yml" }] })).toEqual({ status: "not-run", reason: "invalid-projection" })
  expect(ReviewZizmorInput.argv("/bin/zizmor", { ...prepared, files: ["/tmp/project/.github/workflows/\0.yml"] })).toEqual({ status: "not-run", reason: "argv-bound" })
})

test.skipIf(process.platform === "win32")("validates raw roots and preserves spaces, Unicode, and literal POSIX backslashes", async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), "zizmor-literal-"))
  const root = path.join(base, "source"), scratch = path.join(base, "scratch"), name = ".github/workflows/a space-é\\b.yml"
  await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await mkdir(scratch); await writeFile(path.join(root, name), "name: literal\n")
  try {
    expect((await Effect.runPromise(Effect.scoped(ReviewZizmorInput.prepare({ root: `${root}/../source`, scratch, files: [name] })))).status).not.toBe("ok")
    expect((await Effect.runPromise(Effect.scoped(ReviewZizmorInput.prepare({ root, scratch, files: [".github/workflows/./entry.yml"] })))).status).not.toBe("ok")
    const result = await Effect.runPromise(Effect.scoped(ReviewZizmorInput.prepare({ root, scratch, files: [name] })))
    if (!constants.O_NOFOLLOW) expect(result).toMatchObject({ status: "not-run", reason: "no-follow-unavailable" })
    else {
      expect(result).toMatchObject({ status: "ok", paths: [{ file: name, path: name }] })
      if (result.status === "ok") expect(path.basename(result.files[0])).toBe("a space-é\\b.yml")
    }
    const encoded = ".github/workflows/%78.yml", decoded = ".github/workflows/x.yml"
    await writeFile(path.join(root, encoded), "name: encoded\n")
    await writeFile(path.join(root, decoded), "name: decoded\n")
    expect(await Effect.runPromise(Effect.scoped(ReviewZizmorInput.prepare({ root, scratch, files: [encoded, decoded] })))).toEqual({ status: "unsupported", reason: "native-uri-path-unsupported" })
  } finally { await rm(base, { recursive: true, force: true }) }
})

test("Windows argv accepts canonical paths and rejects case-aliased duplicates", () => {
  const root = "C:\\projection", relative = ".github/workflows/entry.yml"
  const first = path.win32.join(root, ...relative.split("/"))
  const prepared = { status: "ok" as const, root, files: [first], paths: [{ file: relative, path: relative }] }
  expect(ReviewZizmorInput.argv("C:\\bin\\zizmor.exe", prepared).status).toBe("ok")
  const duplicate = { ...prepared, files: [first, path.win32.join(root, ".github\\workflows\\ENTRY.yml")], paths: [prepared.paths[0], { file: ".github/workflows/ENTRY.yml", path: ".github/workflows/ENTRY.yml" }] }
  expect(ReviewZizmorInput.argv("C:\\bin\\zizmor.exe", duplicate)).toEqual({ status: "not-run", reason: "invalid-projection" })
  for (const invalid of ["\\\\?\\C:\\projection", "\\\\.\\C:\\projection", "C:\\projection\\..\\source", "C:\\projection\\.\\entry"]) {
    expect(ReviewZizmorInput.argv("C:\\bin\\zizmor.exe", { ...prepared, root: invalid }).status).not.toBe("ok")
  }
  expect(ReviewZizmorInput.argv("C:\\bin\\zizmor.exe", { ...prepared, files: ["C:\\projection\\.github\\workflows\\.\\entry.yml"] })).toEqual({ status: "not-run", reason: "invalid-projection" })
  for (const name of ["CON.yml", "PRN.log.yml", "AUX.yaml", "NUL.yml", "COM1.yml", "COM¹.yml", "LPT9.yml", "stream.yml:ads", "trailing.yml.", "trailing.yml ", "percent%2e.yml", "query?.yml", "fragment#.yml"]) {
    const unsafe = { ...prepared, files: [path.win32.join(root, ".github", "workflows", name)], paths: [{ file: `.github/workflows/${name}`, path: `.github/workflows/${name}` }] }
    expect(ReviewZizmorInput.argv("C:\\bin\\zizmor.exe", unsafe)).toEqual({ status: "unsupported", reason: "native-uri-path-unsupported" })
  }
  expect(ReviewZizmorInput.argv("\\\\?\\C:\\bin\\zizmor.exe", prepared)).toEqual({ status: "not-run", reason: "invalid-executable" })
})
