import type { PinnedArtifact } from "../../pinned-artifact"
import type { Runtime } from "../manifest"

// Go pins are the sha256 fields of https://go.dev/dl/?mode=json&include=all for the release, in SRI form; each download
// hashed to the same value when pinning.
const GO_VERSION = "1.25.14"

// Every archive holds one `go/` tree with these children; all of them move, so the runtime is a complete GOROOT
// (`go.env` carries the toolchain's defaults, `pkg/tool` its compiler and linker).
const GOROOT = [
  "CONTRIBUTING.md",
  "LICENSE",
  "PATENTS",
  "README.md",
  "SECURITY.md",
  "VERSION",
  "api",
  "bin",
  "codereview.cfg",
  "doc",
  "go.env",
  "lib",
  "misc",
  "pkg",
  "src",
  "test",
]

const go = (asset: string, integrity: PinnedArtifact.Artifact["integrity"]) => {
  const windows = asset.startsWith("windows-")
  return {
    artifact: {
      url: `https://go.dev/dl/go${GO_VERSION}.${asset}.${windows ? "zip" : "tar.gz"}`,
      integrity,
      format: windows ? ("zip" as const) : ("tar.gz" as const),
      entries: GOROOT.map((name) => ({ from: `go/${name}`, to: name })),
    },
    executable: windows ? "bin/go.exe" : "bin/go",
  }
}

export default {
  id: "go",
  version: GO_VERSION,
  license: "BSD-3-Clause",
  upstream: "golang/go",
  targets: {
    "darwin-arm64": go("darwin-arm64", "sha256-WybAtvMIJA/KJhT7AvYiz8yMDMO2nHi7pIRUiaRZAlk="),
    "darwin-x64": go("darwin-amd64", "sha256-sJCHpn1Xkqiw/L90IS1iVgyUrIqP11D/kg2MtfHiARg="),
    "linux-arm64": go("linux-arm64", "sha256-m/I06nD/7JNH/fayLOSt1RcX0zhqOKRB6Mh0P8616u4="),
    "linux-x64": go("linux-amd64", "sha256-ohrlYzomm81+kM92fkgiVjN5XpnYMXQsvzOXBk/udxI="),
    "win32-x64": go("windows-amd64", "sha256-EZBEqSs5h8NBzWrrslZnbdR4DSkve05yo+mXZneEFpc="),
  },
} satisfies Runtime
