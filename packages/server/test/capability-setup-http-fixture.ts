export * as CapabilitySetupHttpFixture from "./capability-setup-http-fixture"

import { expect } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createServer } from "node:http"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import type { CapabilityConnectionSetupContract } from "@orchestra/core/capability/connection/setup-contract"
import type { Layer } from "effect"
import type { HttpRouter } from "effect/unstable/http"

export const keys = ["proof-slack-key-private-71", "proof-slack-key-private-92", "proof-discord-key-private-83"]
export const worker = process.env.ORCHESTRA_SETUP_PROOF_WORKER === "1"

// Parent imports only platform modules. Child environment exists before Bun preloads or Core imports.
export async function isolated(file: string, markers: readonly string[]) {
  const directory = await mkdtemp(join(tmpdir(), "setup-proof-bootstrap-"))
  await Promise.all(["home", "config", "cache", "data", "state"].map((name) => mkdir(join(directory, name))))
  // Keep guard active; skip package preload that overwrites the child's isolated file DB.
  const config = join(directory, "bunfig.toml")
  await Bun.write(config, `[test]\nroot = ${JSON.stringify(resolve(file, ".."))}\npreload = [${JSON.stringify(resolve(import.meta.dir, "../../../script/test-guard.ts"))}]\n`)
  const child = Bun.spawn([process.execPath, "test", "--config", config, file, "--timeout", "30000"], {
    cwd: resolve(file, "../..", file.includes("/test/server/") ? ".." : "."),
    env: { ...process.env, ORCHESTRA_SETUP_PROOF_WORKER: "1", ORCHESTRA_DB: join(directory, "proof.db"),
      ORCHESTRA_DISABLE_MODELS_FETCH: "1", ORCHESTRA_INHERIT_CREDENTIALS: "0",
      ORCHESTRA_TEST_HOME: join(directory, "home"), ORCHESTRA_TEST_MANAGED_CONFIG_DIR: join(directory, "managed"),
      XDG_CONFIG_HOME: join(directory, "config"), XDG_CACHE_HOME: join(directory, "cache"),
      XDG_DATA_HOME: join(directory, "data"), XDG_STATE_HOME: join(directory, "state"),
      ORCHESTRA_MODELS_PATH: resolve(import.meta.dir, "../../core/test/plugin/fixtures/models-dev.json"),
      ORCHESTRA_SERVER_PASSWORD: "", ORCHESTRA_SERVER_USERNAME: "", NO_COLOR: "1", FORCE_COLOR: "0" },
    stdout: "pipe", stderr: "pipe", timeout: 90_000, killSignal: "SIGKILL",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ])
  await rm(directory, { recursive: true, force: true })
  expect(code, stdout + stderr).toBe(0)
  expect(stdout.split(/\r?\n/).filter((line) => line.startsWith("SETUP_PROOF ")), stdout + stderr).toEqual(
    markers.map((marker) => `SETUP_PROOF ${marker}`),
  )
  keys.forEach((key) => expect(stdout + stderr).not.toContain(key))
  expect(stderr).toMatch(new RegExp(`^\\s*${markers.length} pass\\s*$`, "m"))
  console.log(stdout + stderr)
}

type Routes = (operator: CapabilityOperatorContract.Interface, verifier: CapabilityConnectionSetupContract.Verifier) =>
  Layer.Layer<never, unknown, HttpRouter.HttpRouter | HttpRouter.Request<"Requires", unknown> |
    HttpRouter.Request<"Error", unknown> | HttpRouter.Request<"GlobalError", unknown>>

