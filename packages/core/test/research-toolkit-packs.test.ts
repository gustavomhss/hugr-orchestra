import { describe, expect, test } from "bun:test"
import path from "path"
import { ResearchToolkitManifest } from "../src/research-toolkit/manifest"

// J6.4: every research pack is pinned end to end. A pin lives only in its pack file.
const packs = Object.values(ResearchToolkitManifest.ENGINES)
const lockOf = (install: { readonly lock: string }) =>
  Object.entries(
    (JSON.parse(install.lock) as { packages: Record<string, { resolved?: string; integrity?: string; inBundle?: boolean }> })
      .packages,
  ).filter(([key, entry]) => key !== "" && !entry.inBundle)

describe("research toolkit packs", () => {
  test("ships the TypeScript and Python indexers and the TypeScript oracle", () => {
    expect(packs.map((pack) => pack.id).toSorted()).toEqual(["scip-python", "scip-typescript", "typescript"])
    expect(ResearchToolkitManifest.ENGINES["scip-python"]?.fit).toEqual({ role: "indexer", languages: ["py"] })
    expect(ResearchToolkitManifest.ENGINES["scip-typescript"]?.fit).toEqual({ role: "indexer", languages: ["ts", "js"] })
    expect(ResearchToolkitManifest.ENGINES.typescript?.fit.role).toBe("oracle")
  })

  // Lock integrity (K2). Mutation control: delete one `"integrity"` line from a pack's `*.package-lock.json`.
  test("every pack installs from an npm lock whose entries all carry a registry URL and sha512 integrity", () => {
    for (const pack of packs) {
      if (!("install" in pack) || pack.install.kind !== "npm") throw new Error(`${pack.id} is not an npm pack`)
      const entries = lockOf(pack.install)
      expect(entries.length).toBeGreaterThan(0)
      for (const [key, entry] of entries) {
        expect([pack.id, key, entry.resolved?.startsWith("https://registry.npmjs.org/")]).toEqual([pack.id, key, true])
        expect([pack.id, key, entry.integrity?.startsWith("sha512-")]).toEqual([pack.id, key, true])
      }
    }
  })

  test("the lock pins the version the package.json names, and launch points inside the install", () => {
    for (const pack of packs) {
      if (!("install" in pack) || pack.install.kind !== "npm") throw new Error(`${pack.id} is not an npm pack`)
      const dependencies = Object.entries(
        (JSON.parse(pack.install.packageJson) as { dependencies: Record<string, string> }).dependencies,
      )
      expect(dependencies.length).toBe(1)
      const [name, version] = dependencies[0]
      expect(lockOf(pack.install).find(([key]) => key === `node_modules/${name}`)?.[1]).toMatchObject({
        version,
      })
      expect(version).toBe(pack.version)
      expect(pack.launch[0].startsWith("{install}/node_modules/")).toBe(true)
    }
  })

  test("core declares the grammar and SCIP decoder the index reads offline (J6.5)", async () => {
    const manifest = (await Bun.file(path.resolve(import.meta.dirname, "../package.json")).json()) as {
      dependencies: Record<string, string>
    }
    for (const name of ["@c4312/scip", "tree-sitter-typescript", "web-tree-sitter"])
      expect(manifest.dependencies[name]).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
