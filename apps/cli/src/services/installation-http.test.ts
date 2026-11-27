import { afterEach, expect, test } from "bun:test"
import { NodeServices } from "@effect/platform-node"
import { Effect, Exit, Option } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { Commands } from "../commands/commands"
import { InstallationHttp } from "./installation-http"

const directories: string[] = []
const origin = "http://127.0.0.1:8079"

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

async function fixture(source: string, extension = ".mjs", parent = tmpdir()) {
  const directory = await mkdtemp(path.join(parent, "orchestra-installation-"))
  directories.push(directory)
  const file = path.join(directory, `local installation${extension}`)
  await Bun.write(file, source)
  return file
}

async function rejection(file: string) {
  const result = await Effect.runPromise(InstallationHttp.load(file, { origin }).pipe(Effect.result))
  expect(result._tag).toBe("Failure")
  if (result._tag !== "Failure") throw new Error("Expected loader rejection")
  expect(result.failure).toBeInstanceOf(Error)
  return result.failure
}

for (const extension of [".ts", ".mts", ".js", ".mjs"]) {
  test(`loads an absolute ${extension} module once with the supplied origin and preserves dispose binding`, async () => {
    const file = await fixture(`
      export const state = { calls: 0, disposed: 0, context: undefined }
      export default async function(context) {
        state.calls++
        state.context = context
        return {
          mount: "/installation",
          disposed: 0,
          async handler(request) { return new Response(context.origin + new URL(request.url).pathname) },
          async dispose() { this.disposed++; state.disposed = this.disposed }
        }
      }
    `, extension)
    const loaded = await Effect.runPromise(InstallationHttp.load(file, { origin }))
    const module = await import(pathToFileURL(file).href)
    expect(module.state.calls).toBe(1)
    expect(module.state.context).toEqual({ origin })
    expect(loaded.mount).toBe("/installation")
    expect(await (await loaded.handler(new Request(`${origin}/installation/status`)))?.text()).toBe(`${origin}/installation/status`)
    await loaded.dispose()
    expect(module.state.disposed).toBe(1)
  })
}

test("a trusted non-loopback origin is passed unchanged by the generic loader", async () => {
  const file = await fixture(`export default async ({ origin }) => ({
    mount: "/installation", handler: async () => new Response(origin), dispose: async () => {}
  })`)
  const loaded = await Effect.runPromise(InstallationHttp.load(file, { origin: "https://trusted.example.test" }))
  expect(await (await loaded.handler(new Request(`${origin}/installation`)))?.text()).toBe("https://trusted.example.test")
  await loaded.dispose()
})

test("rejects an existing relative module during path validation", async () => {
  // Keeping the fixture on the working directory's volume makes it relative on Windows too.
  const file = await fixture(`export default async () => ({
    mount: "/installation", handler: async () => undefined, dispose: async () => {}
  })`, ".mjs", process.cwd())
  const relative = path.relative(process.cwd(), file)
  expect(path.isAbsolute(relative)).toBe(false)
  expect(await Bun.file(relative).exists()).toBe(true)
  expect((await rejection(relative)).message).toContain("absolute local")
})

for (const file of ["https://example.test/installation.mjs", "http://127.0.0.1/installation.ts"]) {
  test(`rejects non-local module URL ${file} during path validation`, async () => {
    expect((await rejection(file)).message).toContain("absolute local")
  })
}

test.skipIf(process.platform !== "win32")("requires a drive-qualified Windows installation file", async () => {
  for (const file of ["/installation.mjs", "\\installation.mjs"]) {
    expect((await rejection(file)).message).toContain("absolute local")
  }
})

test("rejects an unsupported extension during path validation", async () => {
  const file = await fixture('{"valid":"JSON"}', ".json")
  expect((await rejection(file)).message).toContain("absolute local")
})

for (const source of ["export const handler = () => {}", "export default {}", "export default 42", "export default async () => null"]) {
  test(`rejects malformed factory: ${source}`, async () => {
    await rejection(await fixture(source))
  })
}

