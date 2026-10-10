import type { PinnedArtifact } from "../../pinned-artifact"
import type { Pack } from "../manifest"

// Pins are the GitHub release assets' sha256 digests in SRI form; buf's sha256.txt agreed with them when pinning.
const VERSION = "1.73.0"

const target = (asset: string, integrity: PinnedArtifact.Artifact["integrity"], executable = "buf") => ({
  artifact: {
    url: `https://github.com/bufbuild/buf/releases/download/v${VERSION}/buf-${asset}`,
    integrity,
    format: "raw" as const,
    entries: [{ from: `buf-${asset}`, to: executable, executable: true }],
  },
  executable,
})

export default {
  id: "buf",
  version: VERSION,
  license: "Apache-2.0",
  upstream: "bufbuild/buf",
  dependencies: ["protoc-gen-es"],
  targets: {
    "darwin-arm64": target("Darwin-arm64", "sha256-bm3w/vRSLk5D3+fDQYc8PywpzrRanfpeC61VgLiyAi8="),
    "darwin-x64": target("Darwin-x86_64", "sha256-/3jQ6/NBgOv6gdNwJ1hR7GMPywiL8z4hP9cj0P10RKY="),
    "linux-arm64": target("Linux-aarch64", "sha256-kCt1Jn239Dkembf6B1YFDlNUI0zAQ371Du6ceIlQx6M="),
    "linux-x64": target("Linux-x86_64", "sha256-jymGKYrQjwzBv5mbl5e3w4Ot8y1+3w9z1vHhpwG66sE="),
    "win32-x64": target("Windows-x86_64.exe", "sha256-E1QvKJLE93QVDdtSUmbWQh1Fez50EpcFa2RCeFNSbjY=", "buf.exe"),
  },
  fit: { role: "check", input: "a Buf module of .proto files", skills: ["backend-api"] },
} as const satisfies Pack
