import { expect, test } from "bun:test"
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"

const cli = path.resolve(import.meta.dirname, "..")
const root = path.resolve(cli, "../..")

test("owned generator emits the live V2 config schema from either working directory", async () => {
  const home = await mkdtemp(path.join(tmpdir(), "orchestra-schema-"))
  try {
    await Promise.all(["config", "data", "cache", "state", "tmp"].map((dir) => mkdir(path.join(home, dir))))
    const env = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => !/^(ORCHESTRA_|XDG_|HOME$|USERPROFILE$|APPDATA$|LOCALAPPDATA$)/.test(key),
        ),
      ),
      HOME: home,
      USERPROFILE: home,
      APPDATA: home,
      LOCALAPPDATA: home,
      TMPDIR: path.join(home, "tmp"),
      TMP: path.join(home, "tmp"),
      TEMP: path.join(home, "tmp"),
      XDG_CONFIG_HOME: path.join(home, "config"),
      XDG_DATA_HOME: path.join(home, "data"),
      XDG_CACHE_HOME: path.join(home, "cache"),
      XDG_STATE_HOME: path.join(home, "state"),
      ORCHESTRA_TEST_HOME: home,
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: path.join(home, "bun-transpiler-cache"),
      HTTP_PROXY: "http://127.0.0.1:1",
      HTTPS_PROXY: "http://127.0.0.1:1",
    }
    const run = async (cwd: string, script: string, args: string[]) => {
      const child = Bun.spawn([process.execPath, "--bun", script, ...args], {
        cwd,
        env,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      })
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      return { stdout, stderr, code }
    }
    const output = path.join(home, "owned config schema.json")
    await Bun.write(output, "sentinel")
    for (const args of [[], [output, path.join(home, "extra.json")], [""]]) {
      const result = await run(root, "packages/cli/script/schema.ts", args)
      expect(result.code).toBe(2)
      expect(result.stderr.trim()).toBe("Usage: bun --bun packages/cli/script/schema.ts <output>")
      expect(result.stdout).toBe("")
      expect(await Bun.file(output).text()).toBe("sentinel")
      expect(await Bun.file(path.join(home, "extra.json")).exists()).toBe(false)
      for (const dir of ["config", "data", "cache", "state", "tmp"])
        expect(await readdir(path.join(home, dir))).toEqual([])
    }

    // Use the existing MCP SDK's actual draft-2020-12 validator, without a new dependency.
    const orchestra = createRequire(path.join(root, "packages/orchestra/package.json"))
    const sdk = createRequire(orchestra.resolve("@modelcontextprotocol/sdk/client/index.js"))
    const Ajv2020 = sdk("ajv/dist/2020.js").default
    const { Config } = await import("@orchestra/core/config")
    const { JsonSchema, Schema } = await import("effect")
    const document = Schema.toJsonSchemaDocument(Config.Info)
    const representative = {
      model: "local/test",
      agents: { worker: { model: "local/test", mode: "subagent", steps: 2 } },
      providers: { local: { name: "Local", models: { test: { name: "Test", limit: { context: 4096 } } } } },
      permissions: [{ action: "read", resource: "*", effect: "allow" }],
      plugins: ["example-plugin", { package: "another-plugin", options: { enabled: true } }],
    }
    for (const [cwd, script] of [
      [root, "packages/cli/script/schema.ts"],
      [cli, "script/schema.ts"],
    ]) {
      const result = await run(cwd, script, [output])
      expect(result).toEqual({ code: 0, stdout: "", stderr: "" })
      const emitted = await Bun.file(output).json()
      expect(emitted).toEqual({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        ...document.schema,
        $defs: document.definitions,
        allowComments: true,
        allowTrailingCommas: true,
      })
      const resolved = JsonSchema.resolveTopLevel$ref({
        dialect: "draft-2020-12",
        schema: emitted,
        definitions: emitted.$defs,
      })
      expect(resolved.schema).toHaveProperty("properties.agents")
      expect(resolved.schema).toHaveProperty("properties.providers")
      expect(resolved.schema).toHaveProperty("properties.permissions")
      expect(resolved.schema).toHaveProperty("properties.plugins")
      for (const key of ["agent", "provider", "permission", "plugin"])
        expect(resolved.schema).not.toHaveProperty(`properties.${key}`)
      expect(JSON.stringify(emitted)).not.toContain("https://models.dev/model-schema.json")
      const validate = new Ajv2020({ strict: false, validateFormats: false }).compile(emitted)
      expect(validate(representative)).toBe(true)
      expect(validate({ ...representative, agents: { worker: { steps: "wrong" } } })).toBe(false)
      expect(validate({ agent: {} })).toBe(false)
      const decode = Schema.decodeUnknownSync(Config.Info, { onExcessProperty: "error" })
      expect(decode(representative)).toMatchObject(representative)
      expect(() => decode({ ...representative, permissions: "allow" })).toThrow()
    }
    // Core's Global module creates directories on import; no app state should be written.
    for (const dir of ["config", "data", "cache", "state", "tmp"])
      expect(
        (await readdir(path.join(home, dir), { recursive: true, withFileTypes: true }))
          .filter((entry) => !entry.isDirectory())
          .map((entry) => path.join(dir, entry.name)),
      ).toEqual([])
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
