import { describe, expect, test } from "bun:test"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"
import { JAVA, OPENAPI_GENERATOR } from "../src/backend-toolkit/hosted/java"

// The milestone 4 pins; changing one is a contract amendment.
const JRE_HOME = ["NOTICE", "bin", "conf", "legal", "lib", "release"]
const pins = Object.entries(JAVA.targets).map(([target, pin]) => ({ target, ...pin }))
// Narrowed here so the test keeps compiling once HostedEngine's install becomes the npm | pip | jar union.
const jar = OPENAPI_GENERATOR.install.kind === "jar" ? OPENAPI_GENERATOR.install.artifact : undefined
const artifacts = [...pins.map((pin) => pin.artifact), ...(jar ? [jar] : [])]

describe("backend toolkit Java runtime and hosted engine", () => {
  test("pins Temurin 17.0.20.1+1 and OpenAPI Generator 7.25.0 with their licenses", () => {
    expect([JAVA.id, JAVA.version, JAVA.license, JAVA.upstream]).toEqual([
      "java",
      "17.0.20.1+1",
      "GPL-2.0-only WITH Classpath-exception-2.0",
      "adoptium/temurin17-binaries",
    ])
    expect([OPENAPI_GENERATOR.id, OPENAPI_GENERATOR.version, OPENAPI_GENERATOR.license, OPENAPI_GENERATOR.runtime]).toEqual([
      "openapi-generator",
      "7.25.0",
      "Apache-2.0",
      "java",
    ])
  })

  test("the runtime covers exactly the five first-qualification targets", () => {
    expect(Object.keys(JAVA.targets).sort()).toEqual([...BackendToolkitTarget.TARGETS].sort())
  })

  test("every integrity is a well-formed sha256 or sha512 SRI digest, and no two downloads share one", () => {
    for (const artifact of artifacts) {
      const match = /^(sha256|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(artifact.integrity)
      expect(match, artifact.url).not.toBeNull()
      expect(Buffer.from(match![2], "base64").length, artifact.url).toBe(match![1] === "sha256" ? 32 : 64)
    }
    expect(new Set(artifacts.map((artifact) => artifact.integrity)).size).toBe(artifacts.length)
    expect(new Set(artifacts.map((artifact) => artifact.url)).size).toBe(artifacts.length)
  })

  test("the JRE comes only from the Temurin GitHub release of the pinned version", () => {
    for (const pin of pins) {
      const url = new URL(pin.artifact.url)
      expect([url.protocol, url.hostname], pin.artifact.url).toEqual(["https:", "github.com"])
      expect(url.pathname).toStartWith(`/${JAVA.upstream}/releases/download/jdk-17.0.20.1%2B1/OpenJDK17U-jre_`)
      expect(url.pathname).toEndWith(pin.target === "win32-x64" ? "_hotspot_17.0.20.1_1.zip" : "_hotspot_17.0.20.1_1.tar.gz")
      expect(pin.artifact.format).toBe(pin.target === "win32-x64" ? "zip" : "tar.gz")
    }
  })

  test("each target installs the whole JRE home and runs its java", () => {
    for (const pin of pins) {
      const home = pin.target.startsWith("darwin-") ? "jdk-17.0.20.1+1-jre/Contents/Home" : "jdk-17.0.20.1+1-jre"
      expect(pin.artifact.entries).toEqual(JRE_HOME.map((name) => ({ from: `${home}/${name}`, to: name })))
      expect(pin.executable).toBe(pin.target === "win32-x64" ? "bin/java.exe" : "bin/java")
      expect(JRE_HOME).toContain(pin.executable.split("/")[0])
    }
  })

  test("the generator is the Maven Central jar, installed under a fixed name and launched with -jar", () => {
    expect(OPENAPI_GENERATOR.install.kind).toBe("jar")
    const url = new URL(jar!.url)
    expect([url.protocol, url.hostname], jar!.url).toEqual(["https:", "repo1.maven.org"])
    expect(url.pathname).toBe("/maven2/org/openapitools/openapi-generator-cli/7.25.0/openapi-generator-cli-7.25.0.jar")
    expect(jar!.format).toBe("raw")
    expect(jar!.entries).toEqual([{ from: "openapi-generator-cli-7.25.0.jar", to: "openapi-generator-cli.jar" }])
    expect(OPENAPI_GENERATOR.launch).toEqual(["-jar", "{install}/openapi-generator-cli.jar"])
  })
})
