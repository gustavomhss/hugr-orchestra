import type { Pack } from "../manifest"
import type { TargetId } from "../target"
import { BackendToolkitNoticeSources } from "../notice-sources"
import sources from "./shfmt.notices.json"

// Pinned artifact for explicit preparation; Lucy analysis is qualified only on Linux x64, outside ENGINES.
// Byte/layout/floor proof is separate from an analysis qualification.
export default {
  id: "shfmt", version: "3.14.1", license: "BSD-3-Clause", upstream: "mvdan/sh",
  fit: { role: "check", input: "Host-owned local check inputs", skills: [] },
  floor: {
    "darwin-arm64": {"macos": "13.0"},
    "darwin-x64": {"macos": "13.0"},
    "linux-arm64": {},
    "linux-x64": {},
    "win32-x64": {"windows": "10.0"},
  },
  targets: {
    "darwin-arm64": {
      artifact: {
        url: "https://github.com/mvdan/sh/releases/download/v3.14.1/shfmt_v3.14.1_darwin_arm64",
        integrity: "sha256-t8hy22NVPM/8clOro+19SIWifYPxulZ7ETjGMVpYR+U=", format: "raw",
        entries: [{ from: "shfmt_v3.14.1_darwin_arm64", to: "shfmt", executable: true }],
      },
      executable: "shfmt",
    },
    "darwin-x64": {
      artifact: {
        url: "https://github.com/mvdan/sh/releases/download/v3.14.1/shfmt_v3.14.1_darwin_amd64",
        integrity: "sha256-0z7uDaD5KDWzVi6XZ6Bc7n5Oru9H2qA7/QnaF7S1kKY=", format: "raw",
        entries: [{ from: "shfmt_v3.14.1_darwin_amd64", to: "shfmt", executable: true }],
      },
      executable: "shfmt",
    },
    "linux-arm64": {
      artifact: {
        url: "https://github.com/mvdan/sh/releases/download/v3.14.1/shfmt_v3.14.1_linux_arm64",
        integrity: "sha256-Xy2wna6R/KhI96290BRjLpIaODhjoq1+BFCtOroMZIk=", format: "raw",
        entries: [{ from: "shfmt_v3.14.1_linux_arm64", to: "shfmt", executable: true }],
      },
      executable: "shfmt",
    },
    "linux-x64": {
      artifact: {
        url: "https://github.com/mvdan/sh/releases/download/v3.14.1/shfmt_v3.14.1_linux_amd64",
        integrity: "sha256-dud2QfqgJYFLd/FTspeWuOb6L8oD4MdqaRYIuGx+p78=", format: "raw",
        entries: [{ from: "shfmt_v3.14.1_linux_amd64", to: "shfmt", executable: true }],
      },
      executable: "shfmt",
    },
    "win32-x64": {
      artifact: {
        url: "https://github.com/mvdan/sh/releases/download/v3.14.1/shfmt_v3.14.1_windows_amd64.exe",
        integrity: "sha256-E2Kc4oRCyoC2tagZ91dKs54cKMbiZzTKgWyXFOBIUd8=", format: "raw",
        entries: [{ from: "shfmt_v3.14.1_windows_amd64.exe", to: "shfmt.exe", executable: true }],
      },
      executable: "shfmt.exe",
    },
  },
  binaryIntegrity: {
    "darwin-arm64": "sha256-t8hy22NVPM/8clOro+19SIWifYPxulZ7ETjGMVpYR+U=",
    "darwin-x64": "sha256-0z7uDaD5KDWzVi6XZ6Bc7n5Oru9H2qA7/QnaF7S1kKY=",
    "linux-arm64": "sha256-Xy2wna6R/KhI96290BRjLpIaODhjoq1+BFCtOroMZIk=",
    "linux-x64": "sha256-dud2QfqgJYFLd/FTspeWuOb6L8oD4MdqaRYIuGx+p78=",
    "win32-x64": "sha256-E2Kc4oRCyoC2tagZ91dKs54cKMbiZzTKgWyXFOBIUd8=",
  },
  notices: BackendToolkitNoticeSources.from(sources),
} as const satisfies Pack & { readonly binaryIntegrity: Readonly<Record<TargetId, `sha256-${string}`>> }
