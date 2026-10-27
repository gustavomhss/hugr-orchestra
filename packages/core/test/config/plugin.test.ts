import path from "path"
import { cp, mkdir, realpath, symlink } from "fs/promises"
import { afterAll, beforeAll, describe, expect } from "bun:test"
import { Effect, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Config } from "@orchestra/core/config"
import { ConfigExternalPlugin } from "@orchestra/core/config/plugin/external"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { Npm } from "@orchestra/core/npm"
import { PluginV2 } from "@orchestra/core/plugin"
import { PluginHost } from "@orchestra/core/plugin/host"
import { AbsolutePath } from "@orchestra/core/schema"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "../plugin/fixture"

const it = testEffect(PluginTestLayer)
const decode = Schema.decodeUnknownSync(Config.Info)

// Admission writes SDK bridges into a plugin's source envelope and into absent ancestor namespaces, so the
// fixtures run from a temporary tree, never the checkout. Only the Effect plugin gets `effect` installed beside
// it, like a real plugin: admitting that link inventories its installed namespaces and takes seconds.
const tmp = tmpdir()
const staged = { root: "" }
const dir = () => path.join(staged.root, "config")
// The fixtures stand for the user's own config, so the staged root is the global config folder.
const userHome = () => Global.Service.of(Global.make({ config: staged.root }))

beforeAll(async () => {
  staged.root = (await tmp).path
  await cp(path.join(import.meta.dir, "../plugin/fixtures"), path.join(staged.root, "plugin", "fixtures"), { recursive: true })
  await cp(path.join(import.meta.dir, "fixtures"), path.join(dir(), "fixtures"), { recursive: true })
  await mkdir(path.join(staged.root, "effect", "node_modules"), { recursive: true })
  await cp(
    path.join(import.meta.dir, "../plugin/fixtures/config-effect-plugin.ts"),
    path.join(staged.root, "effect", "config-effect-plugin.ts"),
  )
  await symlink(
    // Resolve rather than assume packages/core/node_modules/effect: the Windows install hoists it elsewhere.
    await realpath(path.dirname(Bun.resolveSync("effect/package.json", import.meta.dir))),
    path.join(staged.root, "effect", "node_modules", "effect"),
    "junction",
  )
})

afterAll(async () => {
  await (await tmp)[Symbol.asyncDispose]()
})

