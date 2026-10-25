import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import path from "node:path"
import { mkdir, rename, rm } from "node:fs/promises"
import { monolithInventory } from "../../../script/monolith-inventory"
import { inventoryFixture } from "./fixture/monolith-inventory"

test("captures declared Bun, nested SDK/binding, Atlas, Cargo, assets and pinned inputs", async () => {
  await using fixture = await inventoryFixture()
  const captured = await monolithInventory(fixture.path)
  expect(captured.modules.map((module) => [module.kind, module.name])).toEqual([
    ["npm", "@fixture/contracts"], ["bun", "@fixture/client"], ["cargo", "binding"],
    ["bun", "binding"], ["cargo", "runtime"], ["cargo", "qa"],
    ["bun", "@fixture/schema"], ["bun", "@fixture/sdk"],
  ])
  expect(captured.modules.find((module) => module.name === "@fixture/schema")?.exports)
    .toEqual({ ".": "./src/index.ts", "./v1": "./src/v1.ts" })
  expect(captured.modules.find((module) => module.name === "runtime")?.dependencies.dependencies)
    .toEqual({ serde: { version: "1", features: ["derive"] } })
  expect(captured.modules.find((module) => module.kind === "cargo" && module.name === "binding")?.lib)
    .toEqual({ "crate-type": ["cdylib"] })
  expect(captured.modules.find((module) => module.name === "qa")?.bin).toEqual([{ name: "qa-run", path: "src/main.rs" }])
  expect(captured.modules.find((module) => module.kind === "bun" && module.name === "binding"))
    .toMatchObject({ type: "commonjs", main: "index.js", types: "index.d.ts", exports: null })
  expect(captured.assets.map((asset) => asset.path)).toEqual(["packages/skills"])
  expect(captured.assets[0]?.files.map((file) => file.path)).toEqual(["packages/skills/entry/SKILL.md"])
  expect(captured.inputs.find((input) => input.path === "packages/schema/vendor/pinned.tgz")?.sha256)
    .toBe(createHash("sha256").update("pinned bytes\n").digest("hex"))
  expect(captured.inputs.some((input) => input.path === "patches/fix.patch")).toBe(true)
  expect(captured.fingerprint).toBe(createHash("sha256").update(JSON.stringify(
    Object.fromEntries(Object.entries(captured).filter(([key]) => key !== "fingerprint")),
  )).digest("hex"))
  expect(captured.producerHash).toMatch(/^[a-f0-9]{64}$/)
  expect(await monolithInventory(fixture.path)).toEqual(captured)
})

test("fingerprint changes when a declaration, asset, lockfile or vendor byte changes", async () => {
  await using fixture = await inventoryFixture()
  const original = await monolithInventory(fixture.path)
  for (const file of ["bun.lock", "packages/skills/entry/SKILL.md", "packages/schema/vendor/pinned.tgz"]) {
    const before = await Bun.file(path.join(fixture.path, file)).text()
    await Bun.write(path.join(fixture.path, file), before + "changed\n")
    expect((await monolithInventory(fixture.path)).fingerprint).not.toBe(original.fingerprint)
    await Bun.write(path.join(fixture.path, file), before)
  }
  await Bun.write(path.join(fixture.path, "packages/client/package.json"), JSON.stringify({
    name: "@fixture/client", exports: { ".": "./different.ts" },
  }))
  expect((await monolithInventory(fixture.path)).fingerprint).not.toBe(original.fingerprint)
})

test("supports array workspaces and deduplicates overlapping discovery patterns", async () => {
  await using fixture = await inventoryFixture()
  const original = await monolithInventory(fixture.path)
  await Bun.write(path.join(fixture.path, "package.json"), JSON.stringify({
    name: "fixture", workspaces: ["packages/*", "packages/schema", "packages/sdk/lib", "packages/omni/bindings/node"],
    patchedDependencies: { "fix@1": "patches/fix.patch" },
  }))
  expect((await monolithInventory(fixture.path)).modules).toEqual(original.modules)
})

