import { expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { WorkspacePaths } from "../src/workspace-paths.ts"

const modules = [
  { alias: "orchestra", kind: "bun", scope: ".", name: "orchestra", path: "products/server" },
  { alias: "maestro-arsenal", kind: "bun", scope: ".", name: "@orchestra/maestro-arsenal", path: "tools/arsenal" },
  { alias: "omni/bindings/node", kind: "bun", scope: ".", name: "hugr-omni", path: "bindings/node" },
]
const toolchain = {
  format: 1,
  roots: {
    omni: { path: "native/engine", manifest: "Cargo.toml" },
    atlas: { path: "domains/atlas", manifest: "package.json" },
  },
}

function fixture(run: (root: string, outside: string) => void) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), "workspace-paths-")))
  const root = path.join(directory, "source")
  const outside = path.join(directory, "outside")
  mkdirSync(outside)
  mkdirSync(path.join(root, "script"), { recursive: true })
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "ambiguous-workspace" }))
  writeFileSync(path.join(root, "script/module-registry.json"), JSON.stringify({ format: 1, modules }))
  writeFileSync(path.join(root, "script/toolchain-registry.json"), JSON.stringify(toolchain))
  modules.forEach((entry) => {
    mkdirSync(path.join(root, entry.path), { recursive: true })
    writeFileSync(path.join(root, entry.path, "package.json"), JSON.stringify({ name: entry.name }))
  })
  Object.values(toolchain.roots).forEach((entry) => {
    mkdirSync(path.join(root, entry.path), { recursive: true })
    writeFileSync(path.join(root, entry.path, entry.manifest), entry.manifest === "Cargo.toml" ? "[workspace]\n" : "{}")
  })
  try {
    run(root, outside)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test("discovers physical source ancestors using both regular markers, including file starts", () => {
  fixture((root, outside) => {
    const nested = path.join(root, "products/server")
    expect(WorkspacePaths.findRoot(nested)).toBe(root)
    expect(WorkspacePaths.findRoot(path.join(nested, "package.json"))).toBe(root)
    const linked = path.join(outside, "source-link")
    symlinkSync(root, linked, "junction")
    expect(WorkspacePaths.findRoot(path.join(linked, "products/server"))).toBe(root)
    writeFileSync(path.join(outside, "package.json"), JSON.stringify({ name: "ambiguous-workspace" }))
    expect(() => WorkspacePaths.findRoot(outside)).toThrow("WORKSPACE_ROOT_NOT_FOUND")
  })
})

test("resolves relocated registered identities and distinguishes native domains from the binding", () => {
  fixture((root) => {
    const workspace = WorkspacePaths.make(root)
    expect(workspace.root).toBe(root)
    expect(workspace.module("maestro-arsenal")).toBe(path.join(root, "tools/arsenal"))
    expect(workspace.module("@orchestra/maestro-arsenal")).toBe(workspace.module("maestro-arsenal"))
    expect(workspace.module("hugr-omni")).toBe(path.join(root, "bindings/node"))
    expect(workspace.domain("omni")).toBe(path.join(root, "native/engine"))
    expect(workspace.domain("atlas")).toBe(path.join(root, "domains/atlas"))
    expect(workspace.entries.map((entry) => entry.path)).toEqual(modules.map((entry) => path.join(root, entry.path)))
    expect(() => workspace.module("server")).toThrow("MODULE_NOT_FOUND")
    writeFileSync(path.join(root, "script/module-registry.json"), "{}")
    expect(workspace.module("orchestra")).toBe(path.join(root, "products/server"))
    expect(() => WorkspacePaths.make(root)).toThrow("MODULE_REGISTRY_FORMAT_INVALID")
  })
})

test("rejects stale identities and missing module or domain manifests", () => {
  fixture((root) => {
    const manifest = path.join(root, "products/server/package.json")
    writeFileSync(manifest, '{"name":"other"}')
    expect(() => WorkspacePaths.make(root)).toThrow("WORKSPACE_MANIFEST_NAME_MISMATCH:orchestra")
    rmSync(manifest)
    expect(() => WorkspacePaths.make(root)).toThrow("WORKSPACE_PATH_MISSING")
    writeFileSync(manifest, '{"name":"orchestra"}')
    rmSync(path.join(root, "native/engine/Cargo.toml"))
    expect(() => WorkspacePaths.make(root)).toThrow("WORKSPACE_PATH_MISSING:native/engine/Cargo.toml")
  })
})

test("rejects invalid catalog paths, escaped modules and conflicting selectors", () => {
  fixture((root, outside) => {
    const registry = path.join(root, "script/module-registry.json")
    writeFileSync(registry, JSON.stringify({ format: 1, modules: modules.map((entry) => ({ ...entry, path: `../${entry.path}` })) }))
    expect(() => WorkspacePaths.make(root)).toThrow("MODULE_REGISTRY_PATH_INVALID")
    writeFileSync(registry, JSON.stringify({ format: 1, modules: modules.map((entry) => entry.alias === "maestro-arsenal" ? { ...entry, alias: "orchestra" } : entry) }))
    expect(() => WorkspacePaths.make(root)).toThrow("MODULE_REGISTRY_ALIAS_DUPLICATE")
    writeFileSync(registry, JSON.stringify({ format: 1, modules: modules.map((entry) => entry.alias === "orchestra" ? { ...entry, alias: "hugr-omni" } : entry) }))
    expect(() => WorkspacePaths.make(root)).toThrow("WORKSPACE_SELECTOR_AMBIGUOUS:hugr-omni")
    writeFileSync(registry, JSON.stringify({ format: 1, modules }))
    rmSync(path.join(root, "products/server"), { recursive: true })
    writeFileSync(path.join(outside, "package.json"), '{"name":"orchestra"}')
    symlinkSync(outside, path.join(root, "products/server"), "junction")
    expect(() => WorkspacePaths.make(root)).toThrow("WORKSPACE_PATH_ESCAPED:products/server/package.json")
  })
})

test("rejects incomplete toolchain registries and symlinked source markers", () => {
  fixture((root, outside) => {
    const registry = path.join(root, "script/toolchain-registry.json")
    writeFileSync(registry, JSON.stringify({ ...toolchain, format: 2 }))
    expect(() => WorkspacePaths.make(root)).toThrow("WORKSPACE_TOOLCHAIN_REGISTRY_INVALID")
    writeFileSync(registry, JSON.stringify({ format: 1, roots: { omni: toolchain.roots.omni } }))
    expect(() => WorkspacePaths.make(root)).toThrow("WORKSPACE_TOOLCHAIN_ENTRY_INVALID:atlas")
    writeFileSync(registry, JSON.stringify({ format: 1, roots: { ...toolchain.roots, omni: { ...toolchain.roots.omni, manifest: "package.json" } } }))
    expect(() => WorkspacePaths.make(root)).toThrow("WORKSPACE_TOOLCHAIN_ENTRY_INVALID:omni")
    writeFileSync(registry, JSON.stringify(toolchain))
    const manifest = path.join(root, "products/server/package.json")
    const linked = path.join(root, "products/server/identity.json")
    writeFileSync(linked, '{"name":"orchestra"}')
    rmSync(manifest)
    symlinkSync(linked, manifest)
    expect(() => WorkspacePaths.make(root)).toThrow("WORKSPACE_MANIFEST_NOT_REGULAR:products/server/package.json")
    rmSync(path.join(root, "script/module-registry.json"))
    writeFileSync(path.join(outside, "registry.json"), JSON.stringify({ format: 1, modules }))
    symlinkSync(path.join(outside, "registry.json"), path.join(root, "script/module-registry.json"))
    expect(() => WorkspacePaths.findRoot(root)).toThrow("WORKSPACE_ROOT_NOT_FOUND")
  })
})

test("rejects lexical escapes, physical escapes and nonregular manifests", () => {
  fixture((root, outside) => {
    const registry = path.join(root, "script/toolchain-registry.json")
    writeFileSync(registry, JSON.stringify({ ...toolchain, roots: { ...toolchain.roots, omni: { path: "../outside", manifest: "Cargo.toml" } } }))
    expect(() => WorkspacePaths.make(root)).toThrow("WORKSPACE_PATH_INVALID")
    writeFileSync(registry, JSON.stringify(toolchain))
    const native = path.join(root, "native/engine")
    rmSync(native, { recursive: true })
    writeFileSync(path.join(outside, "Cargo.toml"), "[workspace]\n")
    symlinkSync(outside, native, "junction")
    expect(() => WorkspacePaths.make(root)).toThrow("WORKSPACE_PATH_ESCAPED")
    rmSync(native)
    mkdirSync(native)
    mkdirSync(path.join(native, "Cargo.toml"))
    expect(() => WorkspacePaths.make(root)).toThrow("WORKSPACE_MANIFEST_NOT_REGULAR")
    rmSync(path.join(native, "Cargo.toml"), { recursive: true })
    symlinkSync(path.join(outside, "Cargo.toml"), path.join(native, "Cargo.toml"))
    expect(() => WorkspacePaths.make(root)).toThrow("WORKSPACE_PATH_ESCAPED")
  })
})