export async function make(options: { password?: string; routes?: Routes } = {}) {
  const { Effect, Layer, Context, Scope, Exit } = await import("effect")
  const { HttpRouter, HttpServer } = await import("effect/unstable/http")
  const { Database } = await import("@orchestra/core/database/database")
  const { Flag } = await import("@orchestra/core/flag/flag")
  const { Credential } = await import("@orchestra/core/credential")
  const { ProjectTable } = await import("@orchestra/core/project/sql")
  const { Project } = await import("@orchestra/schema/project")
  const { AbsolutePath } = await import("@orchestra/schema/schema")
  const { CapabilityOperator } = await import("@orchestra/core/capability/operator/index")
  const { CapabilityConnectionVerification } = await import("@orchestra/core/capability/connection/verify")
  const { createRoutes } = await import("../src/routes")
  expect(worker).toBe(true)
  expect(Database.path()).toBe(process.env.ORCHESTRA_DB ?? "")
  expect(Database.path()).toContain("setup-proof-bootstrap-")
  expect(Credential.inheritedPath()).toBeUndefined()
  expect(Flag.ORCHESTRA_DISABLE_MODELS_FETCH).toBe(true)
  return Effect.gen(function* () {
    const scope = yield* Effect.scope
    const memoMap = Layer.makeMemoMapUnsafe()
    const context = yield* Layer.buildWithMemoMap(Database.layerFromPath(Database.path()), memoMap, scope)
    const database = Context.get(context, Database.Service)
    const directory = yield* Effect.acquireRelease(
      Effect.promise(() => mkdtemp(join(tmpdir(), "setup-http-"))),
      (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
    )
    // Core resolves non-git placement to global; persistence is still legacy Project-owned.
    yield* database.db.insert(ProjectTable).values({ id: Project.ID.global,
      worktree: AbsolutePath.make(directory), sandboxes: [] }).onConflictDoNothing().run()
    const authorityScope = yield* Scope.make()
    yield* Effect.addFinalizer(() => Scope.close(authorityScope, Exit.void))
    const operators = yield* CapabilityOperator.make({ principal: "setup-http-proof",
      scope: { placements: "instance", actions: ["*"] } }).pipe(Scope.provide(authorityScope))
    const seen: { path: string; method: string; authorization: string }[] = []
    const state = { mode: "valid" }
    const vendor = createServer((request, response) => {
      seen.push({ path: request.url ?? "", method: request.method ?? "", authorization: request.headers.authorization ?? "" })
      response.setHeader("content-type", "application/json")
      if (state.mode === "redirect") {
        response.writeHead(302, { location: "http://127.0.0.1:1/private" })
        response.end()
        return
      }
      if (state.mode === "http") response.statusCode = 401
      response.end(JSON.stringify(state.mode === "expired" ? { ok: false, error: "token_expired", private: keys[0] }
        : state.mode === "malformed" ? { ok: true, team_id: "T123", private: keys[0] }
        : request.url === "/api/v10/users/@me" ? { id: "123456789", bot: state.mode !== "not-bot", private: keys[2] }
        : { ok: true, team_id: request.headers.authorization === `Bearer ${keys[1]}` ? "T999" : "T123",
          user_id: "U456", bot_id: "B789", private: keys[0] }))
    })
    yield* Effect.promise(() => new Promise<void>((done) => vendor.listen(0, "127.0.0.1", done)))
    yield* Effect.addFinalizer(() => Effect.promise(() => new Promise<void>((done, reject) => vendor.close(
      (error) => error ? reject(error) : done(),
    ))))
    const address = vendor.address()
    if (!address || typeof address === "string") return yield* Effect.die("Expected loopback listener")
    const verifier = yield* CapabilityConnectionVerification.make({ fixtureOrigin: `http://127.0.0.1:${address.port}/` })
    const web = HttpRouter.toWebHandler((options.routes
      ? options.routes(operators, verifier) : createRoutes(options.password, operators, verifier).pipe(
        Layer.provide(HttpServer.layerServices),
      )), { disableLogger: true, memoMap })
    yield* Effect.addFinalizer(() => Effect.promise(() => web.dispose()))
    const handler = async (request: Request) => {
      const response = await web.handler(request, Context.makeUnsafe<unknown>(new Map()))
      const text = await response.clone().text()
      keys.forEach((key) => expect(text).not.toContain(key))
      return response
    }
    const request = (route: string, input: { auth?: string; key?: string; payload?: unknown;
      raw?: string; directory?: string; query?: Record<string, string>; headers?: Record<string, string> } = {}) =>
      Effect.promise(() => {
        const url = new URL(route, "http://orchestra.local")
        url.searchParams.set("location[directory]", input.directory ?? directory)
        Object.entries(input.query ?? {}).forEach(([key, value]) => url.searchParams.set(key, value))
        return handler(new Request(url, { method: input.payload === undefined && input.raw === undefined ? "GET" : "POST",
          headers: { "content-type": "application/json", ...input.headers,
            ...(input.auth ? { authorization: input.auth } : {}), ...(input.key ? { "idempotency-key": input.key } : {}) },
          body: input.raw ?? (input.payload === undefined ? undefined : JSON.stringify(input.payload)) }))
      })
    const issue = (scope?: CapabilityOperatorContract.GrantScope) => operators.issue({ origin: "sdk", scope }).pipe(
      Effect.map((issued) => `Bearer ${issued.bearer}`),
    )
    return { database, operators, directory, seen, state, handler, request, issue,
      closeAuthority: Scope.close(authorityScope, Exit.void) }
  })
}
