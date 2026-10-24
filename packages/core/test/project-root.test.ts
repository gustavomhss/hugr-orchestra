import path from "path"
import { describe, expect, test } from "bun:test"
import { Atlas } from "@orchestra/core/atlas"
import { Project } from "@orchestra/core/project"

describe("Project.isRoot", () => {
  test("recognizes the filesystem root on POSIX and every drive root on Windows", () => {
    expect(Project.isRoot("/", path.posix)).toBe(true)
    expect(Project.isRoot("/work/app", path.posix)).toBe(false)
    expect(Project.isRoot("C:\\", path.win32)).toBe(true)
    expect(Project.isRoot("D:\\", path.win32)).toBe(true)
    expect(Project.isRoot("C:\\work\\app", path.win32)).toBe(false)
  })

  test("a non-git project keeps its Atlas store in the Location's directory, not the root", () => {
    const directory = path.resolve("work", "app")
    expect(Atlas.storeRoot(path.parse(directory).root, directory)).toBe(directory)
    expect(Atlas.storeRoot(path.dirname(directory), directory)).toBe(path.dirname(directory))
  })
})
