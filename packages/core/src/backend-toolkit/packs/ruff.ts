import type { PinnedArtifact } from "../../pinned-artifact"
import type { Pack } from "../manifest"

// Pins are the 0.17.3 release-archive SHA-256 values, converted to SRI. The archives contain the executable only.
// The MIT text is a separate immutable notice, not an invented archive member.
const VERSION = "0.17.3"
const RELEASE = `https://github.com/astral-sh/ruff/releases/download/${VERSION}`

const target = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "ruff") => ({
  artifact: {
    url: `${RELEASE}/${asset}`,
    integrity,
    format: asset.endsWith(".zip") ? ("zip" as const) : ("tar.gz" as const),
    entries: [{ from: asset.endsWith(".zip") ? executable : `${asset.replace(/\.tar\.gz$/, "")}/${executable}`, to: executable, executable: true }],
  },
  executable,
})

export default {
  id: "ruff",
  version: VERSION,
  license: "MIT",
  upstream: "astral-sh/ruff",
  // Static headers only. Windows API availability was not established, so the adapter refuses that target before lookup.
  floor: {
    "darwin-arm64": { macos: "11.0" },
    "darwin-x64": { macos: "10.12" },
    "linux-arm64": { glibc: "2.17" },
    "linux-x64": { glibc: "2.17" },
    "win32-x64": {},
  },
  targets: {
    "darwin-arm64": target("ruff-aarch64-apple-darwin.tar.gz", "sha256-EY9xIaqDh4VnK/YSSH91WokQi7X0Tg89+WxZZ6cmFPk="),
    "darwin-x64": target("ruff-x86_64-apple-darwin.tar.gz", "sha256-F/lbG+4k1w3mL/5b7sf3G7VBx+PRR6HD2E981lJfb98="),
    "linux-arm64": target("ruff-aarch64-unknown-linux-gnu.tar.gz", "sha256-P0Y5FSwOQrtZOObCPVPVJ6OPMTPgABApNFGPkFKfopk="),
    "linux-x64": target("ruff-x86_64-unknown-linux-gnu.tar.gz", "sha256-KwiQ9aVZAK90HxM5GMJlaRm78Ywqt3QbTKhAOpDmR6k="),
    "win32-x64": target("ruff-x86_64-pc-windows-msvc.zip", "sha256-qE2ax0r471ushKGIihY03xjm6YXi+TDTXAUr6s0A6BM=", "ruff.exe"),
  },
  notices: [{
    url: "https://raw.githubusercontent.com/astral-sh/ruff/ba65abf8ba7bfbcc059f7fb9712be5ba9cab6abc/LICENSE",
    integrity: "sha256-JZfYVBIrd93HGXFWTKI1CjdghXXOMkrcVlCisgUcjxg=",
    filename: "ruff-0.17.3-license.txt",
  }],
  fit: { role: "check", input: "Python files in the reviewed copy", skills: [] },
} as const satisfies Pack
