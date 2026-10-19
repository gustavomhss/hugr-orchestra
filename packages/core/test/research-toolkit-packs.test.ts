import { describe, expect, test } from "bun:test"
import path from "path"
import { ResearchToolkitManifest } from "../src/research-toolkit/manifest"

// J6.4: every research pack is pinned end to end. A pin lives only in its pack file.
const packs = Object.values(ResearchToolkitManifest.ENGINES)
const npm = packs.flatMap((pack) => "install" in pack && pack.install.kind === "npm" ? [{ ...pack, install: pack.install }] : [])
const lockOf = (install: { readonly lock: string }) =>
  Object.entries(
    (JSON.parse(install.lock) as { packages: Record<string, { resolved?: string; integrity?: string; inBundle?: boolean }> })
      .packages,
  ).filter(([key, entry]) => key !== "" && !entry.inBundle)

describe("research toolkit packs", () => {
  test("ships the TypeScript, Python, Go and Rust indexers and the TypeScript oracle", () => {
    expect(packs.map((pack) => pack.id).toSorted()).toEqual(["rust-analyzer", "scip-go", "scip-python", "scip-typescript", "typescript"])
    expect(npm.map((pack) => pack.id).toSorted()).toEqual(["scip-python", "scip-typescript", "typescript"])
    expect(ResearchToolkitManifest.ENGINES["scip-go"]?.fit).toEqual({ role: "indexer", languages: ["go"] })
    expect(ResearchToolkitManifest.ENGINES["rust-analyzer"]?.fit).toEqual({ role: "indexer", languages: ["rust"] })
    expect(ResearchToolkitManifest.ENGINES["scip-python"]?.fit).toEqual({ role: "indexer", languages: ["py"] })
    expect(ResearchToolkitManifest.ENGINES["scip-typescript"]?.fit).toEqual({ role: "indexer", languages: ["ts", "js"] })
    expect(ResearchToolkitManifest.ENGINES.typescript?.fit.role).toBe("oracle")
  })

  // Lock integrity (K2). Mutation control: delete one `"integrity"` line from a pack's `*.package-lock.json`.
  test("every npm pack installs from a lock whose entries all carry a registry URL and sha512 integrity", () => {
    for (const pack of npm) {
      const entries = lockOf(pack.install)
      expect(entries.length).toBeGreaterThan(0)
      for (const [key, entry] of entries) {
        expect([pack.id, key, entry.resolved?.startsWith("https://registry.npmjs.org/")]).toEqual([pack.id, key, true])
        expect([pack.id, key, entry.integrity?.startsWith("sha512-")]).toEqual([pack.id, key, true])
      }
    }
  })

  test("the lock pins the version the package.json names, and launch points inside the install", () => {
    for (const pack of npm) {
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

  // Mutation control: point a rust-analyzer target at another release, or drop its integrity; the pin assertions go red.
  test("rust-analyzer pins one release's server package per target by sha256, with the server marked executable", () => {
    const pack = ResearchToolkitManifest.ENGINES["rust-analyzer"]
    if (!pack || "install" in pack) throw new Error("rust-analyzer is not a native pack")
    const targets = Object.entries(pack.targets)
    expect(targets.map(([target]) => target).toSorted()).toEqual(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64", "win32-x64"])
    for (const [target, entry] of targets) {
      expect([target, entry.artifact.url]).toEqual([target, `https://github.com/rust-lang/rust-analyzer/releases/download/2026-09-28/rust-analyzer-${target}.vsix`])
      expect([target, entry.artifact.integrity]).toEqual([target, expect.stringMatching(/^sha256-[A-Za-z0-9+/]{43}=$/)])
      expect([target, entry.artifact.format]).toEqual([target, "zip"])
      expect(entry.artifact.entries).toContainEqual({ from: `extension/server/${entry.executable}`, to: entry.executable, executable: true })
    }
    expect(new Set(targets.map(([, entry]) => entry.artifact.integrity)).size).toBe(targets.length)
  })

  // Mutation control: change the scip-go module path or its integrity; the pin assertions go red.
  test("scip-go builds from the pinned module zip on the Go runtime", () => {
    const pack = ResearchToolkitManifest.ENGINES["scip-go"]
    if (!pack || !("install" in pack) || pack.install.kind !== "source") throw new Error("scip-go is not a source pack")
    expect(pack.runtime).toBe("go")
    expect(pack.install).toMatchObject({ build: "go", path: "./cmd/scip-go", binary: "scip-go" })
    expect(pack.install.artifact.url).toBe(`https://proxy.golang.org/github.com/scip-code/scip-go/@v/v${pack.version}.zip`)
    expect(pack.install.artifact.integrity).toBe("sha256-UrTV3vykBXbGTyGhlsYeCMxUSB1yy25Yor2gfLtB5wE=")
    expect(pack.install.artifact.entries.map((entry) => entry.to)).toContain("src/go.mod")
  })

  test("core declares the grammar and SCIP decoder the index reads offline (J6.5)", async () => {
    const manifest = (await Bun.file(path.resolve(import.meta.dirname, "../package.json")).json()) as {
      dependencies: Record<string, string>
    }
    for (const name of ["@c4312/scip", "tree-sitter-typescript", "tree-sitter-go", "tree-sitter-rust", "web-tree-sitter"])
      expect(manifest.dependencies[name]).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
