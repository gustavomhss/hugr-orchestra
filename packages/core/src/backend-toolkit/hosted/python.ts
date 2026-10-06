import type { PinnedArtifact } from "../../pinned-artifact"
import type { TargetId } from "../target"
import { WHEELS } from "./python-wheels"

// Local copies of the frozen milestone-4 shapes; replaced at merge by `import type { HostedEngine, Runtime } from
// "../manifest"`, which declares them identically.
type Runtime = {
  readonly id: "node" | "java" | "python"
  readonly version: string
  readonly license: string
  readonly upstream: string
  readonly targets: Readonly<Record<TargetId, { readonly artifact: PinnedArtifact.Artifact; readonly executable: string }>>
}
type HostedEngine = {
  readonly id: "datamodel-codegen"
  readonly version: string
  readonly license: string
  readonly upstream: string
  readonly env?: Readonly<Record<string, string>>
  readonly runtime: "node" | "java" | "python"
  readonly install:
    | { readonly kind: "npm"; readonly packageJson: string; readonly lock: string }
    | { readonly kind: "pip"; readonly requirements: string }
    | { readonly kind: "jar"; readonly artifact: PinnedArtifact.Artifact }
  readonly launch: ReadonlyArray<string>
}

// Pins are the `install_only` archives of python-build-standalone release 20261003; digests are the release's
// SHA256SUMS lines in SRI form, which agreed with GitHub's asset digests when pinning.
const CPYTHON = "3.13.16"
const RELEASE = "20261003"

// Each archive holds one `python/` directory. Its top-level children move as whole trees so the interpreter keeps
// its standard library, bundled pip and (on Windows) its DLLs; the Windows debug symbols (`*.pdb`) are left out.
const unix = (triple: string, integrity: PinnedArtifact.Artifact["integrity"]) => ({
  artifact: {
    url: `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE}/cpython-${CPYTHON}%2B${RELEASE}-${triple}-install_only.tar.gz`,
    integrity,
    format: "tar.gz" as const,
    entries: ["bin", "include", "lib", "share"].map((name) => ({ from: `python/${name}`, to: name })),
  },
  executable: "bin/python3",
})

export const PYTHON: Runtime = {
  id: "python",
  version: CPYTHON,
  license: "PSF-2.0",
  upstream: "astral-sh/python-build-standalone",
  targets: {
    "darwin-arm64": unix("aarch64-apple-darwin", "sha256-2JddffTwj3sceq/N+svdzsPTZkFfLBpyskZraFCBWTM="),
    "darwin-x64": unix("x86_64-apple-darwin", "sha256-jpywhzBb+4lp9oqQX3n0FGnUqlIgwapxraf8mVO9ug8="),
    "linux-arm64": unix("aarch64-unknown-linux-gnu", "sha256-ZHcSHyKQSWOgZqyP+JmDuq54FRCBVZDolNqjwRzoZlI="),
    "linux-x64": unix("x86_64-unknown-linux-gnu", "sha256-CgJykQsQQXxlmpMS+z8tem13Tae9UQmZvno7qDJz3B8="),
    "win32-x64": {
      artifact: {
        url: `https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE}/cpython-${CPYTHON}%2B${RELEASE}-x86_64-pc-windows-msvc-install_only.tar.gz`,
        integrity: "sha256-XhAO49WS/1APRAimJPBU0gLjLZ26ihKyImvvgQg/13g=",
        format: "tar.gz",
        entries: [
          { from: "python/python.exe", to: "python.exe", executable: true },
          ...[
            "DLLs",
            "LICENSE.txt",
            "Lib",
            "Scripts",
            "include",
            "libs",
            "tcl",
            "pythonw.exe",
            "python3.dll",
            "python313.dll",
            "vcruntime140.dll",
            "vcruntime140_1.dll",
          ].map((name) => ({ from: `python/${name}`, to: name })),
        ],
      },
      executable: "python.exe",
    },
  },
}

export const DATAMODEL_CODEGEN: HostedEngine = {
  id: "datamodel-codegen",
  version: "0.83.0",
  license: "MIT",
  upstream: "koxudaxi/datamodel-code-generator",
  runtime: "python",
  install: {
    kind: "pip",
    // One `name==version --hash=...` line per pin, with the sha256 of every wheel any target may pick.
    requirements:
      Object.entries(WHEELS)
        .map(([pin, wheels]) => [pin, ...Object.values(wheels).map((hex) => `--hash=sha256:${hex}`)].join(" "))
        .join("\n") + "\n",
  },
  launch: ["-m", "datamodel_code_generator"],
  // PYTHONSAFEPATH keeps `-m` from putting the working directory first on sys.path, where a project package could
  // shadow the pinned ones; PYTHONNOUSERSITE does the same for the user's site-packages.
  env: { PYTHONPATH: "{install}", PYTHONSAFEPATH: "1", PYTHONNOUSERSITE: "1" },
}
