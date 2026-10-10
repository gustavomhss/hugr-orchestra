import { expect, test } from "bun:test"
import path from "node:path"
import { readdir, rm } from "node:fs/promises"
import { createRequire } from "node:module"

test("Lean production visual captures exist with native identity manifests", async () => {
  if (!process.env.CI && !process.env.GITHUB_RUN_ID) throw new Error("Lean visual build and Chromium require CI")
  const app = path.resolve(import.meta.dir, "..")
  const out = path.join(app, "e2e/test-results/lean-visual")
  await rm(out, { recursive: true, force: true })
  const cli = createRequire(import.meta.path).resolve("@playwright/test/cli")
  async function run(args: string[]) {
    const proc = Bun.spawn(["node", cli, ...args], { cwd: app, env: { ...process.env, PLAYWRIGHT_PORT: "5121" }, stdout: "pipe", stderr: "pipe", timeout: 900000 })
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
    console.log(stdout)
    if (stderr) console.error(stderr)
    if (code !== 0 || proc.signalCode) throw new Error(`Playwright ${args.join(" ")} exited ${code}/${proc.signalCode}`)
  }
  await run(["install", "--with-deps", "chromium"])
  await run(["test", "--config", "e2e/orchestra-screenshots/playwright.config.ts", "lean.visual.ts", "--grep", "Lean production shell", "--project", "chromium"])
  const names = ["tool--dark", "context--dark", "settings--dark", "tool--light"].map((name) => `lean-${name}-pt-BR--1672x941`)
  expect((await readdir(out)).sort()).toEqual(names.flatMap((name) => [`${name}.png`, `${name}.json`]).sort())
  for (const name of names) {
    const png = Buffer.from(await Bun.file(path.join(out, `${name}.png`)).arrayBuffer())
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(png.length).toBeGreaterThan(10000)
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1672, 941])
    const manifest = await Bun.file(path.join(out, `${name}.json`)).json()
    expect(manifest.file).toBe(`${name}.png`)
    expect(manifest.source).toContain("production build, prod channel")
    expect(manifest.facts.locale).toBe("pt-BR")
    expect(manifest.facts.logoLoaded).toBe(true)
    expect(manifest.facts.sidebarWidth).toBe(230)
    expect(manifest.demo).toContain("Synthetic public")
  }
}, 1500000)
