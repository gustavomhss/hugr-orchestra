import { expect, test } from "bun:test"
import path from "node:path"
import { tmpdir } from "../../core/test/fixture/tmpdir"

test("Node bootstrap validates a registry-backed moved package before Bun setup", async () => {
  await using fixture = await tmpdir()
  await Bun.write(path.join(fixture.path, "script/module-registry.json"), JSON.stringify({
    format: 1,
    modules: [{ alias: "app", kind: "bun", scope: ".", name: "@fixture/app", path: "apps/web" }],
  }))
  await Bun.write(path.join(fixture.path, "apps/web/package.json"), JSON.stringify({ name: "@fixture/app" }))
  const source = `
    import { statSync } from "node:fs"
    import assert from "node:assert/strict"
    import { locateTestPackage } from ${JSON.stringify(new URL("../../../script/test-ci-location.ts", import.meta.url).href)}
    import { validateRequest } from ${JSON.stringify(new URL("../../../script/test-ci-request.ts", import.meta.url).href)}
    const root = process.argv[1]
    const locate = (selector) => locateTestPackage(root, selector)
    const request = validateRequest({ package: "@fixture/app", runner: "bun", args: ["./test/one.test.ts"] },
      (file) => statSync(root + "/" + file, { throwIfNoEntry: false })?.isFile() ?? false, locate)
    assert.throws(() => validateRequest({ package: "app", directory: "../outside", runner: "bun", args: [] },
      () => true, locate), /directory does not match/)
    console.log(JSON.stringify({ request, node: process.versions.node }))
  `
  const child = Bun.spawn(["node", "--experimental-strip-types", "--input-type=module", "-e", source, fixture.path], {
    cwd: fixture.path, stdout: "pipe", stderr: "pipe",
  })
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ])
  expect(error).not.toContain("ReferenceError")
  expect(code).toBe(0)
  const result = JSON.parse(output)
  expect(result.request).toMatchObject({ package: "app", directory: "apps/web", runner: "bun", args: ["./test/one.test.ts"] })
  expect(result.node).toMatch(/^\d+\./)
})
