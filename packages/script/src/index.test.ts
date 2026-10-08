import { expect, test } from "bun:test"
import semver from "semver"
import pkg from "../../orchestra/package.json" with { type: "json" }

async function load(version = "") {
  const child = Bun.spawn([process.execPath, "--eval", `const { Script } = await import('./src/index.ts'); console.log('VERSION_RESULT:'+JSON.stringify({version:Script.version,channel:Script.channel,preview:Script.preview}))`], {
    cwd: `${import.meta.dir}/..`,
    env: { ...process.env, ORCHESTRA_CHANNEL: "dev", ORCHESTRA_VERSION: version, ORCHESTRA_BUMP: "", ORCHESTRA_RELEASE: "" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const text = await new Response(child.stdout).text()
  expect(await child.exited).toBe(0)
  const line = text.split("\n").find(line => line.startsWith("VERSION_RESULT:"))
  expect(line).toBeDefined()
  return JSON.parse(line!.slice("VERSION_RESULT:".length)) as { version: string; channel: string; preview: boolean }
}

test("preview builds identify their actual source release for provider compatibility", async () => {
  const result = await load()
  expect(result.channel).toBe("dev")
  expect(result.preview).toBe(true)
  expect(result.version).toMatch(new RegExp(`^${pkg.version.replaceAll(".", "\\.")}-dev-[0-9]{12}$`))
  expect(semver.valid(result.version)).toBe(result.version)
  expect(semver.gte(result.version, "1.18.0")).toBe(true)
})

test("explicit preview and release versions remain exact", async () => {
  expect((await load("0.0.0-explicit-preview")).version).toBe("0.0.0-explicit-preview")
  expect((await load("1.20.0")).version).toBe("1.20.0")
})
