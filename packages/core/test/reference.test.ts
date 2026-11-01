import { describe, expect } from "bun:test"
import { Effect, Exit, Layer, Logger, Scope } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AbsolutePath } from "@orchestra/core/schema"
import { Global } from "@orchestra/core/global"
import { Reference } from "@orchestra/core/reference"
import { Repository } from "@orchestra/core/repository"
import { RepositoryCache } from "@orchestra/core/repository-cache"
import { it } from "./lib/effect"

const cache = Layer.mock(RepositoryCache.Service, {
  ensure: () => Effect.die("unexpected Git materialization"),
})
const referenceLayer = AppNodeBuilder.build(Reference.node, [[RepositoryCache.node, cache]])

describe("Reference", () => {
  it.effect("registers normalized sources for the owning scope", () =>
    Effect.gen(function* () {
      const references = yield* Reference.Service
      const scope = yield* Scope.make()
      const path = AbsolutePath.make("/docs")
      const source = Reference.LocalSource.make({
        type: "local",
        path,
        description: "Use for API documentation",
        hidden: true,
      })
      yield* references.transform((editor) => editor.add("docs", source)).pipe(Scope.provide(scope))

      expect(yield* references.list()).toEqual([
        new Reference.Info({ name: "docs", path, description: "Use for API documentation", hidden: true, source }),
      ])

      yield* Scope.close(scope, Exit.void)
      expect(yield* references.list()).toEqual([])
    }).pipe(Effect.provide(referenceLayer)),
  )

  it.effect("derives Git paths without exposing cache operations", () =>
    Effect.gen(function* () {
      const references = yield* Reference.Service
      const repository = Repository.parseRemote("owner/repo")
      const source = Reference.GitSource.make({ type: "git", repository: "owner/repo", branch: "main" })
      yield* references.transform((editor) => editor.add("sdk", source))

      expect(yield* references.list()).toEqual([
        new Reference.Info({
          name: "sdk",
          path: AbsolutePath.make(Repository.cachePath(Global.Path.repos, repository, "main")),
          source,
        }),
      ])
    }).pipe(Effect.scoped, Effect.provide(referenceLayer)),
  )

  it.effect("preserves configured Git descriptions", () =>
    Effect.gen(function* () {
      const references = yield* Reference.Service
      const repository = Repository.parseRemote("owner/repo")
      const source = Reference.GitSource.make({
        type: "git",
        repository: "owner/repo",
        description: "Use for SDK implementation details",
      })
      yield* references.transform((editor) => editor.add("sdk", source))

      expect(yield* references.list()).toEqual([
        new Reference.Info({
          name: "sdk",
          path: AbsolutePath.make(Repository.cachePath(Global.Path.repos, repository)),
          description: "Use for SDK implementation details",
          source,
        }),
      ])
    }).pipe(Effect.scoped, Effect.provide(referenceLayer)),
  )

  it.live("a clone that fails is quiet and keeps the reference, a defect warns with a readable cause", () =>
    Effect.gen(function* () {
      const warnings: string[] = []
      const logger = Logger.layer([
        Logger.make(
          (options) =>
            void (
              options.logLevel === "Warn" &&
              warnings.push([options.message].flat().map((value) => (typeof value === "string" ? value : JSON.stringify(value))).join(" "))
            ),
        ),
      ])
      const run = (ensure: Effect.Effect<never, RepositoryCache.Error>, repository: string) =>
        Effect.gen(function* () {
          const references = yield* Reference.Service
          yield* references.transform((editor) => editor.add("sdk", Reference.GitSource.make({ type: "git", repository })))
          yield* Effect.sleep("20 millis")
          expect(yield* references.list()).toHaveLength(1)
        }).pipe(
          Effect.scoped,
          Effect.provide(AppNodeBuilder.build(Reference.node, [[RepositoryCache.node, Layer.mock(RepositoryCache.Service, { ensure: () => ensure })]])),
          Effect.provide(logger),
        )

      yield* run(Effect.fail(new RepositoryCache.CloneFailedError({ repository: "owner/offline", message: "could not resolve host" })), "owner/offline")
      expect(warnings).toEqual([])

      yield* run(Effect.die(new Error("boom")), "owner/broken")
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain("boom")
    }),
  )
})