test("registered native and Atlas moves preserve declaration payloads and domain pins", async () => {
  await using fixture = await inventoryFixture()
  const before = await monolithInventory(fixture.path)
  await mkdir(path.join(fixture.path, "native"))
  await mkdir(path.join(fixture.path, "modules"))
  await rename(path.join(fixture.path, "packages/omni"), path.join(fixture.path, "native/omni"))
  await rename(path.join(fixture.path, "foundation/atlas"), path.join(fixture.path, "modules/atlas"))
  await Bun.write(path.join(fixture.path, "script/toolchain-registry.json"), JSON.stringify({ format: 1, roots: {
    omni: { path: "native/omni", manifest: "Cargo.toml" }, atlas: { path: "modules/atlas", manifest: "package.json" },
  } }))
  const manifest = await Bun.file(path.join(fixture.path, "package.json")).json()
  manifest.workspaces.packages = ["packages/*", "packages/sdk/lib", "native/omni/bindings/node"]
  await Bun.write(path.join(fixture.path, "package.json"), JSON.stringify(manifest))
  const moved = await monolithInventory(fixture.path)
  const declarations = (modules: typeof moved.modules) => modules.map((module) => ({
    kind: module.kind, name: module.name, manifestHash: module.manifestHash, dependencies: module.dependencies,
    exports: module.exports, lib: module.lib, bin: module.bin,
  })).sort((left, right) => `${left.kind}:${left.name}`.localeCompare(`${right.kind}:${right.name}`))
  expect(declarations(moved.modules)).toEqual(declarations(before.modules))
  expect(moved.modules.find((module) => module.name === "runtime")?.scope).toBe("native/omni")
  expect(moved.modules.find((module) => module.name === "@fixture/contracts")?.scope).toBe("modules/atlas")
  expect(moved.inputs.find((input) => input.path === "native/omni/Cargo.lock")?.sha256)
    .toBe(before.inputs.find((input) => input.path === "packages/omni/Cargo.lock")?.sha256)
  expect(moved.inputs.find((input) => input.path === "modules/atlas/package-lock.json")?.sha256)
    .toBe(before.inputs.find((input) => input.path === "foundation/atlas/package-lock.json")?.sha256)
})

test("present malformed toolchain registry cannot fall back to legacy roots", async () => {
  await using fixture = await inventoryFixture()
  await Bun.write(path.join(fixture.path, "script/toolchain-registry.json"), '{"format":2,"roots":{}}')
  await expect(monolithInventory(fixture.path)).rejects.toThrow("BASELINE_INVALID_TOOLCHAIN_REGISTRY")
})

test("captures relocated skill and brand assets without treating registered module trees as assets", async () => {
  await using fixture = await inventoryFixture()
  await Bun.write(path.join(fixture.path, "modules/specialists/backend/skills/backend-check/SKILL.md"), "backend bytes\n")
  await Bun.write(path.join(fixture.path, "modules/specialists/archie/skills/archie-plan/references/.hidden.md"), "archie bytes\n")
  await Bun.write(path.join(fixture.path, "modules/maestro/arsenal/package.json"), JSON.stringify({ name: "@fixture/arsenal" }))
  await Bun.write(path.join(fixture.path, "modules/maestro/arsenal/src/index.ts"), "export {}\n")
  await Bun.write(path.join(fixture.path, "assets/brand/mark.png"), new Uint8Array([0, 0xff, 10, 13, 10]))
  await Bun.write(path.join(fixture.path, "package.json"), JSON.stringify({
    name: "fixture", workspaces: ["packages/*", "packages/sdk/lib", "packages/omni/bindings/node", "modules/maestro/arsenal"],
  }))
  const captured = await monolithInventory(fixture.path)
  expect(captured.modules.find((module) => module.name === "@fixture/arsenal")?.path).toBe("modules/maestro/arsenal")
  expect(captured.assets.map((asset) => asset.path)).toEqual(["assets/brand", "modules/specialists", "packages/skills"])
  const skills = captured.assets.find((asset) => asset.path === "modules/specialists")
  expect(skills?.files.map((file) => file.path)).toEqual([
    "modules/specialists/archie/skills/archie-plan/references/.hidden.md",
    "modules/specialists/backend/skills/backend-check/SKILL.md",
  ])
  expect(skills?.files[1]?.sha256).toBe(createHash("sha256").update("backend bytes\n").digest("hex"))
  expect(captured.assets.find((asset) => asset.path === "assets/brand")?.files).toEqual([{
    path: "assets/brand/mark.png", sha256: createHash("sha256").update(new Uint8Array([0, 0xff, 10, 13, 10])).digest("hex"),
  }])
  await Bun.write(path.join(fixture.path, "modules/specialists/backend/skills/backend-check/SKILL.md"), "changed bytes\n")
  expect((await monolithInventory(fixture.path)).fingerprint).not.toBe(captured.fingerprint)
})

test("rejects empty or unmatched declarations, rather than emitting a vacant inventory", async () => {
  await using fixture = await inventoryFixture()
  await Bun.write(path.join(fixture.path, "package.json"), JSON.stringify({ name: "fixture", workspaces: { packages: [] } }))
  await expect(monolithInventory(fixture.path)).rejects.toThrow("BASELINE_INVALID_LIST:Bun workspaces")
  await Bun.write(path.join(fixture.path, "package.json"), JSON.stringify({ name: "fixture", workspaces: ["missing/*"] }))
  await expect(monolithInventory(fixture.path)).rejects.toThrow("BASELINE_EMPTY_PATTERN:.:missing/*")
})

