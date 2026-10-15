import type { PinnedArtifact } from "../../pinned-artifact"
import type { Pack } from "../manifest"

// npm pins are the registry's `dist.integrity`; sample archives were downloaded to check entry layouts.
const VERSION = "0.45.3"

// The npm package also ships `sg`, which shadows the shadow-utils `sg` on Linux; only `ast-grep` is exposed.
const target = (pkg: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "ast-grep") => ({
  artifact: {
    url: `https://registry.npmjs.org/@ast-grep/cli-${pkg}/-/cli-${pkg}-${VERSION}.tgz`,
    integrity,
    format: "tar.gz" as const,
    entries: [{ from: `package/${executable}`, to: executable, executable: true }],
  },
  executable,
})

export default {
  id: "ast-grep",
  version: VERSION,
  license: "MIT",
  upstream: "ast-grep/ast-grep",
  targets: {
    "darwin-arm64": target(
      "darwin-arm64",
      "sha512-6RZg4gRMJcSJtEJuaW5z33qfwXD7kRDGZ0T0dTxVxsLSw5BkeAjR8REysxUwPWZn+oOkzPyZ3y7/qNnSI/diIA==",
    ),
    "darwin-x64": target(
      "darwin-x64",
      "sha512-4z6ZknTMSlTirQuJ4xihXoLfG7YwAOxFCqkKuGAxAiP+K70zivib8R19vUoFJDy4s+rjyGNDdrm45/ClC5tITQ==",
    ),
    "linux-arm64": target(
      "linux-arm64-gnu",
      "sha512-T/N+Fl/pMqNjuyPV9PbTSR2bTlZrLKiCyHzJax6QNaOOVviXjEscROrAc6c0lFfc+Z07gW7Rt3oZKZdLEExutQ==",
    ),
    "linux-x64": target(
      "linux-x64-gnu",
      "sha512-HbxIy6tZa8zn4J2hG8KVIo9n4+INAgVB8l2DyHqYxGKxnod8u2B4hfTGxbMm+BjBvYxKW4oGLZtYqInMyxidyQ==",
    ),
    "win32-x64": target(
      "win32-x64-msvc",
      "sha512-UZrpVbjLQqQIRxWqeMcwyLSIhlDZyhYb8SinssM38Oo6mEB2jMfHCEoigay9UOZTfUR268n72BBV48nW2h+QwA==",
      "ast-grep.exe",
    ),
  },
  fit: {
    role: "generator",
    input: "a syntax pattern, its rewrite and the files to apply it to",
    skills: ["backend-refactor"],
  },
} as const satisfies Pack
