import { describe, expect, test } from "bun:test"
import { join, dirname, resolve } from "node:path"
import { existsSync, lstatSync, realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"

const dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(dir, "../..")

const html = async (name: string) => Bun.file(join(dir, name)).text()

/**
 * Packaged Electron windows load renderer HTML via the privileged `oc://`
 * protocol. Root-relative asset paths like `src="/foo.js"` would resolve from
 * the protocol origin root instead of relative to the current HTML entrypoint.
 *
 * All local resource references must use relative paths (`./`).
 */
describe("electron renderer html", () => {
  for (const name of ["index.html"]) {
    describe(name, () => {
      test("script src attributes use relative paths", async () => {
        const content = await html(name)
        const srcs = [...content.matchAll(/\bsrc=["']([^"']+)["']/g)].map((m) => m[1])
        for (const src of srcs) {
          expect(src).not.toMatch(/^\/[^/]/)
        }
      })

      test("link href attributes use relative paths", async () => {
        const content = await html(name)
        const hrefs = [...content.matchAll(/<link[^>]+href=["']([^"']+)["']/g)].map((m) => m[1])
        for (const href of hrefs) {
          expect(href).not.toMatch(/^\/[^/]/)
        }
      })

      test("the window icon is the HuGR symbol shipped in the public directory", async () => {
        const content = await html(name)
        const icons = [...content.matchAll(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*>/g)].map((m) => m[0])
        expect(icons).toEqual(['<link rel="icon" type="image/svg+xml" href="./orchestra/hugr-symbol-primary.svg" />'])
        expect(existsSync(join(root, "../app-shell/public/orchestra/hugr-symbol-primary.svg"))).toBe(true)
        expect(content).not.toContain("social-share")
      })

      test("no web manifest link (not applicable in Electron)", async () => {
        const content = await html(name)
        expect(content).not.toContain('rel="manifest"')
      })
    })
  }
})

/**
 * Vite resolves `publicDir` relative to `root`, not the config file.
 * This test evaluates the actual values from electron.vite.config.ts to catch
 * regressions where the publicDir path no longer resolves correctly
 * after the renderer root is accounted for.
 */
describe("electron vite publicDir", () => {
  test("configured publicDir resolves to a directory with oc-theme-preload.js", async () => {
    const child = Bun.spawn(["node", "--input-type=module", "--eval", `
      import { loadConfigFromFile } from "electron-vite"
      import path from "node:path"
      const loaded = await loadConfigFromFile({ command: "build", mode: "production" }, "electron.vite.config.ts", process.cwd())
      if (!loaded.config.renderer || typeof loaded.config.renderer.root !== "string" || typeof loaded.config.renderer.publicDir !== "string")
        throw new Error("RENDERER_PUBLIC_DIRECTORY_MISSING")
      console.log(JSON.stringify({ publicDir: path.resolve(process.cwd(), loaded.config.renderer.root, loaded.config.renderer.publicDir) }))
    `], { cwd: root, env: { PATH: process.env.PATH, ORCHESTRA_CHANNEL: "dev" }, stdout: "pipe", stderr: "pipe" })
    const [output, error, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect({ status, error }).toEqual({ status: 0, error: "" })
    const configured = JSON.parse(output) as { publicDir: string }
    expect(configured.publicDir).toBe(realpathSync(resolve(root, "../app-shell/public")))
    expect(lstatSync(configured.publicDir).isDirectory()).toBe(true)
    expect(lstatSync(join(configured.publicDir, "oc-theme-preload.js")).isFile()).toBe(true)
  }, 15_000)
})