describe("ConfigExternalPlugin", () => {
  it.live("resolves and loads a configured Promise plugin with options", () =>
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const agents = yield* AgentV2.Service
      const fs = yield* FSUtil.Service
      const location = yield* Location.Service
      const npm = yield* Npm.Service
      const host = yield* PluginHost.make(plugins)
      const document = path.join(dir(), "orchestra.json")

      yield* ConfigExternalPlugin.Plugin.effect(host).pipe(
        Effect.provideService(PluginV2.Service, plugins),
        Effect.provideService(FSUtil.Service, fs),
        Effect.provideService(Location.Service, location),
        Effect.provideService(Npm.Service, npm),
        Effect.provideService(Global.Service, userHome()),
        Effect.provideService(
          Config.Service,
          Config.Service.of({
            entries: () =>
              Effect.succeed([
                new Config.Document({
                  type: "document",
                  path: document,
                  info: decode({
                    plugins: [
                      {
                        package: "../plugin/fixtures/config-promise-plugin.ts",
                        options: { description: "Loaded from config" },
                      },
                    ],
                  }),
                }),
              ]),
          }),
        ),
      )

      expect(yield* waitForAgent(agents, "configured")).toMatchObject({
        description: "Loaded from config",
        mode: "subagent",
      })
    }),
  )

  it.live("loads a configured Effect plugin with options", () =>
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const agents = yield* AgentV2.Service
      const fs = yield* FSUtil.Service
      const location = yield* Location.Service
      const npm = yield* Npm.Service
      const host = yield* PluginHost.make(plugins)

      yield* ConfigExternalPlugin.Plugin.effect(host).pipe(
        Effect.provideService(PluginV2.Service, plugins),
        Effect.provideService(FSUtil.Service, fs),
        Effect.provideService(Location.Service, location),
        Effect.provideService(Npm.Service, npm),
        Effect.provideService(Global.Service, userHome()),
        Effect.provideService(
          Config.Service,
          Config.Service.of({
            entries: () =>
              Effect.succeed([
                new Config.Document({
                  type: "document",
                  path: path.join(dir(), "orchestra.json"),
                  info: decode({
                    plugins: [
                      {
                        package: "../effect/config-effect-plugin.ts",
                        options: { description: "Effect plugin from config" },
                      },
                    ],
                  }),
                }),
              ]),
          }),
        ),
      )

      expect(yield* waitForAgent(agents, "effect-configured")).toMatchObject({
        description: "Effect plugin from config",
        mode: "subagent",
      })
    }),
  )

  it.live("ignores invalid plugins and continues loading", () =>
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const agents = yield* AgentV2.Service
      const fs = yield* FSUtil.Service
      const location = yield* Location.Service
      const npm = yield* Npm.Service
      const host = yield* PluginHost.make(plugins)

      yield* ConfigExternalPlugin.Plugin.effect(host).pipe(
        Effect.provideService(PluginV2.Service, plugins),
        Effect.provideService(FSUtil.Service, fs),
        Effect.provideService(Location.Service, location),
        Effect.provideService(Npm.Service, npm),
        Effect.provideService(Global.Service, userHome()),
        Effect.provideService(
          Config.Service,
          Config.Service.of({
            entries: () =>
              Effect.succeed([
                new Config.Document({
                  type: "document",
                  path: path.join(dir(), "orchestra.json"),
                  info: decode({
                    plugins: [
                      "../plugin/fixtures/missing-plugin.ts",
                      "../plugin/fixtures/invalid-plugin.ts",
                      {
                        package: "../plugin/fixtures/config-promise-plugin.ts",
                        options: { description: "Loaded after invalid plugins" },
                      },
                    ],
                  }),
                }),
              ]),
          }),
        ),
      )

      expect(yield* waitForAgent(agents, "configured")).toMatchObject({
        description: "Loaded after invalid plugins",
      })
    }),
  )

  it.live("installs and resolves npm plugin packages", () =>
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const agents = yield* AgentV2.Service
      const fs = yield* FSUtil.Service
      const location = yield* Location.Service
      const host = yield* PluginHost.make(plugins)
      let installed: string | undefined
      const npm = Npm.Service.of({
        add: (spec) =>
          Effect.sync(() => {
            installed = spec
            return {
              directory: dir(),
              entrypoint: path.join(dir(), "../plugin/fixtures/config-promise-plugin.ts"),
            }
          }),
        install: () => Effect.void,
        which: () => Effect.succeed(undefined),
      })

      yield* ConfigExternalPlugin.Plugin.effect(host).pipe(
        Effect.provideService(PluginV2.Service, plugins),
        Effect.provideService(FSUtil.Service, fs),
        Effect.provideService(Location.Service, location),
        Effect.provideService(Npm.Service, npm),
        Effect.provideService(Global.Service, userHome()),
        Effect.provideService(
          Config.Service,
          Config.Service.of({
            entries: () =>
              Effect.succeed([
                new Config.Document({
                  type: "document",
                  info: decode({
                    plugins: [
                      {
                        package: "example-plugin@1.0.0",
                        options: { description: "Installed from npm" },
                      },
                    ],
                  }),
                }),
              ]),
          }),
        ),
      )

      expect(yield* waitForAgent(agents, "configured")).toMatchObject({
        description: "Installed from npm",
      })
      expect(installed).toBe("example-plugin@1.0.0")
    }),
  )

  it.live("loads plugin files from config directories", () =>
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const agents = yield* AgentV2.Service
      const fs = yield* FSUtil.Service
      const location = yield* Location.Service
      const npm = yield* Npm.Service
      const host = yield* PluginHost.make(plugins)

      yield* ConfigExternalPlugin.Plugin.effect(host).pipe(
        Effect.provideService(PluginV2.Service, plugins),
        Effect.provideService(FSUtil.Service, fs),
        Effect.provideService(Location.Service, location),
        Effect.provideService(Npm.Service, npm),
        Effect.provideService(Global.Service, userHome()),
        Effect.provideService(
          Config.Service,
          Config.Service.of({
            entries: () =>
              Effect.succeed([
                new Config.Directory({
                  type: "directory",
                  path: AbsolutePath.make(path.join(dir(), "fixtures")),
                }),
              ]),
          }),
        ),
      )

      expect(yield* waitForAgent(agents, "directory")).toMatchObject({
        description: "Loaded from plugin directory",
        mode: "subagent",
      })
    }),
  )

  // The user's own config is `<root>/home`; the project documents sit outside it, so they are the repository's.
  const runWith = Effect.fnUntraced(function* (entries: (directory: string) => Config.Entry[]) {
    const plugins = yield* PluginV2.Service
    const fs = yield* FSUtil.Service
    const location = yield* Location.Service
    const npm = yield* Npm.Service
    const host = yield* PluginHost.make(plugins)
    yield* ConfigExternalPlugin.Plugin.effect(host).pipe(
      Effect.provideService(PluginV2.Service, plugins),
      Effect.provideService(FSUtil.Service, fs),
      Effect.provideService(Location.Service, location),
      Effect.provideService(Npm.Service, npm),
      Effect.provideService(Global.Service, Global.Service.of(Global.make({ config: path.join(staged.root, "home") }))),
      Effect.provideService(Config.Service, Config.Service.of({ entries: () => Effect.succeed(entries(location.directory)) })),
    )
  })

  const project = (info: Record<string, unknown>) =>
    new Config.Document({ type: "document", path: path.join(dir(), "orchestra.json"), info: decode(info) })
  const user = (info: Record<string, unknown>) =>
    new Config.Document({ type: "document", path: path.join(staged.root, "home", "orchestra.json"), info: decode(info) })
  const promisePlugin = { plugins: [{ package: "../plugin/fixtures/config-promise-plugin.ts" }] }
  const effectPlugin = { plugins: [{ package: "../effect/config-effect-plugin.ts" }] }

  it.live("does not import an untrusted project's plugins, even when the project trusts itself", () =>
    Effect.gen(function* () {
      const agents = yield* AgentV2.Service
      yield* runWith((directory) => [
        // Project entries come first: if they loaded, they would register before the user's plugin does.
        project({ ...promisePlugin, trusted_projects: [directory] }),
        new Config.Directory({ type: "directory", path: AbsolutePath.make(path.join(dir(), "fixtures")) }),
        user(effectPlugin),
      ])

      // The user's plugin is the last one in line, so by the time it is up the project's would have been.
      expect(yield* waitForAgent(agents, "effect-configured")).toBeDefined()
      expect(yield* agents.get(AgentV2.ID.make("configured"))).toBeUndefined()
      expect(yield* agents.get(AgentV2.ID.make("directory"))).toBeUndefined()
    }),
  )

  it.live("imports a project's plugins once the user's config trusts the project", () =>
    Effect.gen(function* () {
      const agents = yield* AgentV2.Service
      yield* runWith((directory) => [
        user({ trusted_projects: [directory] }),
        project(promisePlugin),
        new Config.Directory({ type: "directory", path: AbsolutePath.make(path.join(dir(), "fixtures")) }),
      ])

      expect(yield* waitForAgent(agents, "configured")).toBeDefined()
      expect(yield* waitForAgent(agents, "directory")).toBeDefined()
    }),
  )
})

const waitForAgent = Effect.fnUntraced(function* (agents: AgentV2.Interface, id: string) {
  // SDK admission runs before each import; allow it up to 20 s, inside the package's 30 s test timeout.
  for (let attempt = 0; attempt < 2000; attempt++) {
    const agent = yield* agents.get(AgentV2.ID.make(id))
    if (agent) return agent
    yield* Effect.sleep("10 millis")
  }
  return yield* Effect.die(`Timed out waiting for agent ${id}`)
})
