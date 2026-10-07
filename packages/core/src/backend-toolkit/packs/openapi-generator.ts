import type { Pack } from "../manifest"

// The pin is the jar's sha256, computed from the download, whose Maven Central `.sha1` and `.md5` agreed.
const VERSION = "7.25.0"

export default {
  id: "openapi-generator",
  version: VERSION,
  license: "Apache-2.0",
  upstream: "OpenAPITools/openapi-generator",
  runtime: "java",
  install: {
    kind: "jar",
    artifact: {
      url: `https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/${VERSION}/openapi-generator-cli-${VERSION}.jar`,
      integrity: "sha256-Qc5PawfxlmdkOdcQdZ+hzteggGbQb/G/MUaBRwKJ764=",
      format: "raw",
      entries: [{ from: `openapi-generator-cli-${VERSION}.jar`, to: "openapi-generator-cli.jar" }],
    },
  },
  launch: ["-jar", "{install}/openapi-generator-cli.jar"],
  fit: { role: "generator", input: "an OpenAPI description", skills: ["backend-api"] },
} as const satisfies Pack
