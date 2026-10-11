import { expect, test } from "bun:test"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { readdir, rm } from "node:fs/promises"

const app = path.resolve(import.meta.dir, "..")
const out = path.join(app, "e2e/test-results/lean-visual")
const files = ["dashboard-dark.png", "detail-dark.png", "frameworks-dark.png", "dashboard-light.png", "profileB-dark.png"].sort()

async function run(args: string[], env = process.env) {
  const child = Bun.spawn([process.execPath, ...args], { cwd: app, env, stdout: "pipe", stderr: "pipe", timeout: 900000 })
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  console.log(stdout + stderr)
  if (code !== 0) throw new Error(`${args.join(" ")} exited ${code}/${child.signalCode}`)
}

test("capture native production Lean page in CI Chromium; exact PNG/manifest artifact set", async () => {
  if (!process.env.CI && !process.env.GITHUB_RUN_ID) throw new Error("Visual capture/build requires CI")
  const source = execFileSync("git", ["rev-parse", "HEAD"], { cwd: app, encoding: "utf8" }).trim()
  await run(["typecheck"])
  await run(["run", "typecheck:e2e"])
  await run(["x", "playwright", "install", "--with-deps", "chromium"])
  await rm(out, { recursive: true, force: true })
  await run(["x", "playwright", "test", "--config", "e2e/orchestra-screenshots/playwright.config.ts", "lean-dashboard.visual.ts", "--project", "chromium"],
    { ...process.env, NODE_ENV: "production", ORCHESTRA_VISUAL_OUT: out, LEAN_VISUAL_SOURCE: source, ORCHESTRA_CHANNEL: "prod" })
  expect((await readdir(out)).sort()).toEqual([...files, "manifest.json"].sort())
  const manifest = await Bun.file(path.join(out, "manifest.json")).json()
  const validate = (value: typeof manifest) => {
    expect(value.synthetic).toBe(true)
    expect(value.source).toBe(source)
    expect(value.base).toBe("cc726a13aaf211f831cc7a039cff8df635d4743d")
    expect(value.polishDependency).toBe("ae0f158f08712b28f64ab1445fc7712e793120fe")
    expect(value.captures.map((capture: { file: string }) => capture.file).sort()).toEqual(files)
    for (const capture of value.captures) {
      expect(capture.dpr).toBe(1)
      expect(capture.locale).toBe("pt-BR")
      expect(capture.viewport).toEqual({ width: 1672, height: 941 })
      expect(capture.rows.length).toBeGreaterThan(0)
      expect(capture.rows.length).toBe(capture.file === "detail-dark.png" ? 1 : capture.file === "frameworks-dark.png" ? 3 : 32)
      expect(capture.scheme).toBe(capture.file === "dashboard-light.png" ? "light" : "dark")
      expect(capture.fontsLoaded).toBe(true)
      expect(capture.bundle).toContain(source)
      expect(capture.ownerLabel).toContain(capture.file === "profileB-dark.png" ? "Orchestra · Orchestra" : "Orchestra · HuGR-Lean")
    }
  }
  validate(manifest)
  // In-memory mutation probes: missing captures and stale source cannot be reported as a valid pack.
  expect(() => validate({ ...manifest, captures: [] })).toThrow()
  expect(() => validate({ ...manifest, source: "stale-source" })).toThrow()
  for (const file of files) {
    const png = Buffer.from(await Bun.file(path.join(out, file)).arrayBuffer())
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")
    expect(png.readUInt32BE(16)).toBe(1672)
    expect(png.readUInt32BE(20)).toBe(941)
    expect(png.byteLength).toBeGreaterThan(10000)
  }
  console.log(`Lean visual pack: ${source}; ${files.join(", ")}; manifest.json; synthetic public demo`)
}, 1200000)