for (const descriptor of [
  '{ mount: "/installation", dispose: cleanup }',
  '{ mount: "/installation", handler: 42, dispose: cleanup }',
  '{ mount: "relative", handler, dispose: cleanup }',
  '{ mount: "/", handler, dispose: cleanup }',
  '{ mount: "/api", handler, dispose: cleanup }',
  '{ mount: "/api/nested", handler, dispose: cleanup }',
  '{ mount: "/API", handler, dispose: cleanup }',
  '{ mount: "/Api/Nested", handler, dispose: cleanup }',
  '{ mount: "/Experimental/project", handler, dispose: cleanup }',
  '{ mount: "/installation/../api", handler, dispose: cleanup }',
  '{ mount: "/installation?query", handler, dispose: cleanup }',
  '{ mount: "/installation#fragment", handler, dispose: cleanup }',
]) {
  test(`disposes a rejected descriptor once: ${descriptor}`, async () => {
    const file = await fixture(`
      export const state = { disposed: 0, bound: false }
      const handler = async () => undefined
      async function cleanup() { state.disposed++; state.bound = this.dispose === cleanup }
      export default async () => (${descriptor})
    `)
    await rejection(file)
    const module = await import(pathToFileURL(file).href)
    expect(module.state).toEqual({ disposed: 1, bound: true })
  })
}

test("rejects a descriptor without callable disposal", async () => {
  await rejection(await fixture('export default async () => ({ mount: "/installation", handler: async () => undefined, dispose: 42 })'))
})

for (const source of [
  'throw new Error("PRIVATE_PROVIDER_TOKEN", { cause: new Error("PRIVATE_PROVIDER_CAUSE") })',
  'export default async () => { throw new Error("PRIVATE_PROVIDER_TOKEN", { cause: new Error("PRIVATE_PROVIDER_CAUSE") }) }',
  'export default async () => ({ mount: "/api", handler: async () => undefined, async dispose() { throw new Error("PRIVATE_PROVIDER_TOKEN") } })',
]) {
  test("sanitizes module, factory, and cleanup failures", async () => {
    const error = await rejection(await fixture(source))
    expect(`${error.message}\n${error.stack}\n${JSON.stringify(error)}`).not.toContain("PRIVATE_PROVIDER")
    expect(error.cause).toBeUndefined()
  })
}

test("serve parses an explicit installation using its actual command specification", async () => {
  const inputs: unknown[] = []
  const command = Commands.commands.serve.spec.pipe(Command.withHandler((input) => Effect.sync(() => { inputs.push(input) })))
  const file = path.join(tmpdir(), "local installation.ts")
  await Effect.runPromise(Command.runWith(command, { version: "test" })([
    "--installation", file, "--hostname", "127.0.0.1", "--port", "8079",
  ]).pipe(Effect.provide(NodeServices.layer)))
  expect(inputs).toHaveLength(1)
  expect(inputs[0]).toMatchObject({ installation: Option.some(file), port: Option.some(8079), hostname: "127.0.0.1" })
})

test("serve leaves installation absent by default", async () => {
  const inputs: unknown[] = []
  const command = Commands.commands.serve.spec.pipe(Command.withHandler((input) => Effect.sync(() => { inputs.push(input) })))
  await Effect.runPromise(Command.runWith(command, { version: "test" })([]).pipe(Effect.provide(NodeServices.layer)))
  expect(inputs[0]).toMatchObject({ installation: Option.none(), port: Option.none() })
})

test("serve rejects --installation without a value before calling its handler", async () => {
  const inputs: unknown[] = []
  const command = Commands.commands.serve.spec.pipe(Command.withHandler((input) => Effect.sync(() => { inputs.push(input) })))
  const result = await Effect.runPromise(Command.runWith(command, { version: "test" })(["--installation"])
    .pipe(Effect.provide(NodeServices.layer), Effect.result))
  // A bare flag must never be treated as an absent installation and enter ordinary serve startup.
  expect(inputs).toEqual([])
  expect(result._tag).toBe("Failure")
})

async function lifecycleFixture() {
  return fixture(`
    export const state = { events: [], calls: 0, disposed: 0, origin: undefined }
    export default async ({ origin }) => {
      state.calls++
      state.events.push("factory")
      state.origin = origin
      return {
        mount: "/installation",
        handler: async () => new Response("installed"),
        async dispose() {
          if (this.mount !== "/installation") throw new Error("Lost disposal receiver")
          state.disposed++
          state.events.push("dispose")
        }
      }
    }
  `)
}

