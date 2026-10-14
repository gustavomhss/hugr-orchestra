import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { enforcedPacmanConfig, pacmanConfigQuery, prepareBootstrapConfig, verifyBootstrapConfig } from "./bootstrap-config"

// Pure serialized-config and retained-file controls. No pacman or native
// process is substituted; actual pacman enforcement remains the runtime oracle.
const resolved = `[options]
RootDir = /
DownloadUser = alpm
SigLevel = PackageRequired PackageTrustedOnly DatabaseOptional DatabaseTrustedOnly
DisableSandboxFilesystem
NoExtract = usr/share/help/* !usr/share/help/en* etc/pacman.conf etc/pacman.d/mirrorlist
CacheDir = /var/cache/pacman/pkg/
[core]
Server = https://fastly.mirror.pkgbuild.com/core/os/x86_64
Server = https://geo.mirror.pkgbuild.com/core/os/x86_64
[extra]
SigLevel = PackageRequired PackageTrustedOnly DatabaseRequired DatabaseTrustedOnly
Server = https://fastly.mirror.pkgbuild.com/extra/os/x86_64
`
const enforced = resolved.replace("DisableSandboxFilesystem\n", "")

test("remove only filesystem opt-out; preserve global inheritance, explicit policy, NoExtract and all URLs byte-exact", () => {
  expect(enforcedPacmanConfig(resolved)).toBe(enforced)
  expect(enforcedPacmanConfig(enforced)).toBe(enforced)
  expect(enforced.split("[core]\n")[1].split("[extra]\n")[0]).not.toContain("SigLevel")
  expect(enforcedPacmanConfig(resolved.replace("DisableSandboxFilesystem", "  DisableSandboxFilesystem  "))).toBe(enforced)
})

test("directive names inside ordinary values are not sandbox switches", () => {
  const input = enforced.replace("CacheDir = /var/cache/pacman/pkg/", "CacheDir = /var/cache/DisableSandbox/")
  expect(enforcedPacmanConfig(input)).toBe(input)
})

for (const item of [
  { name: "generic sandbox opt-out", input: resolved.replace("DisableSandboxFilesystem", "DisableSandbox"), error: "AUR_PACMAN_SANDBOX_DISABLE_FORBIDDEN" },
  { name: "syscall sandbox opt-out", input: resolved.replace("DisableSandboxFilesystem", "DisableSandboxSyscalls"), error: "AUR_PACMAN_SANDBOX_DISABLE_FORBIDDEN" },
  { name: "generic opt-out with value", input: resolved.replace("DisableSandboxFilesystem", "DisableSandbox = false"), error: "AUR_PACMAN_SANDBOX_DISABLE_FORBIDDEN" },
  { name: "filesystem opt-out with invented value", input: resolved.replace("DisableSandboxFilesystem", "DisableSandboxFilesystem = false"), error: "AUR_PACMAN_FILESYSTEM_DISABLE_DIRECTIVE_INVALID" },
  { name: "filesystem directive in repository", input: enforced.replace("[core]\n", "[core]\nDisableSandboxFilesystem\n"), error: "AUR_PACMAN_FILESYSTEM_DISABLE_DIRECTIVE_INVALID" },
  { name: "unresolved Include", input: resolved.replace("DisableSandboxFilesystem", "Include = /etc/pacman.d/*.conf"), error: "AUR_PACMAN_RESOLVED_CONFIG_INCLUDE_UNRESOLVED" },
  { name: "empty projection", input: "", error: "AUR_PACMAN_RESOLVED_CONFIG_INCOMPLETE" },
  { name: "missing options section", input: resolved.replace("[options]\n", ""), error: "AUR_PACMAN_RESOLVED_CONFIG_DIRECTIVE_INVALID" },
  { name: "duplicate options section", input: resolved.replace("[core]\n", "[options]\n"), error: "AUR_PACMAN_RESOLVED_CONFIG_SECTION_INVALID" },
  { name: "duplicate repository", input: resolved.replace("[extra]\n", "[core]\n"), error: "AUR_PACMAN_RESOLVED_CONFIG_SECTION_INVALID" },
  { name: "missing global signature policy", input: resolved.replace(/^SigLevel = .*\n/m, ""), error: "AUR_PACMAN_RESOLVED_CONFIG_INCOMPLETE" },
  { name: "missing download user", input: resolved.replace("DownloadUser = alpm\n", ""), error: "AUR_PACMAN_RESOLVED_CONFIG_INCOMPLETE" },
  { name: "repository without servers", input: resolved.replace(/^Server = .*core.*\n/gm, ""), error: "AUR_PACMAN_RESOLVED_CONFIG_INCOMPLETE" },
  { name: "missing repository census", input: resolved.split("[core]")[0], error: "AUR_PACMAN_RESOLVED_CONFIG_INCOMPLETE" },
  { name: "truncated final record", input: resolved.trimEnd(), error: "AUR_PACMAN_RESOLVED_CONFIG_INCOMPLETE" },
  { name: "diagnostic instead of config", input: "warning: unknown directive\n", error: "AUR_PACMAN_RESOLVED_CONFIG_DIRECTIVE_INVALID" },
]) test(`refuse ${item.name}`, () => {
  expect(() => enforcedPacmanConfig(item.input)).toThrow(item.error)
  expect(enforcedPacmanConfig(resolved)).toBe(enforced)
})

