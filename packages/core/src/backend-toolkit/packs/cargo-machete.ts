import type { Pack } from "../manifest"
import type { TargetId } from "../target"
import { BackendToolkitNoticeSources } from "../notice-sources"
import sources from "./cargo-machete.notices.json"

// Pinned artifact for explicit preparation; Lucy analysis is qualified only on Linux x64, outside ENGINES.
// Byte/layout/floor proof is separate from an analysis qualification.
export default {
  id: "cargo-machete", version: "0.9.2", license: "MIT", upstream: "bnjbvr/cargo-machete",
  fit: { role: "check", input: "Host-owned local check inputs", skills: [] },
  floor: {
    "darwin-arm64": {"macos": "11.0"},
    "darwin-x64": {"macos": "10.12"},
    "linux-arm64": {"glibc": "2.39"},
    "linux-x64": {},
    "win32-x64": {},
  },
  targets: {
    "darwin-arm64": {
      artifact: {
        url: "https://github.com/bnjbvr/cargo-machete/releases/download/v0.9.2/cargo-machete-v0.9.2-aarch64-apple-darwin.tar.gz",
        integrity: "sha256-Y+KP7jhtgtM/LRJAbIV/mOLUaX8/fff3HzTf8H/KD94=", format: "tar.gz",
        entries: [{ from: "cargo-machete-v0.9.2-aarch64-apple-darwin/cargo-machete", to: "cargo-machete", executable: true }],
      },
      executable: "cargo-machete",
    },
    "darwin-x64": {
      artifact: {
        url: "https://github.com/bnjbvr/cargo-machete/releases/download/v0.9.2/cargo-machete-v0.9.2-x86_64-apple-darwin.tar.gz",
        integrity: "sha256-Poy5Nsm4IPhNBHorW+iyKbK+Z78kZwFIhTdqb6/9ysM=", format: "tar.gz",
        entries: [{ from: "cargo-machete-v0.9.2-x86_64-apple-darwin/cargo-machete", to: "cargo-machete", executable: true }],
      },
      executable: "cargo-machete",
    },
    "linux-arm64": {
      artifact: {
        url: "https://github.com/bnjbvr/cargo-machete/releases/download/v0.9.2/cargo-machete-v0.9.2-aarch64-unknown-linux-gnu.tar.gz",
        integrity: "sha256-b5bD5gJqW90kG2rmAMb7hskZfG4YmolPkTcbqgH9EPU=", format: "tar.gz",
        entries: [{ from: "cargo-machete-v0.9.2-aarch64-unknown-linux-gnu/cargo-machete", to: "cargo-machete", executable: true }],
      },
      executable: "cargo-machete",
    },
    "linux-x64": {
      artifact: {
        url: "https://github.com/bnjbvr/cargo-machete/releases/download/v0.9.2/cargo-machete-v0.9.2-x86_64-unknown-linux-musl.tar.gz",
        integrity: "sha256-SCAAh/VMVaq81NtK8eJXQrSYRsAqGxv6E0cRlFs1suk=", format: "tar.gz",
        entries: [{ from: "cargo-machete-v0.9.2-x86_64-unknown-linux-musl/cargo-machete", to: "cargo-machete", executable: true }],
      },
      executable: "cargo-machete",
    },
    "win32-x64": {
      artifact: {
        url: "https://github.com/bnjbvr/cargo-machete/releases/download/v0.9.2/cargo-machete-v0.9.2-x86_64-pc-windows-msvc.tar.gz",
        integrity: "sha256-mWEgrHCv5AXFj85QikdvJbtxAyxvuAE6oBI7ujZCnHY=", format: "tar.gz",
        entries: [{ from: "cargo-machete-v0.9.2-x86_64-pc-windows-msvc/cargo-machete.exe", to: "cargo-machete.exe", executable: true }],
      },
      executable: "cargo-machete.exe",
    },
  },
  binaryIntegrity: {
    "darwin-arm64": "sha256-a4Kcsw22ABrSr9OIMUvEQnkLtxsVPijDvOaXlJuVq7o=",
    "darwin-x64": "sha256-zTbjz2VSge25bYAB67uRsqQycWsKAzzLQjV1MpqIHuA=",
    "linux-arm64": "sha256-dHL6MbvcZBLzYpQ8tLWqIzl1ng3asZS3dhmPAG71igk=",
    "linux-x64": "sha256-W8Jcgj9Lql4gIYdrQBRVKsmu/KCET6BGcYnFGtCumb4=",
    "win32-x64": "sha256-sxCrCYw/UEYPaW0oKDAdCTVS1nWrTbo5ycH7HF46MVA=",
  },
  notices: BackendToolkitNoticeSources.from(sources),
} as const satisfies Pack & { readonly binaryIntegrity: Readonly<Record<TargetId, `sha256-${string}`>> }
