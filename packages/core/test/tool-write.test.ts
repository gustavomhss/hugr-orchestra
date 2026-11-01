import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { FileMutation } from "@orchestra/core/file-mutation"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { LocationMutation } from "@orchestra/core/location-mutation"
import { PermissionV2 } from "@orchestra/core/permission"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { ApplyPatchTool } from "@orchestra/core/tool/apply-patch"
import { EditTool } from "@orchestra/core/tool/edit"
import { WriteTool } from "@orchestra/core/tool/write"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { toolIdentity, executeTool, settleTool, toolDefinitions } from "./lib/tool"

const sessionID = SessionV2.ID.make("ses_write_tool_test")
const refusal =
  "Orchestra's permission rules deny this call. Continue with the tools you are allowed to use, or say what you need."
const assertions: PermissionV2.AssertInput[] = []
const writes: string[] = []
let denyAction: string | undefined
let denyError: PermissionV2.CorrectedError | PermissionV2.BlockedError | undefined

const permission = Layer.succeed(
  PermissionV2.Service,
  PermissionV2.Service.of({
    evaluate: () => Effect.die("unused permission evaluation"),
    authorize: () => Effect.die("unused permission authorization"),
    askExplicit: () => Effect.die("Native askExplicit is unavailable in this normal-path fixture"),
    assert: (input) =>
      Effect.sync(() => assertions.push(input)).pipe(
        Effect.andThen(
          input.action === denyAction
            ? Effect.fail(denyError ?? new PermissionV2.BlockedError({ rules: [] }))
            : Effect.void,
        ),
      ),
    ask: () => Effect.die("unused"),
    reply: () => Effect.die("unused"),
    cancelSession: () => Effect.void,
    get: () => Effect.die("unused"),
    forSession: () => Effect.die("unused"),
    list: () => Effect.die("unused"),
  }),
)

const reset = () => {
  assertions.length = 0
  writes.length = 0
  denyAction = undefined
  denyError = undefined
}

const filesystem = Layer.effect(
  FSUtil.Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    return FSUtil.Service.of({
      ...fs,
      writeWithDirs: (target, content, mode) =>
        Effect.sync(() => writes.push(target)).pipe(Effect.andThen(fs.writeWithDirs(target, content, mode))),
      writePhysical: (target, content, options) =>
        Effect.sync(() => writes.push(target)).pipe(Effect.andThen(fs.writePhysical(target, content, options))),
    })
  }),
).pipe(Layer.provide(LayerNode.compile(FSUtil.node)))

