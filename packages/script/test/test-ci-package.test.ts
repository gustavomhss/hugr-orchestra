import { expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { resolveTestPackage } from "../../../script/test-ci-package.ts"

const registry = {
  format: 1,
  modules: [
    { alias: "app", kind: "bun", scope: ".", name: "@fixture/app", path: "apps/frontend-kit" },
    { alias: "sdk/js", kind: "bun", scope: ".", name: "@fixture/sdk", path: "libraries/client-sdk" },
  ],
}
const manifests: Record<string, unknown> = {
  "apps/frontend-kit": { name: "@fixture/app" },
  "libraries/client-sdk": { name: "@fixture/sdk" },
}

test("legacy aliases and canonical names resolve registered directories after a physical move", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "test-ci-package-"))
  try {
    mkdirSync(path.join(root, "packages/app"), { recursive: true })
    mkdirSync(path.join(root, "apps"))
    mkdirSync(path.join(root, "libraries/client-sdk"), { recursive: true })
    writeFileSync(path.join(root, "packages/app/package.json"), JSON.stringify({ name: "@fixture/app" }))
    writeFileSync(path.join(root, "libraries/client-sdk/package.json"), JSON.stringify({ name: "@fixture/sdk" }))
    renameSync(path.join(root, "packages/app"), path.join(root, "apps/frontend-kit"))
    const readManifest = (directory: string): unknown => JSON.parse(readFileSync(path.join(root, directory, "package.json"), "utf8"))
    ;["app", "packages/app", "./packages/app/", "./app/", "@fixture/app"].forEach((selector) => {
      expect(resolveTestPackage(registry, selector, readManifest)).toEqual({ package: "app", directory: "apps/frontend-kit" })
    })
    ;["sdk/js", "packages/sdk/js/", "@fixture/sdk"].forEach((selector) => {
      expect(resolveTestPackage(registry, selector, readManifest)).toEqual({ package: "sdk/js", directory: "libraries/client-sdk" })
    })
    expect(() => resolveTestPackage(registry, "frontend-kit", readManifest)).toThrow("TEST_PACKAGE_NOT_FOUND")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("checks every registered manifest even when its module is not selected", () => {
  const read: string[] = []
  expect(resolveTestPackage(registry, "app", (directory) => {
    read.push(directory)
    return manifests[directory]
  })).toEqual({ package: "app", directory: "apps/frontend-kit" })
  expect(read).toEqual(["apps/frontend-kit", "libraries/client-sdk"])
  expect(() => resolveTestPackage(registry, "app", (directory) =>
    directory === "libraries/client-sdk" ? { name: "@fixture/imposter" } : manifests[directory], () => true))
    .toThrow("TEST_PACKAGE_MANIFEST_NAME_MISMATCH:libraries/client-sdk")
})

test("fails explicitly for missing or malformed manifest names", () => {
  ;[undefined, null, [], {}, { name: "" }, { name: 42 }, { name: " @fixture/sdk" }].forEach((manifest) => {
    expect(() => resolveTestPackage(registry, "app", (directory) =>
      directory === "libraries/client-sdk" ? manifest : manifests[directory]))
      .toThrow("TEST_PACKAGE_MANIFEST_NAME_INVALID:libraries/client-sdk")
  })
  expect(() => resolveTestPackage(registry, "app", () => { throw new Error("MANIFEST_MISSING") }))
    .toThrow("MANIFEST_MISSING")
})

test("registered modules never fall back to guessed legacy directories", () => {
  const probes: string[] = []
  expect(resolveTestPackage(registry, "packages/app", (directory) => manifests[directory], (file) => {
    probes.push(file)
    return true
  })).toEqual({ package: "app", directory: "apps/frontend-kit" })
  expect(probes).toEqual([])
  expect(() => resolveTestPackage(registry, "app", () => ({ name: "wrong" }), () => true))
    .toThrow("TEST_PACKAGE_MANIFEST_NAME_MISMATCH")
})

test("retains only safe Python legacy selectors with requirements-dev.txt", () => {
  const probes: string[] = []
  const isFile = (file: string) => {
    probes.push(file)
    return file === "packages/python/oracle/requirements-dev.txt"
  }
  expect(resolveTestPackage(registry, "./packages/python/oracle/", (directory) => manifests[directory], isFile))
    .toEqual({ package: "python/oracle", directory: "packages/python/oracle" })
  expect(probes).toEqual(["packages/python/oracle/requirements-dev.txt", "packages/python/oracle/package.json"])
  expect(() => resolveTestPackage(registry, "missing", (directory) => manifests[directory], isFile))
    .toThrow("TEST_PACKAGE_NOT_FOUND")
  expect(() => resolveTestPackage(registry, "python/oracle", (directory) => manifests[directory]))
    .toThrow("TEST_PACKAGE_NOT_FOUND")
  expect(() => resolveTestPackage(registry, "unregistered-bun", (directory) => manifests[directory], () => true))
    .toThrow("TEST_PACKAGE_NOT_FOUND")
})

test("unsafe and unknown canonical selectors cannot enter the Python fallback", () => {
  const probes: string[] = []
  ;["@fixture/unknown", "../app", "/app", "packages/../app", "app//nested", "C:/app", "app\\nested", "app\n", " app", ""].forEach((selector) => {
    expect(() => resolveTestPackage(registry, selector, (directory) => manifests[directory], (file) => {
      probes.push(file)
      return true
    })).toThrow()
  })
  expect(probes).toEqual([])
})

test("invalid registries fail before manifest reads or Python fallback", () => {
  const reads: string[] = []
  ;[{}, { format: 1, modules: [] }, { ...registry, modules: [registry.modules[0], registry.modules[0]] }].forEach((invalid) => {
    expect(() => resolveTestPackage(invalid, "python", (directory) => {
      reads.push(directory)
      return manifests[directory]
    }, () => true)).toThrow("MODULE_REGISTRY")
  })
  expect(reads).toEqual([])
})
