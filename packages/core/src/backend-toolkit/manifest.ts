export * as BackendToolkitManifest from "./manifest"

import type { PinnedArtifact } from "../pinned-artifact"
import type { TargetId } from "./target"
import { JAVA, OPENAPI_GENERATOR } from "./hosted/java"
import { NODE, ORVAL, PROTOC_GEN_ES } from "./hosted/node"
import { DATAMODEL_CODEGEN, PYTHON } from "./hosted/python"

export type EngineId =
  | "ast-grep"
  | "sqlc"
  | "buf"
  | "gitleaks"
  | "kiota"
  | "orval"
  | "protoc-gen-es"
  | "openapi-generator"
  | "datamodel-codegen"

export type RuntimeId = "node" | "java" | "python"

/** A private interpreter shared by every hosted engine that names it (ruling M4-1). */
export type Runtime = {
  readonly id: RuntimeId
  readonly version: string
  readonly license: string
  readonly upstream: string
  /** Per target: the pinned archive and the install-relative interpreter, e.g. `bin/node` or `python.exe`. */
  readonly targets: Readonly<Record<TargetId, { readonly artifact: PinnedArtifact.Artifact; readonly executable: string }>>
}

/** An engine that runs on a private runtime; every byte of its own install is pinned. */
export type HostedEngine = {
  readonly id: EngineId
  readonly version: string
  readonly license: string
  readonly upstream: string
  /** Launcher environment; values may use `{install}` and `{runtime}`. */
  readonly env?: Readonly<Record<string, string>>
  readonly runtime: RuntimeId
  /**
   * `npm`: `npm ci --ignore-scripts` with the runtime's bundled npm over a lockfile carrying an integrity for every
   * package. `pip`: `pip install --require-hashes --no-deps --only-binary=:all:` over a hash list covering every target.
   * `jar`: the raw jar.
   */
  readonly install:
    | { readonly kind: "npm"; readonly packageJson: string; readonly lock: string }
    | { readonly kind: "pip"; readonly requirements: string }
    | { readonly kind: "jar"; readonly artifact: PinnedArtifact.Artifact }
  /** Arguments after the runtime interpreter; `{install}` and `{runtime}` expand to the two install directories. */
  readonly launch: ReadonlyArray<string>
}

export type Engine = NativeEngine | HostedEngine

export type NativeEngine = {
  readonly id: EngineId
  readonly version: string
  /** SPDX identifier of the upstream license. */
  readonly license: string
  /** Upstream `owner/repo`. */
  readonly upstream: string
  /** Child-scoped environment for every invocation of the engine. */
  readonly env?: Readonly<Record<string, string>>
  /** Per target: the pinned download and the install-relative executable it provides. */
  readonly targets: Readonly<Record<TargetId, { readonly artifact: PinnedArtifact.Artifact; readonly executable: string }>>
}

// Every pin is a contract amendment (F5.5, rulings M3-3/M3-4). npm pins are the registry's `dist.integrity`. GitHub pins
// are the release assets' sha256 digests in SRI form; buf's sha256.txt and gitleaks' checksums.txt agreed with them when
// pinning (sqlc and kiota publish no checksum file). Sample archives were downloaded to check entry layouts.
const AST_GREP = "0.45.3"
const SQLC = "1.31.1"
const BUF = "1.73.0"
const GITLEAKS = "8.30.1"
const KIOTA = "1.35.0"

// The npm package also ships `sg`, which shadows the shadow-utils `sg` on Linux; only `ast-grep` is exposed.
const astGrep = (pkg: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "ast-grep") => ({
  artifact: {
    url: `https://registry.npmjs.org/@ast-grep/cli-${pkg}/-/cli-${pkg}-${AST_GREP}.tgz`,
    integrity,
    format: "tar.gz" as const,
    entries: [{ from: `package/${executable}`, to: executable, executable: true }],
  },
  executable,
})

