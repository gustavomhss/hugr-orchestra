import { describe, expect, test } from "bun:test"
import { testPathsAt } from "../../../script/test-ci-paths.ts"

describe("directory-aware Bun selectors", () => {
  test("named files preserve order across actual, legacy and relative prefixes", () => {
    const files = new Set(["test/z.test.ts", "test/a.test.ts"])
    expect(testPathsAt("modules/runtime", [
      "modules/runtime/test/z.test.ts", "./packages/core/test/a.test.ts", "test/z.test.ts", "./test/a.test.ts",
    ], (file) => files.has(file), "core")).toEqual([
      "./test/z.test.ts", "./test/a.test.ts", "./test/z.test.ts", "./test/a.test.ts",
    ])
  })

  test("directories, substring filters and flags remain filters", () => {
    expect(testPathsAt("modules/runtime", [
      "test", "session", "modules/runtime/test", "packages/core/session", "--only", "*.test.ts",
    ], (file) => file === "--only", "core")).toEqual(["test", "session", "test", "session", "--only", "*.test.ts"])
  })

  test("explicit relative paths stay explicit without a file lookup", () => {
    expect(testPathsAt("modules/runtime", ["./test/missing.test.ts", ".\\test\\missing.test.ts"], () => {
      throw new Error("explicit paths need no lookup")
    })).toEqual(["./test/missing.test.ts", "./test/missing.test.ts"])
  })

  test("Windows separators normalize for files and literal prefix matching", () => {
    expect(testPathsAt("modules\\runtime", [
      ".\\modules\\runtime\\test\\a.test.ts", "packages\\core\\test\\a.test.ts", "test\\a.test.ts",
    ], (file) => file === "test/a.test.ts", "core")).toEqual([
      "./test/a.test.ts", "./test/a.test.ts", "./test/a.test.ts",
    ])
  })

  test("absolute paths are unchanged and never looked up", () => {
    const args = ["/tmp/a.test.ts", "C:\\repo\\a.test.ts", "C:/repo/a.test.ts", "\\\\host\\share\\a.test.ts"]
    expect(testPathsAt("modules/runtime", args, () => {
      throw new Error("absolute paths need no lookup")
    })).toEqual(args)
  })

  test("directory punctuation is literal and only complete prefixes match", () => {
    expect(testPathsAt("modules/app.v2+[web]", [
      "modules/app.v2+[web]/test/a.test.ts", "modules/appXv2+[web]/test/a.test.ts",
      "modules/app.v2+[web]-other/test/a.test.ts", "packages/app/test/a.test.ts",
    ], (file) => file === "test/a.test.ts")).toEqual([
      "./test/a.test.ts", "modules/appXv2+[web]/test/a.test.ts",
      "modules/app.v2+[web]-other/test/a.test.ts", "packages/app/test/a.test.ts",
    ])
  })

  test.each(["", ".", "./modules/app", "/modules/app", "C:/app", "C:\\app", "../app", "modules/../app",
    "modules//app", "modules/app/", "modules/./app", "modules\n/app", "modules/\0app", "modules/\x7fapp"])(
    "rejects unsafe directory %j before file lookup", (directory) => {
      expect(() => testPathsAt(directory, [], () => false)).toThrow("invalid directory")
    },
  )
})
