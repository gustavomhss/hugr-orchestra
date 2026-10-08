import { expect, test } from "bun:test"
import { link, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PrivateFile } from "../../src/util/private-file"
import { SiwcHost } from "../../src/auth/siwc-host"
import { assertPrivateFile, broadenPrivateFile } from "../fixture/private-file"

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

test("completed private files retain protection across hardlink admission and rename replacement", async () => {
  const root = await mkdtemp(join(tmpdir(), "private-publication-test-"))
  await using cleanup = { [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }) }
  const temporary = join(root, "temporary")
  const destination = join(root, "published")
  await writeFile(temporary, "complete fixture ID\n")
  await broadenPrivateFile(temporary, true)
  await expect(assertPrivateFile(temporary)).rejects.toThrow("Private-file oracle")
  await PrivateFile.protect(temporary)
  await assertPrivateFile(temporary)
  await link(temporary, destination)
  await assertPrivateFile(destination)
  expect(await readFile(destination, "utf8")).toBe("complete fixture ID\n")
  await rm(temporary)
  await writeFile(temporary, '{"fixture":"replacement"}')
  await PrivateFile.protect(temporary)
  await assertPrivateFile(temporary)
  await rename(temporary, destination)
  await assertPrivateFile(destination)
  expect(await readFile(destination, "utf8")).toBe('{"fixture":"replacement"}')
})

test("OS protection errors are named; host publication fails without leaking scratch files", async () => {
  const root = await mkdtemp(join(tmpdir(), "private-failure-test-"))
  await using cleanup = { [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }) }
  await expect(PrivateFile.protect(join(root, "missing"))).rejects.toThrow("PrivateFile.protect failed")
  await expect(PrivateFile.protect(root)).rejects.toThrow("PrivateFile.protect failed")
  // Embedded NUL causes a real OS-path failure, not an injected filesystem stub.
  await expect(SiwcHost.load(join(root, "invalid\0host"))).rejects.toThrow()
  expect(await readdir(root)).toEqual([])
})
