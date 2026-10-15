import { describe, expect, test } from "bun:test"
import { join, dirname, resolve } from "node:path"
import { existsSync } from "node:fs"
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
        expect(existsSync(join(root, "../app/public/orchestra/hugr-symbol-primary.svg"))).toBe(true)
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
 * This test reads the actual values from electron.vite.config.ts to catch
 * regressions where the publicDir path no longer resolves correctly
 * after the renderer root is accounted for.
 */
describe("electron vite publicDir", () => {
  test("configured publicDir resolves to a directory with oc-theme-preload.js", async () => {
    const config = await Bun.file(join(root, "electron.vite.config.ts")).text()
    const pub = config.match(/publicDir:\s*["']([^"']+)["']/)
    const rendererRoot = config.match(/root:\s*["']([^"']+)["']/)
    expect(pub).not.toBeNull()
    expect(rendererRoot).not.toBeNull()
    const resolved = resolve(root, rendererRoot![1], pub![1])
    expect(existsSync(resolved)).toBe(true)
    expect(existsSync(join(resolved, "oc-theme-preload.js"))).toBe(true)
  })
})
