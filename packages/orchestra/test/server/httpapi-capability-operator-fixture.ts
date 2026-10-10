export * as CapabilityHostFixture from "./httpapi-capability-operator-fixture"

import { expect } from "bun:test"
import { CapabilityOperator } from "@orchestra/core/capability/operator/index"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { Flag } from "@orchestra/core/flag/flag"
import { CapabilityManagement } from "@orchestra/schema/capability-management"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { ConfigProvider, Effect, Exit, Layer, Schema, Scope } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { tmpdir } from "../fixture/fixture"

export function make(options: { password?: string; injected?: boolean } = {}) {
  return Effect.gen(function* () {
    // Existing preload isolates storage and disables installed-account inheritance.
    expect(Database.path()).toBe(":memory:")
    expect(Credential.inheritedPath()).toBeUndefined()
    expect(Flag.ORCHESTRA_DISABLE_MODELS_FETCH).toBe(true)
    const directory = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir({ git: true, config: { formatter: false, lsp: false } })),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const foreign = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir({ git: true })),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    )
    const projectID = yield* Effect.promise(async () => {
      const git = Bun.spawn(["git", "rev-list", "--max-parents=0", "HEAD"], {
        cwd: directory.path,
        stdout: "pipe",
        stderr: "pipe",
      })
      expect(await git.exited).toBe(0)
      return Project.ID.make((await new Response(git.stdout).text()).trim())
    })
    const authorityScope = yield* Scope.make()
    yield* Effect.addFinalizer(() => Scope.close(authorityScope, Exit.void))
    const operator = yield* CapabilityOperator.make({
      principal: "host-fixture",
      scope: { placements: "instance", actions: ["*"] },
    }).pipe(Scope.provide(authorityScope))
    const targets: CapabilityOperatorContract.Target[] = []
    const facade: CapabilityOperatorContract.Interface = {
      ...operator,
      require: (target) =>
        Effect.sync(() => {
          targets.push(target)
        }).pipe(Effect.andThen(operator.require(target))),
    }
    const web = HttpRouter.toWebHandler(
      HttpApiApp.createRoutes(undefined, options.injected ? facade : undefined).pipe(
        Layer.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({
              ORCHESTRA_SERVER_USERNAME: "host-basic",
              ORCHESTRA_SERVER_PASSWORD: options.password,
            }),
          ),
        ),
      ),
      { disableLogger: true },
    )
    yield* Effect.addFinalizer(() => Effect.promise(() => web.dispose()))
    const request = (
      route: string,
      input: {
        auth?: string
        directory?: string
        headers?: Record<string, string>
        query?: Record<string, string>
      } = {},
    ) =>
      Effect.promise(() => {
        const url = new URL(route, "http://localhost")
        Object.entries(input.query ?? {}).forEach(([key, value]) => url.searchParams.set(key, value))
        return web.handler(
          new Request(url, {
            headers: {
              "x-orchestra-directory": input.directory ?? directory.path,
              ...input.headers,
              ...(input.auth === undefined ? {} : { authorization: input.auth }),
            },
          }),
          HttpApiApp.context,
        )
      })
    return {
      operator,
      targets,
      request,
      projectID,
      directory: AbsolutePath.make(directory.path),
      foreign: foreign.path,
      closeAuthority: Scope.close(authorityScope, Exit.void),
    }
  })
}

export const basic = (password = "secret") => `Basic ${Buffer.from(`host-basic:${password}`).toString("base64")}`
const Binding = Schema.Struct({
  requestID: Schema.String,
  principal: Schema.String,
  origin: Schema.String,
  scopeHash: Schema.String,
})
export const binding = (response: Response) =>
  Effect.promise(() => response.text()).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Binding)))),
  )
export const page = (response: Response) =>
  Effect.promise(() => response.text()).pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(
        Schema.UnknownFromJsonString.pipe(Schema.decodeTo(CapabilityManagement.ConnectionPage)),
      ),
    ),
  )
