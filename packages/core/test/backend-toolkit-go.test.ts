import { describe, expect, test } from "bun:test"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"
import { GO, OGEN } from "../src/backend-toolkit/hosted/go"

// The milestone 5 pins; changing one is a contract amendment.
const GOROOT = [
  "CONTRIBUTING.md",
  "LICENSE",
  "PATENTS",
  "README.md",
  "SECURITY.md",
  "VERSION",
  "api",
  "bin",
  "codereview.cfg",
  "doc",
  "go.env",
  "lib",
  "misc",
  "pkg",
  "src",
  "test",
]
const ASSETS = {
  "darwin-arm64": "go1.25.14.darwin-arm64.tar.gz",
  "darwin-x64": "go1.25.14.darwin-amd64.tar.gz",
  "linux-arm64": "go1.25.14.linux-arm64.tar.gz",
  "linux-x64": "go1.25.14.linux-amd64.tar.gz",
  "win32-x64": "go1.25.14.windows-amd64.zip",
} as Record<string, string>
const pins = Object.entries(GO.targets).map(([target, pin]) => ({ target, ...pin }))
const artifacts = [...pins.map((pin) => pin.artifact), OGEN.install.artifact]

describe("backend toolkit Go runtime and ogen source engine", () => {
  test("pins Go 1.25.14 and ogen 1.24.0 with their licenses", () => {
    expect([GO.id, GO.version, GO.license, GO.upstream]).toEqual(["go", "1.25.14", "BSD-3-Clause", "golang/go"])
    expect([OGEN.id, OGEN.version, OGEN.license, OGEN.upstream, OGEN.runtime]).toEqual([
      "ogen",
      "1.24.0",
      "Apache-2.0",
      "ogen-go/ogen",
      "go",
    ])
  })

  test("the runtime covers exactly the five first-qualification targets", () => {
    expect(Object.keys(GO.targets).sort()).toEqual([...BackendToolkitTarget.TARGETS].sort())
  })

  test("every integrity is a well-formed sha256 SRI digest, and no two downloads share one", () => {
    for (const artifact of artifacts) {
      const match = /^sha256-([A-Za-z0-9+/]+={0,2})$/.exec(artifact.integrity)
      expect(match, artifact.url).not.toBeNull()
      expect(Buffer.from(match![1], "base64").length, artifact.url).toBe(32)
    }
    expect(new Set(artifacts.map((artifact) => artifact.integrity)).size).toBe(artifacts.length)
    expect(new Set(artifacts.map((artifact) => artifact.url)).size).toBe(artifacts.length)
  })

  test("downloads come only from go.dev, dl.google.com or proxy.golang.org over https", () => {
    for (const artifact of artifacts) {
      const url = new URL(artifact.url)
      expect(url.protocol, artifact.url).toBe("https:")
      expect(["go.dev", "dl.google.com", "proxy.golang.org"], artifact.url).toContain(url.hostname)
    }
  })

  test("each target installs the whole go/ tree of its official archive and runs its go", () => {
    for (const pin of pins) {
      expect(pin.artifact.url).toBe(`https://go.dev/dl/${ASSETS[pin.target]}`)
      expect(pin.artifact.format).toBe(pin.target === "win32-x64" ? "zip" : "tar.gz")
      expect(pin.artifact.entries).toEqual(GOROOT.map((name) => ({ from: `go/${name}`, to: name })))
      expect(pin.executable).toBe(pin.target === "win32-x64" ? "bin/go.exe" : "bin/go")
    }
  })

  test("ogen is built from the proxy's module zip with go, laid out at the module root", () => {
    const install = OGEN.install
    expect([install.kind, install.build, install.path, install.binary, install.features]).toEqual([
      "source",
      "go",
      "./cmd/ogen",
      "ogen",
      undefined,
    ])
    expect(install.artifact.url).toBe("https://proxy.golang.org/github.com/ogen-go/ogen/@v/v1.24.0.zip")
    expect(install.artifact.format).toBe("zip")
    const tos = install.artifact.entries.map((entry) => entry.to)
    for (const entry of install.artifact.entries) {
      expect(entry.from).toBe(`github.com/ogen-go/ogen@v1.24.0/${entry.to}`)
      expect(entry.to).not.toContain("/")
      expect(entry.executable).toBeUndefined()
    }
    expect(new Set(tos).size).toBe(tos.length)
    expect(tos).toEqual(expect.arrayContaining(["go.mod", "go.sum", "cmd", "LICENSE"]))
    expect(OGEN.launch).toEqual([])
  })
})