for (const listener of [
  { hostname: "127.0.0.1", port: 8079, origin: "http://127.0.0.1:8079" },
  { hostname: "localhost", port: 1, origin: "http://localhost:1" },
  { hostname: "::1", port: 65_535, origin: "http://[::1]:65535" },
]) {
  test(`serve initializes once before its startup continuation and disposes after shutdown at ${listener.origin}`, async () => {
    const { withInstallation } = await import("../commands/handlers/serve")
    const file = await lifecycleFixture()
    const module = await import(pathToFileURL(file).href)
    const result = await Effect.runPromise(withInstallation({
      hostname: listener.hostname, port: Option.some(listener.port), installation: Option.some(file), register: false,
    }, (extensions) => Effect.gen(function* () {
      expect(module.state.events).toEqual(["factory"])
      expect(extensions).toHaveLength(1)
      expect(extensions?.[0].mount).toBe("/installation")
      expect(module.state.disposed).toBe(0)
      // The production continuation contains migration, binding, and the shutdown wait in this scope.
      module.state.events.push("migration", "bind")
      yield* Effect.addFinalizer(() => Effect.sync(() => { module.state.events.push("listener-close") }))
      return "shutdown"
    })))
    expect(result).toBe("shutdown")
    expect(module.state.calls).toBe(1)
    expect(module.state.disposed).toBe(1)
    expect(module.state.origin).toBe(listener.origin)
    expect(module.state.events).toEqual(["factory", "migration", "bind", "listener-close", "dispose"])
  })
}

for (const failure of ["migration", "bind"]) {
  test(`serve disposes exactly once when ${failure} fails at startup`, async () => {
    const { withInstallation } = await import("../commands/handlers/serve")
    const file = await lifecycleFixture()
    const module = await import(pathToFileURL(file).href)
    const result = await Effect.runPromise(withInstallation({
      hostname: "127.0.0.1", port: Option.some(8079), installation: Option.some(file), register: false,
    }, () => Effect.gen(function* () {
      expect(module.state.events).toEqual(["factory"])
      module.state.events.push(failure)
      return yield* Effect.fail(new Error(`${failure} failed`))
    })).pipe(Effect.result))
    expect(result._tag).toBe("Failure")
    expect(module.state.calls).toBe(1)
    expect(module.state.disposed).toBe(1)
    expect(module.state.events).toEqual(["factory", failure, "dispose"])
  })
}

test("serve disposes once when its lifetime is interrupted", async () => {
  const { withInstallation } = await import("../commands/handlers/serve")
  const file = await lifecycleFixture()
  const module = await import(pathToFileURL(file).href)
  const result = await Effect.runPromise(withInstallation({
    hostname: "127.0.0.1", port: Option.some(8079), installation: Option.some(file), register: false,
  }, () => Effect.gen(function* () {
    module.state.events.push("startup")
    return yield* Effect.interrupt
  })).pipe(Effect.exit))
  expect(Exit.hasInterrupts(result)).toBe(true)
  expect(module.state.calls).toBe(1)
  expect(module.state.disposed).toBe(1)
  expect(module.state.events).toEqual(["factory", "startup", "dispose"])
})

for (const port of [Option.none<number>(), ...[0, -1, 65_536, 1.5, NaN, Infinity].map(Option.some)]) {
  test(`serve rejects invalid installation port ${Option.getOrUndefined(port)} before factory or startup`, async () => {
    const { withInstallation } = await import("../commands/handlers/serve")
    const file = await lifecycleFixture()
    const module = await import(pathToFileURL(file).href)
    const result = await Effect.runPromise(withInstallation({
      hostname: "127.0.0.1", port, installation: Option.some(file), register: false,
    }, () => Effect.die("Startup must not run")).pipe(Effect.result))
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.message).toContain("explicit port")
    expect(module.state.events).toEqual([])
  })
}

for (const hostname of ["0.0.0.0", "::", "192.168.1.2", "example.test", "127.0.0.1.example.test"]) {
  test(`serve rejects non-loopback installation hostname ${hostname} before factory or startup`, async () => {
    const { withInstallation } = await import("../commands/handlers/serve")
    const file = await lifecycleFixture()
    const module = await import(pathToFileURL(file).href)
    const result = await Effect.runPromise(withInstallation({
      hostname, port: Option.some(8079), installation: Option.some(file), register: false,
    }, () => Effect.die("Startup must not run")).pipe(Effect.result))
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.message).toContain("loopback")
    expect(module.state.events).toEqual([])
  })
}

for (const installation of [undefined, Option.none<string>()]) {
  test("serve without installation keeps its original bind defaults and supplies no extensions", async () => {
    const { withInstallation } = await import("../commands/handlers/serve")
    expect(await Effect.runPromise(withInstallation({
      hostname: "0.0.0.0", port: Option.none(), installation, register: false,
    }, (extensions) => Effect.sync(() => {
      expect(extensions).toBeUndefined()
      return "unchanged"
    })))).toBe("unchanged")
  })
}

