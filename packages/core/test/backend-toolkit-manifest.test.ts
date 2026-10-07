import { describe, expect, test } from "bun:test"
import path from "path"
import { BackendToolkitManifest } from "../src/backend-toolkit/manifest"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"

// The pins of rulings M3-3 and F5.5; changing one is a contract amendment.
const PINS = { "ast-grep": "0.45.3", sqlc: "1.31.1", buf: "1.73.0", gitleaks: "8.30.1", kiota: "1.35.0" }
const LICENSES = { "ast-grep": "MIT", sqlc: "MIT", buf: "Apache-2.0", gitleaks: "MIT", kiota: "MIT" }
const engines = Object.values<BackendToolkitManifest.Engine>(BackendToolkitManifest.ENGINES).filter(
  (engine): engine is BackendToolkitManifest.NativeEngine => !("runtime" in engine),
)
const targets = engines.flatMap((engine) =>
  Object.entries(engine.targets).map(([target, pin]) => ({ engine, target, ...pin })),
)

describe("backend toolkit manifest", () => {
  test("the second cut adds exactly four hosted engines, each on a declared runtime", () => {
    const hosted = Object.values(BackendToolkitManifest.ENGINES).filter(
      (engine): engine is BackendToolkitManifest.HostedEngine => "runtime" in engine,
    )
    expect(hosted.map((engine) => engine.id).sort()).toEqual(["datamodel-codegen", "openapi-generator", "orval", "protoc-gen-es"])
    for (const engine of hosted) expect(BackendToolkitManifest.RUNTIMES[engine.runtime].id).toBe(engine.runtime)
  })

  test("pins exactly the five first-cut native engines at their ruled versions and licenses", () => {
    expect(Object.fromEntries(engines.map((engine) => [engine.id, engine.version]))).toEqual(PINS)
    expect(Object.fromEntries(engines.map((engine) => [engine.id, engine.license]))).toEqual(LICENSES)
    expect(Object.entries(BackendToolkitManifest.ENGINES).every(([key, engine]) => key === engine.id)).toBe(true)
  })

  test("every engine covers exactly the five first-qualification targets", () => {
    for (const engine of engines) expect(Object.keys(engine.targets).sort()).toEqual([...BackendToolkitTarget.TARGETS].sort())
    expect(targets).toHaveLength(25)
  })

  test("every integrity is a well-formed sha256 or sha512 SRI digest, and no two downloads share one", () => {
    for (const pin of targets) {
      const match = /^(sha256|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(pin.artifact.integrity)
      expect(match, pin.artifact.url).not.toBeNull()
      expect(Buffer.from(match![2], "base64").length, pin.artifact.url).toBe(match![1] === "sha256" ? 32 : 64)
    }
    expect(new Set(targets.map((pin) => pin.artifact.integrity)).size).toBe(targets.length)
    expect(new Set(targets.map((pin) => pin.artifact.url)).size).toBe(targets.length)
  })

  test("downloads come only from the npm registry or the upstream's own GitHub release of the pinned version", () => {
    for (const pin of targets) {
      const url = new URL(pin.artifact.url)
      expect(url.protocol, pin.artifact.url).toBe("https:")
      if (url.hostname === "registry.npmjs.org") {
        expect(pin.engine.id).toBe("ast-grep")
        expect(url.pathname).toEndWith(`-${pin.engine.version}.tgz`)
        continue
      }
      expect(url.hostname, pin.artifact.url).toBe("github.com")
      expect(url.pathname).toStartWith(`/${pin.engine.upstream}/releases/download/v${pin.engine.version}/`)
    }
  })

  test("each target installs its executable, marked executable, and never an `sg` alias", () => {
    for (const pin of targets) {
      const entries = pin.artifact.entries
      expect(entries.find((entry) => entry.to === pin.executable)?.executable, pin.artifact.url).toBe(true)
      expect(pin.executable).toBe(pin.target === "win32-x64" ? `${pin.engine.id}.exe` : pin.engine.id)
      expect(entries.flatMap((entry) => [entry.from, entry.to]).map((name) => path.posix.basename(name).replace(/\.exe$/, ""))).not.toContain("sg")
    }
  })

  test("kiota runs offline without telemetry", () => {
    expect(BackendToolkitManifest.ENGINES.kiota.env).toEqual({ KIOTA_OFFLINE_ENABLED: "true", KIOTA_CLI_TELEMETRY_OPTOUT: "true" })
  })
})

describe("backend toolkit target detection", () => {
  const host = { musl: false, rosetta: false }
  test.each([
    ["darwin", "arm64", host, { target: "darwin-arm64" }],
    ["darwin", "x64", host, { target: "darwin-x64" }],
    ["darwin", "x64", { ...host, rosetta: true }, { target: "darwin-arm64" }],
    ["linux", "arm64", host, { target: "linux-arm64" }],
    ["linux", "x64", host, { target: "linux-x64" }],
    ["linux", "x64", { ...host, musl: true }, { unsupported: "libc-musl" }],
    ["linux", "arm64", { ...host, musl: true }, { unsupported: "libc-musl" }],
    ["win32", "x64", host, { target: "win32-x64" }],
    ["win32", "arm64", host, { unsupported: "cpu-arm64-windows" }],
    ["freebsd", "x64", host, { unsupported: "platform-freebsd-x64" }],
    ["linux", "ia32", host, { unsupported: "platform-linux-ia32" }],
  ] as const)("%s %s %o", (platform, arch, flags, expected) => {
    expect(BackendToolkitTarget.detect({ platform, arch, ...flags })).toEqual(expected)
  })

  test("the running host resolves to a target or a reason", () => {
    const result = BackendToolkitTarget.detect()
    expect("target" in result ? BackendToolkitTarget.TARGETS.includes(result.target) : result.unsupported.length > 0).toBe(true)
  })
})
