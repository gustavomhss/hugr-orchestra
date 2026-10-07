import { describe, expect, test } from "bun:test"
import { NODE, ORVAL, PROTOC_GEN_ES } from "../src/backend-toolkit/hosted/node"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"

const targets = Object.entries(NODE.targets).map(([target, pin]) => ({ target, ...pin }))

type LockPackage = {
  readonly version?: string
  readonly resolved?: string
  readonly integrity?: string
  readonly os?: ReadonlyArray<string>
  readonly cpu?: ReadonlyArray<string>
  readonly libc?: ReadonlyArray<string>
  readonly bin?: Readonly<Record<string, string>>
  readonly optionalDependencies?: Readonly<Record<string, string>>
}
type Lock = { readonly lockfileVersion: number; readonly packages: Readonly<Record<string, LockPackage>> }

function sri(integrity: string) {
  const match = /^(sha256|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(integrity)
  if (!match) return undefined
  return { algorithm: match[1], bytes: Buffer.from(match[2], "base64").length }
}

// The milestone 4 pins; changing one is a contract amendment.
describe("hosted Node runtime", () => {
  test("pins Node 22.23.2 under MIT on exactly the five targets", () => {
    expect(NODE.id).toBe("node")
    expect(NODE.version).toBe("22.23.2")
    expect(NODE.license).toBe("MIT")
    expect(Object.keys(NODE.targets).sort()).toEqual([...BackendToolkitTarget.TARGETS].sort())
  })

  test("every download is a distinct nodejs.org release archive with a sha256 SRI digest", () => {
    for (const pin of targets) {
      const url = new URL(pin.artifact.url)
      expect(url.protocol).toBe("https:")
      expect(url.hostname).toBe("nodejs.org")
      expect(url.pathname).toStartWith(`/dist/v${NODE.version}/node-v${NODE.version}-`)
      expect(pin.artifact.format).toBe(pin.target === "win32-x64" ? "zip" : "tar.gz")
      expect(sri(pin.artifact.integrity), pin.artifact.url).toEqual({ algorithm: "sha256", bytes: 32 })
    }
    expect(new Set(targets.map((pin) => pin.artifact.url)).size).toBe(5)
    expect(new Set(targets.map((pin) => pin.artifact.integrity)).size).toBe(5)
  })

  test("each target installs an executable interpreter and the bundled npm from the archive's own directory", () => {
    for (const pin of targets) {
      const windows = pin.target === "win32-x64"
      const root = `node-v${NODE.version}-${windows ? "win-x64" : pin.target}/`
      const entries = pin.artifact.entries
      expect(pin.executable).toBe(windows ? "node.exe" : "bin/node")
      expect(entries.find((entry) => entry.to === pin.executable)?.executable).toBe(true)
      expect(entries.map((entry) => entry.to)).toContain(windows ? "node_modules" : "lib")
      expect(entries.every((entry) => entry.from === `${root}${entry.to}`)).toBe(true)
    }
  })
})

describe.each([
  [ORVAL, "orval", "8.39.0", "MIT", "orval-labs/orval"],
  [PROTOC_GEN_ES, "@bufbuild/protoc-gen-es", "2.16.0", "Apache-2.0", "bufbuild/protobuf-es"],
] as const)("hosted engine %#", (engine, pkg, version, license, upstream) => {
  const install = engine.install.kind === "npm" ? engine.install : undefined
  const lock: Lock = JSON.parse(install?.lock ?? "{}")
  const packages = Object.entries(lock.packages ?? {}).filter(([key]) => key !== "")

  test("pins its version, license and upstream and runs on the Node runtime", () => {
    expect(engine.version).toBe(version)
    expect(engine.license).toBe(license)
    expect(engine.upstream).toBe(upstream)
    expect(engine.runtime).toBe("node")
    expect(install).toBeDefined()
  })

  test("package.json pins exactly the engine and the v3 lock's root agrees with it", () => {
    const manifest = JSON.parse(install!.packageJson)
    expect(manifest.dependencies).toEqual({ [pkg]: version })
    expect(lock.lockfileVersion).toBe(3)
    expect(lock.packages[""]).toMatchObject({ dependencies: { [pkg]: version } })
    expect(lock.packages[`node_modules/${pkg}`]?.version).toBe(version)
  })

  test("every locked package is a registry.npmjs.org tarball with a sha512 integrity", () => {
    expect(packages.length).toBeGreaterThan(0)
    for (const [key, entry] of packages) {
      const url = new URL(entry.resolved ?? "invalid:")
      expect(url.protocol, key).toBe("https:")
      expect(url.hostname, key).toBe("registry.npmjs.org")
      expect(url.pathname, key).toEndWith(`-${entry.version}.tgz`)
      expect(sri(entry.integrity ?? ""), key).toEqual({ algorithm: "sha512", bytes: 64 })
    }
  })

  test("every platform-specific optional dependency set has a package for each of the five targets", () => {
    const groups = packages
      .map(([, entry]) =>
        Object.keys(entry.optionalDependencies ?? {})
          .map((name) => lock.packages[`node_modules/${name}`])
          .filter((dependency) => dependency?.os || dependency?.cpu),
      )
      .filter((group) => group.length > 0)
    for (const group of groups)
      for (const target of BackendToolkitTarget.TARGETS) {
        const [os, cpu] = target.split("-")
        const match = group.find(
          (dependency) =>
            (dependency.os ?? [os]).includes(os) &&
            (dependency.cpu ?? [cpu]).includes(cpu) &&
            // The toolkit's Linux targets are glibc only.
            !(dependency.libc?.length && dependency.libc.every((libc) => libc === "musl")),
        )
        expect(match, `${target} in ${engine.id}`).toBeDefined()
      }
    if (engine.id === "orval") expect(groups.length).toBeGreaterThan(0)
  })

  test("launches the package's own bin entry from the install directory", () => {
    const bin = Object.values(lock.packages[`node_modules/${pkg}`]?.bin ?? {})
    expect(engine.launch).toEqual([`{install}/node_modules/${pkg}/${bin[0]}`])
    expect(bin).toHaveLength(1)
  })
})
