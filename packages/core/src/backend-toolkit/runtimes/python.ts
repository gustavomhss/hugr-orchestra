import type { PinnedArtifact } from "../../pinned-artifact"
import type { Runtime } from "../manifest"

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

export default {
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
} satisfies Runtime
