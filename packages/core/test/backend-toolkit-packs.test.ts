import { describe, expect, test } from "bun:test"
import path from "path"
import { BackendToolkitManifest } from "../src/backend-toolkit/manifest"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"

// Ruling M6-1: one generic check over every pack and runtime. Versions are not repeated here; a pin lives only in its
// pack file, and the recipe guard in packages/opencode/test/skill/backend-families.test.ts holds each recipe to it.

const HOSTS = [
  "github.com",
  "registry.npmjs.org",
  "nodejs.org",
  "repo1.maven.org",
  "files.pythonhosted.org",
  "go.dev",
  "dl.google.com",
  "proxy.golang.org",
  "static.rust-lang.org",
  "static.crates.io",
]
const SKILLS = [
  "backend-implement",
  "backend-api",
  "backend-data",
  "backend-concurrency",
  "backend-refactor",
  "backend-check",
]
const packs = Object.values<BackendToolkitManifest.Pack>(BackendToolkitManifest.ENGINES)
const runtimes = Object.values(BackendToolkitManifest.RUNTIMES)
const artifacts = [
  ...runtimes.flatMap((runtime) =>
    Object.values(runtime.targets).map((pin) => ({ owner: runtime.id, ...pin.artifact })),
  ),
  ...packs.flatMap((pack) => {
    if ("targets" in pack) return Object.values(pack.targets).map((pin) => ({ owner: pack.id, ...pin.artifact }))
    if (pack.install.kind === "jar" || pack.install.kind === "source")
      return [{ owner: pack.id, ...pack.install.artifact }]
    return []
  }),
]
// npm lock entries carry their own SRI integrity and registry URL. A bundled entry has neither: its bytes ship inside
// the tarball of the package that bundles it, whose own entry is pinned.
const locked = packs.flatMap((pack) => {
  if ("targets" in pack || pack.install.kind !== "npm") return []
  const lock: { packages: Record<string, { resolved?: string; integrity?: string; inBundle?: boolean }> } = JSON.parse(
    pack.install.lock,
  )
  return Object.entries(lock.packages)
    .filter(([key, entry]) => key !== "" && !entry.inBundle)
    .map(([key, entry]) => ({
      owner: `${pack.id}:${key}`,
      url: entry.resolved ?? "",
      integrity: entry.integrity ?? "",
    }))
})

describe("backend toolkit packs", () => {
  test("every pack and runtime covers each target or names why it cannot", () => {
    const gaps = [...runtimes, ...packs].flatMap((item) =>
      BackendToolkitTarget.TARGETS.filter((target) => {
        if ("targets" in item) return !(target in item.targets)
        const reason = item.unsupported?.[target]
        return reason !== undefined && reason.trim().length === 0
      }).map((target) => `${item.id}:${target}`),
    )
    expect(gaps).toEqual([])
    for (const pack of packs)
      if (!("targets" in pack)) expect(BackendToolkitManifest.RUNTIMES[pack.runtime]?.id, pack.id).toBe(pack.runtime)
  })

  test("every integrity is a distinct sha256 or sha512 SRI digest of the right length", () => {
    expect(artifacts.length).toBeGreaterThan(50)
    expect(locked.length).toBeGreaterThan(0)
    const malformed = [...artifacts, ...locked].filter((pin) => {
      const match = /^(sha256|sha512)-([A-Za-z0-9+/]+={0,2})$/.exec(pin.integrity)
      return !match || Buffer.from(match[2], "base64").length !== (match[1] === "sha256" ? 32 : 64)
    })
    expect(malformed.map((pin) => pin.owner)).toEqual([])
    expect(new Set(artifacts.map((pin) => pin.integrity)).size).toBe(artifacts.length)
    expect(new Set(artifacts.map((pin) => pin.url)).size).toBe(artifacts.length)
  })

  test("pip requirements pin every line with sha256 hashes", () => {
    const lines = packs.flatMap((pack) =>
      "targets" in pack || pack.install.kind !== "pip" ? [] : pack.install.requirements.split("\n").filter(Boolean),
    )
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.filter((line) => !/^[A-Za-z0-9._-]+==\S+(?: --hash=sha256:[0-9a-f]{64})+$/.test(line))).toEqual([])
  })

  test("every download is https from an allowed host", () => {
    expect(
      [...artifacts, ...locked]
        .filter((pin) => {
          const url = URL.parse(pin.url)
          return url?.protocol !== "https:" || !HOSTS.includes(url.hostname)
        })
        .map((pin) => `${pin.owner} ${pin.url}`),
    ).toEqual([])
  })

  test("every pack declares a valid fit and carries no unfilled pin", async () => {
    const invalid = packs.filter(
      (pack) =>
        !["generator", "check"].includes(pack.fit.role) ||
        !(pack.fit.input.trim().length > 0) ||
        pack.fit.skills.some((skill) => !SKILLS.includes(skill)) ||
        new Set(pack.fit.skills).size !== pack.fit.skills.length,
    )
    expect(invalid.map((pack) => pack.id)).toEqual([])
    // script/toolkit-pack.ts leaves TODO-PIN wherever it cannot fill a pin, in code, comments or data files.
    const dir = path.join(import.meta.dir, "../src/backend-toolkit/packs")
    const files = await Array.fromAsync(new Bun.Glob("*").scan(dir))
    expect(files).toContain("index.ts")
    const unfilled = await Promise.all(
      files.map(async (file) => ((await Bun.file(path.join(dir, file)).text()).includes("TODO-PIN") ? [file] : [])),
    )
    expect(unfilled.flat()).toEqual([])
    // gitleaks is the host-side Memory scanner, with no recipe.
    expect(BackendToolkitManifest.ENGINES.gitleaks.fit).toMatchObject({ role: "check", skills: [] })
  })
})
