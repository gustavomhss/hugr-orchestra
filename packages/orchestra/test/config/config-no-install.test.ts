import { expect } from "bun:test"
import path from "path"
import { Effect, Layer } from "effect"
import { HttpClient } from "effect/unstable/http"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { httpClient } from "@orchestra/core/effect/app-node-platform"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Npm } from "@orchestra/core/npm"
import { Config } from "@/config/config"
import { Account } from "../../src/account/account"
import { Auth } from "../../src/auth"
import { Env } from "../../src/env"
import { AccountTest } from "../fake/account"
import { AuthTest } from "../fake/auth"
import { provideInstanceEffect, testInstanceStoreLayer, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// Every npm call the real Config makes lands here. It must make none: the plugin SDK comes bundled with Orchestra.
const npmCalls: string[] = []
const recordingNpm = Layer.mock(Npm.Service)({
  install: (dir, input) =>
    Effect.sync(() => {
      npmCalls.push(`install ${dir} ${input?.add.map((pkg) => pkg.name).join(",") ?? ""}`)
    }),
  add: (pkg) =>
    Effect.sync(() => {
      npmCalls.push(`add ${pkg}`)
    }).pipe(Effect.andThen(Effect.die(`unexpected npm add ${pkg}`))),
})

const unexpectedHttp = HttpClient.make((request) => Effect.die(`unexpected http request: ${request.url}`))

const it = testEffect(
  LayerNode.compile(LayerNode.group([Config.node, FSUtil.node, Env.node, CrossSpawnSpawner.node]), [
    [Auth.node, AuthTest.empty],
    [Account.node, AccountTest.empty],
    [Npm.node, recordingNpm],
    [httpClient, Layer.succeed(HttpClient.HttpClient, unexpectedHttp)],
  ]),
)

it.effect("never installs the plugin SDK or anything else into a config directory", () =>
  Effect.gen(function* () {
    const dir = yield* tmpdirScoped()
    const configDir = path.join(dir, ".orchestra")
    yield* FSUtil.use.writeWithDirs(path.join(configDir, "orchestra.json"), JSON.stringify({}))

    const directories = yield* Config.Service.use((svc) =>
      svc.get().pipe(Effect.andThen(svc.waitForDependencies()), Effect.andThen(svc.directories())),
    ).pipe(provideInstanceEffect(dir))

    expect(directories).toContain(configDir)
    expect(npmCalls).toEqual([])
    expect(yield* FSUtil.use.readFileString(path.join(configDir, ".gitignore"))).toContain("node_modules")
    expect(yield* FSUtil.use.existsSafe(path.join(configDir, "node_modules"))).toBe(false)
    expect(yield* FSUtil.use.existsSafe(path.join(configDir, "package.json"))).toBe(false)
  }).pipe(Effect.provide(testInstanceStoreLayer)),
)