const sqlc = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "sqlc") => ({
  artifact: {
    url: `https://github.com/sqlc-dev/sqlc/releases/download/v${SQLC}/sqlc_${SQLC}_${asset}.tar.gz`,
    integrity,
    format: "tar.gz" as const,
    entries: [{ from: executable, to: executable, executable: true }],
  },
  executable,
})

const buf = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "buf") => ({
  artifact: {
    url: `https://github.com/bufbuild/buf/releases/download/v${BUF}/buf-${asset}`,
    integrity,
    format: "raw" as const,
    entries: [{ from: `buf-${asset}`, to: executable, executable: true }],
  },
  executable,
})

const gitleaks = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "gitleaks") => ({
  artifact: {
    url: `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS}/gitleaks_${GITLEAKS}_${asset}`,
    integrity,
    format: asset.endsWith(".zip") ? ("zip" as const) : ("tar.gz" as const),
    entries: [
      { from: executable, to: executable, executable: true },
      { from: "LICENSE", to: "LICENSE" },
    ],
  },
  executable,
})

// The self-contained .NET single-file build reads appsettings.json beside it; the archive's debug symbols are left out.
const kiota = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "kiota") => ({
  artifact: {
    url: `https://github.com/microsoft/kiota/releases/download/v${KIOTA}/${asset}.zip`,
    integrity,
    format: "zip" as const,
    entries: [
      { from: executable, to: executable, executable: true },
      { from: "appsettings.json", to: "appsettings.json" },
    ],
  },
  executable,
})

export const RUNTIMES: Readonly<Record<RuntimeId, Runtime>> = { node: NODE, java: JAVA, python: PYTHON }

