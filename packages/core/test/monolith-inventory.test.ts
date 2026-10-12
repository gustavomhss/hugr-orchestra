import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import path from "node:path"
import { rm } from "node:fs/promises"
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
    name: "fixture", workspaces: ["packages/*", "packages/schema", "packages/sdk/js", "packages/omni/bindings/node"],
    patchedDependencies: { "fix@1": "patches/fix.patch" },
  }))
  expect((await monolithInventory(fixture.path)).modules).toEqual(original.modules)
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
    name: "fixture", workspaces: ["packages/*", "packages/sdk/js", "packages/omni/bindings/node"],
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