test("rejects missing pins, duplicate identities, malformed manifests and malformed dependencies", async () => {
  await using fixture = await inventoryFixture()
  await Bun.write(path.join(fixture.path, "packages/client/package.json"), JSON.stringify({ name: "@fixture/schema" }))
  await expect(monolithInventory(fixture.path)).rejects.toThrow("BASELINE_DUPLICATE_IDENTITY:bun:.:@fixture/schema")
  await Bun.write(path.join(fixture.path, "packages/client/package.json"), "{ broken")
  await expect(monolithInventory(fixture.path)).rejects.toThrow("BASELINE_INVALID_MANIFEST:packages/client/package.json")
  await Bun.write(path.join(fixture.path, "packages/client/package.json"), JSON.stringify({ name: "@fixture/client", dependencies: null }))
  await expect(monolithInventory(fixture.path)).rejects.toThrow("BASELINE_INVALID_RECORD:packages/client/package.json dependencies")
  await Bun.write(path.join(fixture.path, "packages/client/package.json"), JSON.stringify({ name: "@fixture/client" }))
  await rm(path.join(fixture.path, "packages/schema/vendor/pinned.tgz"))
  await expect(monolithInventory(fixture.path)).rejects.toThrow("BASELINE_MISSING_INPUT:packages/schema/vendor/pinned.tgz")
})

test("rejects paths outside the source root before reading them", async () => {
  await using fixture = await inventoryFixture()
  await Bun.write(path.join(fixture.path, "packages/client/package.json"), JSON.stringify({
    name: "@fixture/client", dependencies: { external: "file:../../../../outside.tgz" },
  }))
  await expect(monolithInventory(fixture.path)).rejects.toThrow("BASELINE_INVALID_PATH:")
  await Bun.write(path.join(fixture.path, "packages/client/package.json"), JSON.stringify({
    name: "@fixture/client", dependencies: { external: "file:/outside.tgz" },
  }))
  await expect(monolithInventory(fixture.path)).rejects.toThrow("BASELINE_INVALID_PATH:")
})

test("captures hidden and target/dist asset payloads and pins declared by workspace roots", async () => {
  await using fixture = await inventoryFixture()
  await Bun.write(path.join(fixture.path, "packages/skills/.hidden/payload.txt"), "hidden\n")
  await Bun.write(path.join(fixture.path, "packages/skills/target/mark.svg"), "target asset\n")
  await Bun.write(path.join(fixture.path, "packages/skills/dist/profile.json"), "{}\n")
  await Bun.write(path.join(fixture.path, "package.json"), JSON.stringify({
    name: "fixture", workspaces: ["packages/*", "packages/sdk/lib", "packages/omni/bindings/node"],
    dependencies: { pinned: "file:./vendor/root.tgz" },
  }))
  await Bun.write(path.join(fixture.path, "vendor/root.tgz"), "root pin\n")
  await Bun.write(path.join(fixture.path, "foundation/atlas/package.json"), JSON.stringify({
    name: "atlas", workspaces: ["packages/*"], dependencies: { pinned: "file:./vendor/atlas.tgz" },
  }))
  await Bun.write(path.join(fixture.path, "foundation/atlas/vendor/atlas.tgz"), "atlas pin\n")
  const captured = await monolithInventory(fixture.path)
  expect(captured.assets[0]?.files.map((file) => file.path)).toEqual([
    "packages/skills/.hidden/payload.txt", "packages/skills/dist/profile.json",
    "packages/skills/entry/SKILL.md", "packages/skills/target/mark.svg",
  ])
  expect(captured.inputs.filter((input) => input.path.endsWith(".tgz")).map((input) => input.path))
    .toEqual(["foundation/atlas/vendor/atlas.tgz", "packages/schema/vendor/pinned.tgz", "vendor/root.tgz"])
  await Bun.write(path.join(fixture.path, "vendor/root.tgz"), "changed root pin\n")
  expect((await monolithInventory(fixture.path)).fingerprint).not.toBe(captured.fingerprint)
})

test("rejects malformed Cargo dependency and target declarations while preserving workspace inheritance", async () => {
  await using fixture = await inventoryFixture()
  const file = path.join(fixture.path, "packages/omni/crates/runtime/Cargo.toml")
  for (const declaration of ['serde = 42', 'serde = { version = 42 }', 'serde = { features = [42] }']) {
    await Bun.write(file, `[package]\nname = "runtime"\nversion = "1.0.0"\n[dependencies]\n${declaration}\n`)
    await expect(monolithInventory(fixture.path)).rejects.toThrow("BASELINE_INVALID_")
  }
  await Bun.write(file, '[package]\nname = "runtime"\nversion = "1.0.0"\n[target."cfg(unix)".dependencies]\nserde = { version = 42 }\n')
  await expect(monolithInventory(fixture.path)).rejects.toThrow("BASELINE_INVALID_CARGO_DEPENDENCY:")
  await Bun.write(file, '[package]\nname = "runtime"\nversion = "1.0.0"\n[dependencies]\nserde = { workspace = true, features = ["derive"] }\n')
  expect((await monolithInventory(fixture.path)).modules.find((module) => module.name === "runtime")?.dependencies.dependencies)
    .toEqual({ serde: { workspace: true, features: ["derive"] } })
})