test("checked queries reject failed, malformed, missing status and any stderr diagnostic", () => {
  expect(pacmanConfigQuery({ status: "0\n", stderr: "", resolved })).toBe(resolved)
  for (const status of ["1\n", "", "0", "0\n1\n"]) {
    expect(() => pacmanConfigQuery({ status, stderr: "", resolved })).toThrow("AUR_PACMAN_CONFIG_QUERY_FAILED")
  }
  for (const stderr of ["warning: unknown directive\n", "\n"]) {
    expect(() => pacmanConfigQuery({ status: "0\n", stderr, resolved })).toThrow("AUR_PACMAN_CONFIG_QUERY_DIAGNOSTIC")
  }
})

test("actual file helpers retain original bytes and admit owned complete config round-trip", async () => {
  await using f = await fixture()
  await prepareBootstrapConfig(f.directory)
  expect(await readFile(join(f.directory, "bootstrap-pacman.conf"), "utf8")).toBe(enforced)
  await verifyBootstrapConfig(f.directory)
  expect(await readFile(join(f.directory, "bootstrap-pacman-original.conf"), "utf8")).toBe(f.original)
  expect(await readFile(join(f.directory, "bootstrap-config-original.txt"), "utf8")).toBe(resolved)
})

for (const item of [
  { file: "bootstrap-pacman.conf", bytes: resolved, error: "AUR_PACMAN_OWNED_CONFIG_CHANGED" },
  { file: "bootstrap-config-enforced.txt", bytes: resolved, error: "AUR_PACMAN_ENFORCED_CONFIG_ROUNDTRIP_MISMATCH" },
  { file: "bootstrap-config-enforced.txt", bytes: enforced.replace("etc/pacman.conf", "etc/changed.conf"), error: "AUR_PACMAN_ENFORCED_CONFIG_ROUNDTRIP_MISMATCH" },
  { file: "bootstrap-config-enforced.txt", bytes: enforced.replace("https://geo.mirror.pkgbuild.com", "https://wrong.example"), error: "AUR_PACMAN_ENFORCED_CONFIG_ROUNDTRIP_MISMATCH" },
  { file: "bootstrap-config-enforced.txt", bytes: enforced.replace("DatabaseOptional", "DatabaseRequired"), error: "AUR_PACMAN_ENFORCED_CONFIG_ROUNDTRIP_MISMATCH" },
  { file: "bootstrap-config-enforced.status", bytes: "12\n", error: "AUR_PACMAN_CONFIG_QUERY_FAILED" },
  { file: "bootstrap-config-enforced.stderr", bytes: "warning: unknown directive\n", error: "AUR_PACMAN_CONFIG_QUERY_DIAGNOSTIC" },
  { file: "bootstrap-config-original.status", bytes: "1\n", error: "AUR_PACMAN_CONFIG_QUERY_FAILED" },
]) test(`round-trip refuses ${item.file}: ${item.error}`, async () => {
  await using f = await fixture()
  await prepareBootstrapConfig(f.directory)
  const path = join(f.directory, item.file)
  const original = await readFile(path, "utf8")
  await Bun.write(path, item.bytes)
  await expect(verifyBootstrapConfig(f.directory)).rejects.toThrow(item.error)
  await Bun.write(path, original)
  await verifyBootstrapConfig(f.directory)
})

test("missing query evidence and empty original cannot produce an owned configuration", async () => {
  await using f = await fixture()
  await Bun.write(join(f.directory, "bootstrap-pacman-original.conf"), "")
  await expect(prepareBootstrapConfig(f.directory)).rejects.toThrow("AUR_PACMAN_ORIGINAL_CONFIG_EMPTY")
  expect(await Bun.file(join(f.directory, "bootstrap-pacman.conf")).exists()).toBe(false)
  await Bun.write(join(f.directory, "bootstrap-pacman-original.conf"), f.original)
  await rm(join(f.directory, "bootstrap-config-original.stderr"))
  await expect(prepareBootstrapConfig(f.directory)).rejects.toMatchObject({ code: "ENOENT" })
  expect(await Bun.file(join(f.directory, "bootstrap-pacman.conf")).exists()).toBe(false)
})

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "aur-bootstrap-config-unit-"))
  const original = "[options]\nInclude = /etc/pacman.d/owned-original.conf\n"
  await Bun.write(join(directory, "bootstrap-pacman-original.conf"), original)
  await Promise.all(["original", "enforced"].flatMap((stage) => [
    Bun.write(join(directory, `bootstrap-config-${stage}.txt`), stage === "original" ? resolved : enforced),
    Bun.write(join(directory, `bootstrap-config-${stage}.status`), "0\n"),
    Bun.write(join(directory, `bootstrap-config-${stage}.stderr`), ""),
  ]))
  return { directory, original, [Symbol.asyncDispose]: () => rm(directory, { recursive: true, force: true }) }
}
