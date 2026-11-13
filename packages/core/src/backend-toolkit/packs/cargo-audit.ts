import type { Pack } from "../manifest"

// Release archives, members and both licence texts independently fetched and hashed at cargo-audit/v0.23.0.
// Only Linux x64 has runtime qualification. Published targets do not qualify their execution.
const VERSION = "0.23.0"
const artifact = (target: string, integrity: `sha256-${string}`, windows = false) => {
  const name = `cargo-audit-${target}-v${VERSION}`
  const executable = windows ? "cargo-audit.exe" : "cargo-audit"
  return {
    artifact: {
      url: `https://github.com/rustsec/rustsec/releases/download/cargo-audit/v${VERSION}/${name}.${windows ? "zip" : "tgz"}`,
      integrity,
      format: windows ? "zip" as const : "tar.gz" as const,
      entries: [{ from: `${name}/${executable}`, to: executable, executable: true }],
    },
    executable,
  }
}

export default {
  id: "cargo-audit", version: VERSION, license: "Apache-2.0 OR MIT", upstream: "rustsec/rustsec",
  fit: { role: "check", input: "Cargo.lock with a host RustSec database", skills: [] },
  floor: { "darwin-arm64": {}, "darwin-x64": {}, "linux-arm64": {}, "linux-x64": {}, "win32-x64": {} },
  targets: {
    "darwin-arm64": artifact("aarch64-apple-darwin", "sha256-hBASBOW4ATyajXJRdmrr3vPn+ho+8EDN5E1ltIuMQFY="),
    "darwin-x64": artifact("x86_64-apple-darwin", "sha256-hF7AJFLdIzwpK+iHcArJmjimlymUIwge4NjqGgyWFGQ="),
    "linux-arm64": artifact("aarch64-unknown-linux-gnu", "sha256-AO/zFYQpuWKavodI6XHyn5nuU9TP9UolByy7FRZ73ag="),
    "linux-x64": artifact("x86_64-unknown-linux-gnu", "sha256-t3mTUyslP8v1UJltdxZGXsPXNNTnTn+Hv7ZaGa3Q+1k="),
    "win32-x64": artifact("x86_64-pc-windows-msvc", "sha256-qv62EgZzAClgGnLmaaEiMfhnRCfmJI0C9ss4LLNtVrQ=", true),
  },
  notices: [
    { url: "https://raw.githubusercontent.com/rustsec/rustsec/cargo-audit/v0.23.0/cargo-audit/LICENSE-MIT", integrity: "sha256-KWYmZrRN/4SXe0bgVkLN75ELw6k6F7X9huYyuvpZzyE=", filename: "cargo-audit-0.23.0-license-mit.txt" },
    { url: "https://raw.githubusercontent.com/rustsec/rustsec/cargo-audit/v0.23.0/cargo-audit/LICENSE-APACHE", integrity: "sha256-pg7qgXUUUxZo1+AHZXMUSf4U0FnTJJ4LyTs23kX3WfI=", filename: "cargo-audit-0.23.0-license-apache.txt" },
  ],
} as const satisfies Pack
