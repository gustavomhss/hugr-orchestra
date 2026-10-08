import { expect, test } from "bun:test"
import { link, lstat, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PrivateFile } from "../../src/util/private-file"
import { SiwcHost } from "../../src/auth/siwc-host"
import { assertPrivateFile, broadenPrivateFile, preventNativeProtection } from "../fixture/private-file"

test("native protection removes broad explicit and inherited permissions; oracle rejects unsafe files", async () => {
  const root = await mkdtemp(join(tmpdir(), "private-file-test-"))
  await using cleanup = { [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }) }
  // Metacharacters must stay filename data, including PowerShell quotes and '$'.
  const filename = join(root, "fixture ' $ ; [file].json")
  await writeFile(filename, "fixture-only", { mode: 0o644 })
  for (const inheritance of [false, true]) {
    await broadenPrivateFile(filename, inheritance)
    await expect(assertPrivateFile(filename)).rejects.toThrow("Private-file oracle")
    await PrivateFile.protect(filename)
    await assertPrivateFile(filename)
    expect(await readFile(filename, "utf8")).toBe("fixture-only")
  }
  await PrivateFile.protect(filename)
  await assertPrivateFile(filename)
})

test("host production publisher sees a complete private source before hardlink admission", async () => {
  const root = await mkdtemp(join(tmpdir(), "private-publication-test-"))
  await using cleanup = { [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }) }
  const destination = join(root, "published")
  const sources: string[] = []
  const protectedSources: string[] = []
  const id = await SiwcHost.load(destination, {
    protect: async (filename) => {
      // Start broad even on POSIX, where writeFile's mode alone would hide omission.
      await broadenPrivateFile(filename, true)
      await PrivateFile.protect(filename)
      protectedSources.push(filename)
    },
    publish: async (source, target) => {
      sources.push(source)
      await assertPrivateFile(source)
      expect(protectedSources).toContain(source)
      expect(await readFile(source, "utf8")).toMatch(/^urn:uuid:[0-9a-f-]{36}\n$/i)
      expect(await readdir(root)).not.toContain("published")
      await link(source, target)
    },
  })
  expect(sources).toHaveLength(1)
  expect(await readFile(destination, "utf8")).toBe(`${id}\n`)
  await assertPrivateFile(destination)
  expect(await readdir(root)).toEqual(["published"])
})

test("host native protection failure forbids publication and cleans completed scratch source", async () => {
  const root = await mkdtemp(join(tmpdir(), "private-failure-test-"))
  await using cleanup = { [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }) }
  const sources: string[] = []
  const published: string[] = []
  const failures: Error[] = []
  await expect(SiwcHost.load(join(root, "host"), {
    protect: async (source) => {
      sources.push(source)
      expect(await readFile(source, "utf8")).toMatch(/^urn:uuid:[0-9a-f-]{36}\n$/i)
      await using failure = await preventNativeProtection(source)
      expect((await lstat(source)).isFile()).toBe(true)
      await PrivateFile.protect(source).catch((cause: unknown) => {
        if (!(cause instanceof Error)) throw cause
        failures.push(cause)
        throw cause
      })
    },
    publish: async (source, target) => { published.push(target); await link(source, target) },
  })).rejects.toThrow("PrivateFile.protect failed")
  expect(sources).toHaveLength(1)
  expect(published).toEqual([])
  expect(failures).toHaveLength(1)
  if (process.platform === "win32") expect(String(failures[0].cause)).toContain("Executable not found in $PATH")
  if (process.platform === "linux") expect(failures[0].cause).toMatchObject({ code: "EPERM", syscall: "chmod" })
  expect(await readdir(root)).toEqual([])
})
