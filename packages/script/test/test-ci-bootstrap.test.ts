import { expect, test } from "bun:test"
import path from "node:path"
import { symlink } from "node:fs/promises"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { locateTestPackage } from "../../../script/test-ci-location.ts"

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

test("bootstrap refuses an outside-root registry before reading it", async () => {
  await using fixture = await tmpdir()
  await using outside = await tmpdir()
  await Bun.write(path.join(outside.path, "module-registry.json"), JSON.stringify({ format: 1, modules: [] }))
  await symlink(outside.path, path.join(fixture.path, "script"), process.platform === "win32" ? "junction" : "dir")
  expect(() => locateTestPackage(fixture.path, "app")).toThrow("TEST_PACKAGE_FILE_OUTSIDE_ROOT")
})

test("Python fallback refuses an outside-root package manifest instead of treating it as missing", async () => {
  await using fixture = await tmpdir()
  await using outside = await tmpdir()
  await Bun.write(path.join(fixture.path, "script/module-registry.json"), JSON.stringify({ format: 1,
    modules: [{ alias: "app", kind: "bun", scope: ".", name: "@fixture/app", path: "apps/ui" }] }))
  await Bun.write(path.join(fixture.path, "apps/ui/package.json"), JSON.stringify({ name: "@fixture/app" }))
  await Bun.write(path.join(fixture.path, "packages/oracle/requirements-dev.txt"), "pytest\n")
  await Bun.write(path.join(outside.path, "package.json"), JSON.stringify({ name: "outside" }))
  await symlink(path.join(outside.path, "package.json"), path.join(fixture.path, "packages/oracle/package.json"), "file")
  expect(() => locateTestPackage(fixture.path, "oracle")).toThrow("TEST_PACKAGE_FILE_OUTSIDE_ROOT")
})
