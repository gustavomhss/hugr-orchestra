import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir } from "node:fs/promises"
import { Effect } from "effect"
import { Arborist } from "@npmcli/arborist"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { Global } from "../src/global"
import { Npm } from "../src/npm"
import { tmpdir } from "./fixture/tmpdir"
import { planted, registry, sdk } from "./fixture/sdk-registry"

const forms = ["direct", "transitive", "two-depths", "alias", "peer", "optional", "ranges", "bundled"] as const

for (const form of forms) for (const warm of [false, true]) {
  test(`SDK closure ${form} ${warm ? "warm" : "cold"}: real registry keeps ordinary deps functional`, async () => {
    await using tmp = await tmpdir()
    await using http = await registry(tmp.path)
    const alias = form === "alias" ? "sdk-alias" : sdk.name
    const request = form === "alias" ? `npm:${sdk.name}@^${sdk.version}` : `^${sdk.version}`
    const consumer = {
      [form === "peer" ? "peerDependencies" : form === "optional" ? "optionalDependencies" : "dependencies"]: { [alias]: request },
    }
    await http.publish(sdk.name, { exports: { ".": "./index.js", "./*": "./index.js" } }, { "index.js": planted })
    await http.publish("ordinary")
    await http.publish("consumer", form === "bundled" ? { ...consumer, bundledDependencies: [sdk.name] } : consumer,
      form === "bundled" ? {
        "node_modules/@orchestra/plugin/package.json": JSON.stringify({ ...sdk, exports: { ".": "./index.js", "./*": "./index.js" }, dependencies: {} }),
        "node_modules/@orchestra/plugin/index.js": planted,
      } : {})
    await http.publish("middle", { dependencies: { consumer: sdk.version } })
    const project = path.join(tmp.path, "project")
    await mkdir(project)
    await http.config(project)
    const root = { name: "fixture", version: "1.0.0", private: true, dependencies: {
      ordinary: sdk.version,
      ...(form === "transitive" || form === "two-depths" || form === "bundled" ? { [form === "two-depths" ? "middle" : "consumer"]: sdk.version } : consumer.dependencies ?? {}),
      ...(form === "ranges" ? { consumer: sdk.version, [sdk.name]: ">=1.0.0 <2.0.0" } : {}),
    },
      ...(form === "peer" || form === "optional" ? consumer : {}),
    }
    await Bun.write(path.join(project, "package.json"), JSON.stringify(root))
    if (warm) {
      await new Arborist({ path: project, registry: http.url, cache: path.join(tmp.path, "npm-cache"), ignoreScripts: true, audit: false }).reify()
      http.hits.length = 0
    }
    await Npm.install(project)
    const ordinary = await import(path.join(project, "node_modules", "ordinary", "index.js"))
    expect(ordinary.ordinary).toBe(42)
    if (!warm) {
      expect(http.hits).toContain("ordinary")
      expect(http.hits).toContain("tarballs/ordinary.tgz")
    }
    expect(http.hits.filter((hit) => hit === sdk.name || hit === `tarballs/${sdk.name}.tgz`)).toEqual([])
    const modules = form === "bundled" ? path.join(project, "node_modules", "consumer", "node_modules") : path.join(project, "node_modules")
    const installed = await Bun.file(path.join(modules, alias, "package.json")).json()
    expect(installed.name).toBe(sdk.name)
    expect(installed.version).toBe(sdk.version)
    expect(installed.dependencies ?? {}).toEqual({})
    expect(Object.keys(installed.exports)).toEqual(Object.keys(sdk.exports))
    expect(await Bun.file(path.join(modules, alias, "index.js")).text()).not.toContain("planted SDK copy ran")
  }, 60_000)
}

test("warm Npm.add reconciles nested SDK copies before cache return", async () => {
  await using tmp = await tmpdir()
  await using http = await registry(tmp.path)
  await http.publish(sdk.name, { exports: { ".": "./index.js", "./*": "./index.js" } }, { "index.js": planted })
  await http.publish("ordinary")
  await http.publish("consumer", { dependencies: { [sdk.name]: sdk.version, ordinary: sdk.version } })
  const cache = path.join(tmp.path, "cache")
  const directory = path.join(cache, "packages", `consumer@${sdk.version}`)
  await mkdir(directory, { recursive: true })
  await http.config(directory)
  await new Arborist({ path: directory, registry: http.url, cache: path.join(tmp.path, "npm-cache"), ignoreScripts: true, audit: false }).reify({ add: [`consumer@${sdk.version}`], save: true })
  http.hits.length = 0
  const entry = await Effect.gen(function* () {
    const npm = yield* Npm.Service
    return yield* npm.add(`consumer@${sdk.version}`)
  }).pipe(Effect.scoped, Effect.provide(AppNodeBuilder.build(Npm.node, [[Global.node, Global.layerWith({ cache, state: path.join(cache, "state") })]])), Effect.runPromise)
  expect(entry.directory).toBe(path.join(directory, "node_modules", "consumer"))
  expect(http.hits.filter((hit) => hit.includes(sdk.name))).toEqual([])
  const installed = await Bun.file(path.join(directory, "node_modules", sdk.name, "package.json")).json()
  expect(installed.dependencies ?? {}).toEqual({})
  expect(Object.keys(installed.exports)).toEqual(Object.keys(sdk.exports))
})

test("unsupported SDK range fails locally with named error and no SDK registry request", async () => {
  await using tmp = await tmpdir()
  await using http = await registry(tmp.path)
  await http.publish(sdk.name)
  await http.config(tmp.path)
  await Bun.write(path.join(tmp.path, "package.json"), JSON.stringify({ dependencies: { [sdk.name]: "999.0.0" } }))
  const result = await Npm.install(tmp.path).then(() => "unexpected success", (error: unknown) => String(error))
  expect(result).toContain("PluginSdkVersionError")
  expect(http.hits.filter((hit) => hit.includes(sdk.name))).toEqual([])
})

test("fixture control without adapter observes SDK metadata, tarball and planted evaluation", async () => {
  await using tmp = await tmpdir()
  await using http = await registry(tmp.path)
  await http.publish(sdk.name, { exports: { ".": "./index.js", "./*": "./index.js" } }, { "index.js": planted })
  await Bun.write(path.join(tmp.path, "package.json"), JSON.stringify({ dependencies: { [sdk.name]: sdk.version } }))
  await new Arborist({ path: tmp.path, registry: http.url, cache: path.join(tmp.path, "npm-cache"), ignoreScripts: true, audit: false }).reify()
  expect(http.hits).toContain(sdk.name)
  expect(http.hits).toContain(`tarballs/${sdk.name}.tgz`)
  await expect(import(path.join(tmp.path, "node_modules", sdk.name, "index.js"))).rejects.toThrow("planted SDK copy ran")
})
