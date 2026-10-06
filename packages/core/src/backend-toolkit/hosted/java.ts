import type { PinnedArtifact } from "../../pinned-artifact"
import type { TargetId } from "../target"

// Frozen milestone 4 shapes; tk-core's Runtime and HostedEngine in manifest.ts replace these local aliases at merge.
type Runtime = {
  readonly id: "java"
  readonly version: string
  readonly license: string
  readonly upstream: string
  readonly targets: Readonly<Record<TargetId, { readonly artifact: PinnedArtifact.Artifact; readonly executable: string }>>
}
type HostedEngine = {
  readonly id: "openapi-generator"
  readonly version: string
  readonly license: string
  readonly upstream: string
  readonly env?: Readonly<Record<string, string>>
  readonly runtime: "java"
  readonly install: { readonly kind: "jar"; readonly artifact: PinnedArtifact.Artifact }
  readonly launch: ReadonlyArray<string>
}

// GitHub pins are the Temurin release assets' sha256 digests in SRI form; each `.sha256.txt` companion agreed with them
// when pinning. The Maven Central pin is the jar's sha256, computed from the download, whose `.sha1` and `.md5` agreed.
const TEMURIN = "17.0.20.1+1"
const OPENAPI_GENERATOR_VERSION = "7.25.0"

// Every archive holds one JRE home with these six children. They move as whole directories, so the installed tree is
// the complete JRE with its tar modes intact. macOS nests the home in a bundle whose launcher stub and signature
// resources are left out: `bin/java` loads only from the home.
const temurin = (asset: string, integrity: PinnedArtifact.Artifact["integrity"]) => {
  const windows = asset.endsWith("_windows")
  const home = asset.endsWith("_mac") ? `jdk-${TEMURIN}-jre/Contents/Home` : `jdk-${TEMURIN}-jre`
  return {
    artifact: {
      url: `https://github.com/adoptium/temurin17-binaries/releases/download/jdk-${encodeURIComponent(TEMURIN)}/OpenJDK17U-jre_${asset}_hotspot_${TEMURIN.replace("+", "_")}.${windows ? "zip" : "tar.gz"}`,
      integrity,
      format: windows ? ("zip" as const) : ("tar.gz" as const),
      entries: ["NOTICE", "bin", "conf", "legal", "lib", "release"].map((name) => ({ from: `${home}/${name}`, to: name })),
    },
    executable: windows ? "bin/java.exe" : "bin/java",
  }
}

export const JAVA: Runtime = {
  id: "java",
  version: TEMURIN,
  license: "GPL-2.0-only WITH Classpath-exception-2.0",
  upstream: "adoptium/temurin17-binaries",
  targets: {
    "darwin-arm64": temurin("aarch64_mac", "sha256-GQSAh0zM6zWMvIQDkyB/d6w+Y6TF+BKdDiPpUYuWrQU="),
    "darwin-x64": temurin("x64_mac", "sha256-Mzy4ESPDZWhYZkbHPI+iMm2ri63EP16jiKkP/1nJ3yc="),
    "linux-arm64": temurin("aarch64_linux", "sha256-uO/NWsyRCf6NNb7RMkmWQwSKJXtPYEKQbs430DyDnXc="),
    "linux-x64": temurin("x64_linux", "sha256-CytkDjBGtkyOxQTeCrnZG7VhAYK9oh+tRUaBzlTUWmI="),
    "win32-x64": temurin("x64_windows", "sha256-vCGpOSMQPNqsk+4zewrkNl5zn94234I91Fa8Z8ip01I="),
  },
}

export const OPENAPI_GENERATOR: HostedEngine = {
  id: "openapi-generator",
  version: OPENAPI_GENERATOR_VERSION,
  license: "Apache-2.0",
  upstream: "OpenAPITools/openapi-generator",
  runtime: "java",
  install: {
    kind: "jar",
    artifact: {
      url: `https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/${OPENAPI_GENERATOR_VERSION}/openapi-generator-cli-${OPENAPI_GENERATOR_VERSION}.jar`,
      integrity: "sha256-Qc5PawfxlmdkOdcQdZ+hzteggGbQb/G/MUaBRwKJ764=",
      format: "raw",
      entries: [{ from: `openapi-generator-cli-${OPENAPI_GENERATOR_VERSION}.jar`, to: "openapi-generator-cli.jar" }],
    },
  },
  launch: ["-jar", "{install}/openapi-generator-cli.jar"],
}
