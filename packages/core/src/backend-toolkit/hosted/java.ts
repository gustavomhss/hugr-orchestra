// placeholder: replaced by tk-java
import type { HostedEngine, Runtime } from "../manifest"

// placeholder: replaced by tk-java. Every pin below is fake and fails integrity on purpose.
const FAKE = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" as const
const pin = (executable: string) => ({
  artifact: { url: "https://placeholder.invalid/java.tar.gz", integrity: FAKE, format: "tar.gz" as const, entries: [] },
  executable,
})

export const JAVA: Runtime = {
  id: "java",
  version: "0.0.0-placeholder",
  license: "placeholder",
  upstream: "placeholder/java",
  targets: {
    "darwin-arm64": pin("bin/java"),
    "darwin-x64": pin("bin/java"),
    "linux-arm64": pin("bin/java"),
    "linux-x64": pin("bin/java"),
    "win32-x64": pin("bin/java.exe"),
  },
}

export const OPENAPI_GENERATOR: HostedEngine = {
  id: "openapi-generator",
  version: "0.0.0-placeholder",
  license: "placeholder",
  upstream: "placeholder/openapi-generator",
  runtime: "java",
  install: {
    kind: "jar",
    artifact: {
      url: "https://placeholder.invalid/openapi-generator-cli.jar",
      integrity: FAKE,
      format: "raw",
      entries: [{ from: "openapi-generator-cli.jar", to: "openapi-generator-cli.jar" }],
    },
  },
  launch: ["-jar", "{install}/openapi-generator-cli.jar"],
}
