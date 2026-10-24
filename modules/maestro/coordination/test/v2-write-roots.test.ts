import { expect, test } from "bun:test"
import { mkdir, symlink } from "node:fs/promises"
import path from "node:path"
import { ToolFailure } from "@orchestra/llm"
import { Effect, Layer } from "effect"
import { Project } from "@orchestra/core/project"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { WriteRootsV2 } from "../src/v2/governance/write-roots"
import { admit, governanceLayer, safetyLayer, session, worktree } from "./fixture/v2-governance"

const run = <A, E, R>(layer: (directory: string) => Layer.Layer<R, unknown>, body: (directory: string) => Effect.Effect<A, E, R>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        return yield* body(directory).pipe(Effect.provide(layer(directory)))
      }),
    ),
  )

const refusal = <R>(effect: Effect.Effect<unknown, ToolFailure, R>) =>
  Effect.flip(effect).pipe(Effect.map((error) => error.message))

const PERMISSION = WriteRootsV2.PERMISSION

test("a write-roots seat's child gets exactly its validated roots; without paths it is read-only", () =>
  run(governanceLayer, (directory) =>
    Effect.gen(function* () {
      yield* Effect.promise(() => mkdir(path.join(directory, "src")))
      expect(yield* admit({ directory, caller: "maestro", target: "backend", extra: { writePaths: ["src", "docs/new.md", "src"] } }))
        .toEqual({
          permissions: [
            { action: PERMISSION, resource: "*", effect: "deny" },
            { action: PERMISSION, resource: path.join(directory, "src"), effect: "allow" },
            { action: PERMISSION, resource: path.join(directory, "docs", "new.md"), effect: "allow" },
          ],
        })
      expect(yield* admit({ directory, caller: "maestro", target: "backend" }))
        .toEqual({ permissions: [{ action: PERMISSION, resource: "*", effect: "deny" }] })
      // Members without the capability ignore writePaths, as on V1.
      expect(yield* admit({ directory, caller: "maestro", target: "patty", extra: { writePaths: ["src"] } })).toEqual({})
    }),
  ))

test("write paths that leave the worktree are refused before any child exists", () =>
  run(governanceLayer, (directory) =>
    Effect.gen(function* () {
      yield* Effect.promise(() => symlink(path.dirname(directory), path.join(directory, "out")))
      const denied = (writePaths: string[]) => refusal(admit({ directory, caller: "maestro", target: "backend", extra: { writePaths } }))
      expect(yield* denied(["../x"])).toBe('Task denied: write-path-escape: "../x"')
      expect(yield* denied(["/etc"])).toBe('Task denied: write-path-absolute: "/etc"')
      expect(yield* denied([" "])).toBe('Task denied: write-path-empty: " "')
      expect(yield* denied(["out/x"])).toBe('Task denied: write-path-symlink-escape: "out/x"')
    }),
  ))

test("a resumed scoped child keeps its other rules and adopts the dispatch's roots", () =>
  run(governanceLayer, (directory) =>
    Effect.gen(function* () {
      const parentID = yield* session({ directory, agent: "maestro" })
      const child = yield* session({
        directory, agent: "backend", parentID,
        permission: [
          { permission: "bash", pattern: "*", action: "allow" },
          { permission: PERMISSION, pattern: "*", action: "deny" },
          { permission: PERMISSION, pattern: path.join(directory, "old"), action: "allow" },
        ],
      })
      expect(yield* admit({ directory, caller: "maestro", target: "backend", parentID, extra: { task_id: child, writePaths: ["new"] } }))
        .toEqual({
          permissions: [
            { action: "bash", resource: "*", effect: "allow" },
            { action: PERMISSION, resource: "*", effect: "deny" },
            { action: PERMISSION, resource: path.join(directory, "new"), effect: "allow" },
          ],
        })
    }),
  ))

test("read and profile narrow a project profile to the bound roots", () => {
  expect(WriteRootsV2.read([{ action: "bash", resource: "*", effect: "allow" }])).toBeUndefined()
  expect(WriteRootsV2.read([
    { action: PERMISSION, resource: "*", effect: "deny" },
    { action: PERMISSION, resource: "/w/src", effect: "allow" },
  ])).toEqual(["/w/src"])
  const narrowed = WriteRootsV2.profile({ writeRoots: ["src"], sandbox: { enabled: false } }, ["/w/src/a", "/w/lib"], "/w")
  expect(narrowed.writeRoots).toEqual(["/w/src/a"])
  expect(narrowed.requireSandbox).toBe(true)
  expect(narrowed.sandbox).toEqual({ enabled: true, scratch: true, unconfinedFallback: true })
  expect(WriteRootsV2.profile(undefined, ["/w/lib"], "/w").writeRoots).toEqual(["/w/lib"])
})

test("the Location's ToolSafety holds a scoped Session's writes to its bound roots", () =>
  run(safetyLayer, (directory) =>
    Effect.gen(function* () {
      const safety = yield* ToolSafety.Service
      yield* Effect.promise(() => mkdir(path.join(directory, "src")))
      const scoped = yield* session({
        directory, agent: "backend",
        permission: [
          { permission: PERMISSION, pattern: "*", action: "deny" },
          { permission: PERMISSION, pattern: path.join(directory, "src"), action: "allow" },
        ],
      })
      const plain = yield* session({ directory, agent: "general" })
      const write = (sessionID: string, file: string) =>
        safety.run(
          { tool: "write", args: { filePath: file, content: "" }, sessionID, callID: "call", directory, projectID: Project.ID.global },
          Effect.succeed("written"),
          () => Effect.void,
        )
      expect(yield* write(scoped, path.join(directory, "src", "a.ts"))).toBe("written")
      const denied = yield* Effect.flip(write(scoped, path.join(directory, "outside.ts")))
      expect(denied instanceof ToolSafety.Denied && denied.reason).toBe("write-outside-physical-roots")
      expect(yield* write(plain, path.join(directory, "outside.ts"))).toBe("written")
    }),
  ))
