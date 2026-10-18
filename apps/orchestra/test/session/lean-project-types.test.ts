import { test } from "bun:test"
import path from "node:path"
import { OpenApi } from "effect/unstable/httpapi"
import { PublicApi } from "../../src/server/routes/instance/httpapi/public"

test("actual Lean Orchestra and SDK package typechecks run in CI", async () => {
  if (!process.env.GITHUB_RUN_ID) throw new Error("Package typechecks require CI")
  const spec = OpenApi.fromApi(PublicApi) as { components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> } }
  for (const [name, fields] of [["LeanProfileSavings", ["calls", "tokenCalls"]], ["LeanProfileExecution", ["time"]]] as const) {
    for (const field of fields) {
      const property = spec.components?.schemas?.[name]?.properties?.[field]
      console.log(`LEAN_NUMERIC_OPENAPI ${name}.${field} ${JSON.stringify(property)}`)
      // The evidence line alone printed "undefined" for a lost field and passed.
      if (property === undefined) throw new Error(`${name}.${field} missing from the public OpenAPI`)
    }
  }
  console.log(`LEAN_NONNEGATIVE_OPENAPI ${JSON.stringify(spec.components?.schemas?.NonNegativeInt)}`)
  for (const [directory, relative] of [["orchestra", "../.."], ["sdk/js", "../../../../packages/sdk/js"]] as const) {
    const proc = Bun.spawn(["bun", "typecheck"], {
      cwd: path.resolve(import.meta.dir, relative), stdout: "pipe", stderr: "pipe", timeout: 240000,
    })
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
    if (code !== 0) throw new Error(`${directory} typecheck exited ${code}/${proc.signalCode}\n${stdout}\n${stderr}`)
  }
}, 600000)