const withTool = <A, E, R>(directory: string, body: (registry: ToolRegistry.Interface) => Effect.Effect<A, E, R>) => {
  const activeLocation = Layer.succeed(
    Location.Service,
    Location.Service.of(location({ directory: AbsolutePath.make(directory) })),
  )
  return Effect.gen(function* () {
    return yield* body(yield* ToolRegistry.Service)
  }).pipe(
    Effect.provide(
      AppNodeBuilder.build(
        LayerNode.group([
          ToolRegistry.node,
          ToolRegistry.toolsNode,
          LocationMutation.node,
          FileMutation.node,
          WriteTool.node,
        ]),
        [
          [FSUtil.node, filesystem],
          [Location.node, activeLocation],
          [PermissionV2.node, permission],
          [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
        ],
      ),
    ),
  )
}

// The same fixture with `edit` and `apply_patch` beside `write`, to show they keep the Session's record of the file current.
const withMutationTools = <A, E, R>(
  directory: string,
  body: (registry: ToolRegistry.Interface) => Effect.Effect<A, E, R>,
) => {
  const activeLocation = Layer.succeed(
    Location.Service,
    Location.Service.of(location({ directory: AbsolutePath.make(directory) })),
  )
  return Effect.gen(function* () {
    return yield* body(yield* ToolRegistry.Service)
  }).pipe(
    Effect.provide(
      AppNodeBuilder.build(
        LayerNode.group([
          ToolRegistry.node,
          ToolRegistry.toolsNode,
          LocationMutation.node,
          FileMutation.node,
          WriteTool.node,
          EditTool.node,
          ApplyPatchTool.node,
        ]),
        [
          [FSUtil.node, filesystem],
          [Location.node, activeLocation],
          [PermissionV2.node, permission],
          [ToolOutputStore.node, ToolOutputStore.nodeWithoutConfig],
        ],
      ),
    ),
  )
}

const call = (input: typeof WriteTool.Input.Type, id = "call-write") => ({
  sessionID,
  ...toolIdentity,
  call: { type: "tool-call" as const, id, name: "write", input },
})

const it = testEffect(Layer.empty)

describe("WriteTool", () => {
  it.live("registers and creates a relative file through FileMutation once", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => {
        reset()
        return withTool(tmp.path, (registry) =>
          Effect.gen(function* () {
            expect((yield* toolDefinitions(registry)).map((tool) => tool.name)).toEqual(["write"])
            const settled = yield* settleTool(registry, call({ path: "src/new.txt", content: "created" }))
            expect(settled).toEqual({
              result: { type: "text", value: "Created file successfully: src/new.txt" },
              output: {
                structured: {
                  operation: "write",
                  target: path.join(yield* Effect.promise(() => fs.realpath(tmp.path)), "src", "new.txt"),
                  resource: "src/new.txt",
                  existed: false,
                },
                content: [{ type: "text", text: "Created file successfully: src/new.txt" }],
              },
            })
            expect(yield* Effect.promise(() => fs.readFile(path.join(tmp.path, "src", "new.txt"), "utf8"))).toBe(
              "created",
            )
            expect(assertions).toMatchObject([{ sessionID, action: "edit", resources: ["src/new.txt"], save: ["*"] }])
            expect(writes).toEqual([path.join(yield* Effect.promise(() => fs.realpath(tmp.path)), "src", "new.txt")])
          }),
        )
      },
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )

  it.live("overwrites a relative existing file and reports that it wrote the file", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => {
        reset()
        return Effect.promise(() => fs.writeFile(path.join(tmp.path, "existing.txt"), "before")).pipe(
          Effect.andThen(
            withTool(tmp.path, (registry) => settleTool(registry, call({ path: "existing.txt", content: "after" }))),
          ),
          Effect.andThen((settled) =>
            Effect.gen(function* () {
              expect(settled.result).toEqual({ type: "text", value: "Wrote file successfully: existing.txt" })
              expect(settled.output?.structured).toMatchObject({ resource: "existing.txt", existed: true })
              expect(yield* Effect.promise(() => fs.readFile(path.join(tmp.path, "existing.txt"), "utf8"))).toBe(
                "after",
              )
              expect(writes).toHaveLength(1)
            }),
          ),
        )
      },
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )

  it.live("preserves exactly one BOM when overwriting existing files", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => {
        reset()
        const preserved = path.join(tmp.path, "preserved.txt")
        const deduplicated = path.join(tmp.path, "deduplicated.txt")
        return Effect.promise(() =>
          Promise.all([fs.writeFile(preserved, "\uFEFFbefore"), fs.writeFile(deduplicated, "\uFEFFbefore")]),
        ).pipe(
          Effect.andThen(
            withTool(tmp.path, (registry) =>
              Effect.gen(function* () {
                yield* settleTool(registry, call({ path: "preserved.txt", content: "after" }, "call-preserved"))
                yield* settleTool(
                  registry,
                  call({ path: "deduplicated.txt", content: "\uFEFFafter" }, "call-deduplicated"),
                )

                expect(yield* Effect.promise(() => fs.readFile(preserved, "utf8"))).toBe("\uFEFFafter")
                expect(yield* Effect.promise(() => fs.readFile(deduplicated, "utf8"))).toBe("\uFEFFafter")
              }),
            ),
          ),
        )
      },
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )

  it.live("accepts an absolute file path inside the active Location", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => {
        reset()
        const target = path.join(tmp.path, "absolute.txt")
        return withTool(tmp.path, (registry) => executeTool(registry, call({ path: target, content: "inside" }))).pipe(
          Effect.andThen((result) =>
            Effect.gen(function* () {
              expect(result).toEqual({ type: "text", value: "Created file successfully: absolute.txt" })
              expect(assertions.map((input) => input.action)).toEqual(["edit"])
              expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("inside")
            }),
          ),
        )
      },
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )

  it.live("approves an explicit external absolute path before edit", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => Promise.all([tmpdir(), tmpdir()])),
      ([active, outside]) => {
        reset()
        const target = path.join(outside.path, "external.txt")
        return withTool(active.path, (registry) =>
          settleTool(registry, call({ path: target, content: "external" })),
        ).pipe(
          Effect.andThen((settled) =>
            Effect.gen(function* () {
              const canonicalTarget = path.join(yield* Effect.promise(() => fs.realpath(outside.path)), "external.txt")
              expect(assertions.map((input) => input.action)).toEqual(["external_directory", "edit"])
              expect(assertions[0]).toMatchObject({
                resources: [
                  path.join(yield* Effect.promise(() => fs.realpath(outside.path)), "*").replaceAll("\\", "/"),
                ],
              })
              expect(assertions[1]).toMatchObject({ resources: [canonicalTarget.replaceAll("\\", "/")], save: ["*"] })
              expect(settled.output?.structured).toMatchObject({
                target: canonicalTarget,
                resource: canonicalTarget.replaceAll("\\", "/"),
                existed: false,
              })
              expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("external")
              expect(writes).toEqual([canonicalTarget])
            }),
          ),
        )
      },
      ([active, outside]) =>
        Effect.promise(() =>
          Promise.all([active[Symbol.asyncDispose](), outside[Symbol.asyncDispose]()]).then(() => undefined),
        ),
    ),
  )

  it.live("does not write when external_directory or edit approval is denied", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => Promise.all([tmpdir(), tmpdir()])),
      ([active, outside]) =>
        Effect.gen(function* () {
          const external = path.join(outside.path, "denied.txt")
          reset()
          denyAction = "external_directory"
          expect(
            yield* withTool(active.path, (registry) =>
              executeTool(registry, call({ path: external, content: "blocked" })),
            ),
          ).toEqual({
            type: "error",
            value: refusal,
          })
          expect(assertions.map((input) => input.action)).toEqual(["external_directory"])
          expect(writes).toEqual([])

          reset()
          denyAction = "edit"
          expect(
            yield* withTool(active.path, (registry) =>
              executeTool(registry, call({ path: "denied.txt", content: "blocked" })),
            ),
          ).toEqual({
            type: "error",
            value: refusal,
          })
          expect(assertions.map((input) => input.action)).toEqual(["edit"])
          expect(writes).toEqual([])
        }),
      ([active, outside]) =>
        Effect.promise(() =>
          Promise.all([active[Symbol.asyncDispose](), outside[Symbol.asyncDispose]()]).then(() => undefined),
        ),
    ),
  )

  it.live("tells the model the owner's feedback and the deny rules that refused the write", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => tmpdir()),
      (tmp) =>
        Effect.gen(function* () {
          reset()
          denyAction = "edit"
          denyError = new PermissionV2.CorrectedError({ feedback: "write it under docs/ instead" })
          expect(
            yield* withTool(tmp.path, (registry) => executeTool(registry, call({ path: "a.txt", content: "x" }))),
          ).toEqual({ type: "error", value: "The owner declined this call and said: write it under docs/ instead" })

          reset()
          denyAction = "edit"
          denyError = new PermissionV2.BlockedError({
            rules: [
              { action: "edit", resource: "secrets/*", effect: "deny" },
              { action: "edit", resource: "*", effect: "allow" },
            ],
          })
          expect(
            yield* withTool(tmp.path, (registry) => executeTool(registry, call({ path: "a.txt", content: "x" }))),
          ).toEqual({
            type: "error",
            value:
              "Orchestra's permission rules deny this call (deny rules: edit secrets/*). Continue with the tools you are allowed to use, or say what you need.",
          })
          expect(writes).toEqual([])
        }),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )

  it.live("refuses to overwrite a file that changed since the session wrote it, and accepts it after a rewrite", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => {
        reset()
        const target = path.join(tmp.path, "tracked.txt")
        return withTool(tmp.path, (registry) =>
          Effect.gen(function* () {
            expect(yield* executeTool(registry, call({ path: "tracked.txt", content: "v1" }, "call-1"))).toEqual({
              type: "text",
              value: "Created file successfully: tracked.txt",
            })
            // Unchanged since the session's own write: overwriting again is fine.
            expect(yield* executeTool(registry, call({ path: "tracked.txt", content: "v2" }, "call-2"))).toEqual({
              type: "text",
              value: "Wrote file successfully: tracked.txt",
            })

            yield* Effect.promise(() => fs.writeFile(target, "changed by someone else"))
            expect(yield* executeTool(registry, call({ path: "tracked.txt", content: "v3" }, "call-3"))).toEqual({
              type: "error",
              value: "tracked.txt changed since you last read it. Read it again before overwriting it, or use edit.",
            })
            expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("changed by someone else")
          }),
        )
      },
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )

  it.live("keeps the record current after the session's own edit and apply_patch", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => {
        reset()
        const target = path.join(tmp.path, "mine.txt")
        return withMutationTools(tmp.path, (registry) =>
          Effect.gen(function* () {
            const run = (name: string, input: unknown, id: string) =>
              executeTool(registry, {
                sessionID,
                ...toolIdentity,
                call: { type: "tool-call" as const, id, name, input },
              })
            expect(yield* run("write", { path: "mine.txt", content: "one two three" }, "call-create")).toMatchObject({
              type: "text",
            })

            yield* run("edit", { path: "mine.txt", oldString: "one", newString: "uno" }, "call-edit")
            expect(yield* run("write", { path: "mine.txt", content: "after edit" }, "call-after-edit")).toEqual({
              type: "text",
              value: "Wrote file successfully: mine.txt",
            })

            yield* run(
              "apply_patch",
              {
                patchText: "*** Begin Patch\n*** Update File: mine.txt\n@@\n-after edit\n+after patch\n*** End Patch",
              },
              "call-patch",
            )
            expect(yield* run("write", { path: "mine.txt", content: "final" }, "call-after-patch")).toEqual({
              type: "text",
              value: "Wrote file successfully: mine.txt",
            })
            expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("final")
          }),
        )
      },
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )

  it.live("overwrites a file the session never read without a stale check", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => {
        reset()
        const target = path.join(tmp.path, "unread.txt")
        return Effect.promise(() => fs.writeFile(target, "before")).pipe(
          Effect.andThen(
            withTool(tmp.path, (registry) =>
              executeTool(registry, call({ path: "unread.txt", content: "after" })),
            ),
          ),
          Effect.andThen((result) =>
            Effect.gen(function* () {
              expect(result).toEqual({ type: "text", value: "Wrote file successfully: unread.txt" })
              expect(yield* Effect.promise(() => fs.readFile(target, "utf8"))).toBe("after")
            }),
          ),
        )
      },
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )
})

test("keeps the locked write schema, semantics docstring, and deferred UX TODOs visible", async () => {
  const source = (await fs.readFile(new URL("../src/tool/write.ts", import.meta.url), "utf8")).replaceAll("\r\n", "\n")
  const definition = await Effect.runPromise(
    withTool(path.dirname(fileURLToPath(import.meta.url)), (registry) => toolDefinitions(registry)),
  )
  const schema = definition[0]?.inputSchema as { readonly properties?: Record<string, unknown> }

  expect(Object.keys(schema.properties ?? {}).sort()).toEqual(["content", "path"])
  expect(source).toContain(
    "absolute external paths retain mutation capability through a separate\n * external_directory approval before edit approval.",
  )
  for (const todo of [
    "Revisit whether model-facing mutation schemas should prefer absolute `filePath` naming for trained-in compatibility after evaluating model behavior.",
    "Add formatter integration after V2 formatter runtime exists.",
    "Publish watcher/file-edit events after V2 watcher integration exists.",
    "Add snapshots / undo after design exists.",
  ]) {
    expect(source).toContain(`TODO: ${todo}`)
  }
})