test("serve does not enter startup when the installation factory fails", async () => {
  const { withInstallation } = await import("../commands/handlers/serve")
  const file = await fixture('export default async () => { throw new Error("PRIVATE_STARTUP_TOKEN") }')
  const result = await Effect.runPromise(withInstallation({
    hostname: "127.0.0.1", port: Option.some(8079), installation: Option.some(file), register: false,
  }, () => Effect.die("Startup must not run")).pipe(Effect.result))
  expect(result._tag).toBe("Failure")
  if (result._tag === "Failure") expect(result.failure.message).not.toContain("PRIVATE_STARTUP_TOKEN")
})

test("serve disposes when startup throws a defect", async () => {
  const { withInstallation } = await import("../commands/handlers/serve")
  const file = await lifecycleFixture()
  const module = await import(pathToFileURL(file).href)
  const result = await Effect.runPromise(withInstallation({
    hostname: "127.0.0.1", port: Option.some(8079), installation: Option.some(file), register: false,
  }, () => Effect.sync(() => {
    module.state.events.push("startup")
    throw new Error("Listener construction failed")
  })).pipe(Effect.exit))
  expect(Exit.hasDies(result)).toBe(true)
  expect(module.state.calls).toBe(1)
  expect(module.state.disposed).toBe(1)
  expect(module.state.events).toEqual(["factory", "startup", "dispose"])
})

for (const args of [["--config"], ["-c"], ["--config", "--verbose"]]) {
  test(`optional string flag requires a value: ${args.join(" ")}`, async () => {
    const inputs: unknown[] = []
    const command = Command.make("sample", {
      config: Flag.string("config").pipe(Flag.withAlias("c"), Flag.optional),
      verbose: Flag.boolean("verbose"),
    }).pipe(Command.withHandler((input) => Effect.sync(() => { inputs.push(input) })))
    const result = await Effect.runPromise(Command.runWith(command, { version: "test" })(args)
      .pipe(Effect.provide(NodeServices.layer), Effect.result))
    expect(inputs).toEqual([])
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure).toMatchObject({
      _tag: "ShowHelp",
      errors: [{ _tag: "InvalidValue", option: "config", value: "", expected: "a value after the option", kind: "flag" }],
    })
  })
}

for (const entry of [
  { args: ["child", "--config"] },
  { args: ["child", "-c"] },
  { args: ["--config", "--verbose", "child"] },
  { args: ["--config", "before.json", "child"], config: "before.json", verbose: false },
  { args: ["child", "-c", "after.json", "--verbose"], config: "after.json", verbose: true },
]) {
  test(`inherited optional string flag handles ${entry.args.join(" ")}`, async () => {
    const inputs: unknown[] = []
    const parent = Command.make("parent").pipe(Command.withSharedFlags({
      config: Flag.string("config").pipe(Flag.withAlias("c"), Flag.optional),
      verbose: Flag.boolean("verbose"),
    }))
    const child = Command.make("child").pipe(Command.withHandler(() => Effect.gen(function* () {
      const input = yield* parent
      inputs.push(input)
    })))
    const command = parent.pipe(Command.withSubcommands([child]))
    const result = await Effect.runPromise(Command.runWith(command, { version: "test" })(entry.args)
      .pipe(Effect.provide(NodeServices.layer), Effect.result))
    if (entry.config !== undefined) {
      expect(result._tag).toBe("Success")
      expect(inputs).toMatchObject([{ config: Option.some(entry.config), verbose: entry.verbose }])
      return
    }
    expect(inputs).toEqual([])
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure).toMatchObject({
      _tag: "ShowHelp",
      errors: [{ _tag: "InvalidValue", option: "config", value: "", expected: "a value after the option", kind: "flag" }],
    })
  })
}

for (const entry of [
  { args: [], config: Option.none<string>(), verbose: false },
  { args: ["--verbose"], config: Option.none<string>(), verbose: true },
  { args: ["--config", "settings.json"], config: Option.some("settings.json"), verbose: false },
  { args: ["-c", "settings.json", "--verbose"], config: Option.some("settings.json"), verbose: true },
  { args: ["--config=settings.json"], config: Option.some("settings.json"), verbose: false },
]) {
  test(`valid optional string and boolean semantics remain: ${entry.args.join(" ") || "omitted"}`, async () => {
    const inputs: unknown[] = []
    const command = Command.make("sample", {
      config: Flag.string("config").pipe(Flag.withAlias("c"), Flag.optional),
      verbose: Flag.boolean("verbose"),
    }).pipe(Command.withHandler((input) => Effect.sync(() => { inputs.push(input) })))
    await Effect.runPromise(Command.runWith(command, { version: "test" })(entry.args)
      .pipe(Effect.provide(NodeServices.layer)))
    expect(inputs).toEqual([{ config: entry.config, verbose: entry.verbose }])
  })
}