// Declared without widening so a native entry keeps its `targets`.
export const ENGINES = {
  "ast-grep": {
    id: "ast-grep",
    version: AST_GREP,
    license: "MIT",
    upstream: "ast-grep/ast-grep",
    targets: {
      "darwin-arm64": astGrep("darwin-arm64", "sha512-6RZg4gRMJcSJtEJuaW5z33qfwXD7kRDGZ0T0dTxVxsLSw5BkeAjR8REysxUwPWZn+oOkzPyZ3y7/qNnSI/diIA=="),
      "darwin-x64": astGrep("darwin-x64", "sha512-4z6ZknTMSlTirQuJ4xihXoLfG7YwAOxFCqkKuGAxAiP+K70zivib8R19vUoFJDy4s+rjyGNDdrm45/ClC5tITQ=="),
      "linux-arm64": astGrep("linux-arm64-gnu", "sha512-T/N+Fl/pMqNjuyPV9PbTSR2bTlZrLKiCyHzJax6QNaOOVviXjEscROrAc6c0lFfc+Z07gW7Rt3oZKZdLEExutQ=="),
      "linux-x64": astGrep("linux-x64-gnu", "sha512-HbxIy6tZa8zn4J2hG8KVIo9n4+INAgVB8l2DyHqYxGKxnod8u2B4hfTGxbMm+BjBvYxKW4oGLZtYqInMyxidyQ=="),
      "win32-x64": astGrep("win32-x64-msvc", "sha512-UZrpVbjLQqQIRxWqeMcwyLSIhlDZyhYb8SinssM38Oo6mEB2jMfHCEoigay9UOZTfUR268n72BBV48nW2h+QwA==", "ast-grep.exe"),
    },
  },
  sqlc: {
    id: "sqlc",
    version: SQLC,
    license: "MIT",
    upstream: "sqlc-dev/sqlc",
    targets: {
      "darwin-arm64": sqlc("darwin_arm64", "sha256-IWAhWMmesfK64Zemar+xlB0enlCyMSW7GTNJxrGsxx4="),
      "darwin-x64": sqlc("darwin_amd64", "sha256-xa92dy43hdIWY6YmlwVrOD8HYpl5sb0luThy5z29UZs="),
      "linux-arm64": sqlc("linux_arm64", "sha256-t8riR3QNDFGh5ldHnlstIeb+9Cj1lmgqAbxVv0q4oj0="),
      "linux-x64": sqlc("linux_amd64", "sha256-SXrk/N+mTFsMMR/+TCvZkeQ5keguU2d5LteLwtyic1Q="),
      "win32-x64": sqlc("windows_amd64", "sha256-QNE47BixzIDSvnMFkX/U3s7aTgwy14ul2Pqkv6O8D8A=", "sqlc.exe"),
    },
  },
  buf: {
    id: "buf",
    version: BUF,
    license: "Apache-2.0",
    upstream: "bufbuild/buf",
    targets: {
      "darwin-arm64": buf("Darwin-arm64", "sha256-bm3w/vRSLk5D3+fDQYc8PywpzrRanfpeC61VgLiyAi8="),
      "darwin-x64": buf("Darwin-x86_64", "sha256-/3jQ6/NBgOv6gdNwJ1hR7GMPywiL8z4hP9cj0P10RKY="),
      "linux-arm64": buf("Linux-aarch64", "sha256-kCt1Jn239Dkembf6B1YFDlNUI0zAQ371Du6ceIlQx6M="),
      "linux-x64": buf("Linux-x86_64", "sha256-jymGKYrQjwzBv5mbl5e3w4Ot8y1+3w9z1vHhpwG66sE="),
      "win32-x64": buf("Windows-x86_64.exe", "sha256-E1QvKJLE93QVDdtSUmbWQh1Fez50EpcFa2RCeFNSbjY=", "buf.exe"),
    },
  },
  gitleaks: {
    id: "gitleaks",
    version: GITLEAKS,
    license: "MIT",
    upstream: "gitleaks/gitleaks",
    targets: {
      "darwin-arm64": gitleaks("darwin_arm64.tar.gz", "sha256-tAqwrlXFBZY+Nl8nGo04Ru+8FwqhfyYH8T32EKmutqU="),
      "darwin-x64": gitleaks("darwin_x64.tar.gz", "sha256-3+EBpNsiVfyFEgrH89JeQ0LDwgz3SfLCChgIGvGVJwk="),
      "linux-arm64": gitleaks("linux_arm64.tar.gz", "sha256-5KSH7nzNfTp/fsCGV2EKo2BmN9q5JCELOu5iVw+0sIA="),
      "linux-x64": gitleaks("linux_x64.tar.gz", "sha256-VR9vyD6kV9YqDZgjfLrRBa+NVXADBR9B8+fKez8kcOs="),
      "win32-x64": gitleaks("windows_x64.zip", "sha256-0pFE3v86aKqTztM93fhLf9wmBwrdSqD0UTCUyDMq/E4=", "gitleaks.exe"),
    },
  },
  kiota: {
    id: "kiota",
    version: KIOTA,
    license: "MIT",
    upstream: "microsoft/kiota",
    env: { KIOTA_OFFLINE_ENABLED: "true", KIOTA_CLI_TELEMETRY_OPTOUT: "true" },
    targets: {
      "darwin-arm64": kiota("osx-arm64", "sha256-vVClZtvNK9EPTvSpGSdt0ZMgLc7ZkPtdFtg7aAMOIGM="),
      "darwin-x64": kiota("osx-x64", "sha256-Z/oN0qLXg7pStQThFbKvApeArvOJRhfjA8FAWoGdlFA="),
      "linux-arm64": kiota("linux-arm64", "sha256-xULvG3HCSRKgAr6H6rfL/v6jJLFOs1MWKktVuHnmklw="),
      "linux-x64": kiota("linux-x64", "sha256-jKBCaDZl9IzG3xy+b/LIUNGPdK0KEDWkButIbhkvULw="),
      "win32-x64": kiota("win-x64", "sha256-ZrVUe5SPe+ck+l4N3d69qPe2YldK5Y6507jFHGCcYnE=", "kiota.exe"),
    },
  },
  orval: ORVAL,
  "protoc-gen-es": PROTOC_GEN_ES,
  "openapi-generator": OPENAPI_GENERATOR,
  "datamodel-codegen": DATAMODEL_CODEGEN,
} satisfies Readonly<Record<EngineId, Engine>>
