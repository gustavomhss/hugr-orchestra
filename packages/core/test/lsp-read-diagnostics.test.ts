import path from "path"
import { mkdir, writeFile } from "fs/promises"
import { expect, test } from "bun:test"
import { Effect } from "effect"
import { confined } from "../src/lsp/launch"
import { LSPReadDiagnostics } from "../src/lsp/read-diagnostics"
import { expectSpawn } from "./fixture/omni-expect"
import { tmpdir } from "./fixture/tmpdir"
import { jail } from "./lib/sandbox-host"

const server = path.join(import.meta.dir, "fixture", "lsp-diagnostics-server.js")
const live = jail ? test : test.skip

test("a path outside the copy is refused before spawn, and an empty spawn is absence", async () => {
  const dir = await tmpdir()
  const root = dir.path
  await writeFile(path.join(root, "a.ts"), "export const a = 1\n")
  let spawned = false
  const spawn = async () => {
    spawned = true
    return undefined
  }
  const outside = await Effect.runPromise(LSPReadDiagnostics.readDiagnostics({
    root, files: ["../a.ts"], spawn,
  }))
  expect(outside).toMatchObject({ status: "not-run", reason: "path-outside", workspaceExecuted: false })
  expect(spawned).toBe(false)
  const absent = await Effect.runPromise(LSPReadDiagnostics.readDiagnostics({
    root, files: ["a.ts"], spawn,
  }))
  expect(absent).toMatchObject({ status: "not-run", reason: LSPReadDiagnostics.ABSENT, workspaceExecuted: false })
  expect(spawned).toBe(true)
  await dir[Symbol.asyncDispose]()
})

live("opening a file returns the published diagnostic and does not write it", async () => {
  expectSpawn(import.meta.path)
  const dir = await tmpdir()
  const root = dir.path
  const file = path.join(root, "a.ts")
  const text = "export const a = 1\n"
  await mkdir(root, { recursive: true })
  await writeFile(file, text)
  const report = await Effect.runPromise(LSPReadDiagnostics.readDiagnostics({
    root,
    files: ["a.ts"],
    spawn: (cwd) => confined(process.execPath, [server], { cwd }).then((process) => ({ process })),
  }))
  expect(report.status).toBe("fail")
  expect(report.workspaceExecuted).toBe(true)
  expect(report.diagnostics).toEqual([
    { path: "a.ts", severity: 1, message: "fixture-diagnostic", line: 1, character: 1 },
  ])
  expect(await Bun.file(file).text()).toBe(text)
  await dir[Symbol.asyncDispose]()
}, 30_000)
