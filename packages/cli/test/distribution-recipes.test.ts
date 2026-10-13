import { expect, test } from "bun:test"
import { $ } from "bun"
import { chmod, lstat, mkdir, mkdtemp, readdir, readlink, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { distributionRecipes } from "../script/distribution-recipes"
import type { DistributionManifest } from "../script/distribution-payload"
import { namedTargets } from "../script/targets"

const targets = ["darwin-arm64", "darwin-x64-baseline", "linux-x64-baseline", "linux-arm64"]
const assets = targets.map((target, index) => ({
  target,
  url: `https://downloads.example.test/orchestra-${target}.tar.gz`,
  sha256: String(index + 1).repeat(64),
}))

test("renders frozen Homebrew and AUR recipes for matching native builder targets", () => {
  const recipes = distributionRecipes({ version: "1.2.3", assets })
  expect(targets.every((target) => namedTargets.some((item) => item.target === target))).toBe(true)
  expect(recipes.homebrew).toContain("class Orchestra < Formula")
  expect(recipes.homebrew).toContain('require "json"')
  expect(recipes.homebrew).toContain("depends_on :macos")
  expect(recipes.homebrew).toContain("preserve_rpath")
  expect(recipes.homebrew).toContain('libexec.install "bin", "package.json", "distribution.json", "checksums.sha256"')
  expect(recipes.homebrew).toContain('bin.install_symlink libexec/"bin/orchestra"')
  expect(recipes.homebrew).toContain('shell_output("#{bin}/orchestra --version")')
  expect(recipes.homebrew).toContain('libexec/"bin/tree-sitter"')
  expect(recipes.aur).toContain("pkgname=orchestra-bin")
  expect(recipes.aur).toContain("arch=('x86_64' 'aarch64')")
  expect(recipes.aur).toContain("options=('!strip')")
  expect(recipes.aur).toContain("makedepends=('jq')")
  expect(recipes.aur).toContain("depends=('glibc' 'gcc-libs')")
  expect(recipes.aur).toContain(
    'cp -a "$srcdir/bin" "$srcdir/package.json" "$srcdir/distribution.json" "$srcdir/checksums.sha256" "$pkgdir/usr/lib/orchestra/"',
  )
  expect(recipes.aur).toContain('ln -s /usr/lib/orchestra/bin/orchestra "$pkgdir/usr/bin/orchestra"')
  expect(recipes.aur).toContain(assets[2].sha256)
  expect(recipes.aur).toContain(assets[3].sha256)
})

test("rejects malformed versions, unsafe URLs and incomplete or invalid target sets", () => {
  for (const version of [
    "1.0.0\nurl",
    "1.0.0\n",
    "1.0.0\r\n",
    "1.0.0;system('id')",
    "latest",
    "1.2",
    "v1.2.3",
    "1.2.3-rc.1",
    "1.2.3+build.1",
    "1.2.3-rc.1+build.1",
  ])
    expect(() => distributionRecipes({ version, assets })).toThrow()
  for (const url of [
    "http://downloads.example.test/a",
    "https://user:pass@example.test/a",
    "https://bad.test/\n",
    "https://bad.test/\r",
    "https://bad.test/\t",
    "https://bad.test/\0",
    "https://bad.test/\x1f",
    "https://bad.test/\x7f",
    "https://bad.test/a b",
    " https://bad.test/a",
    "https://bad.test/a\\b",
    "https://bad.test/a\\'b",
  ])
    expect(() => distributionRecipes({
      version: "1.2.3",
      assets: assets.map((asset, index) => index ? asset : { ...asset, url }),
    })).toThrow()
  expect(() => distributionRecipes({ version: "1.2.3", assets: assets.slice(1) })).toThrow()
  expect(() => distributionRecipes({ version: "1.2.3", assets: [...assets, assets[0]] })).toThrow()
  expect(() => distributionRecipes({
    version: "1.2.3",
    assets: assets.map((asset, index) => index ? asset : { ...asset, sha256: "z".repeat(64) }),
  })).toThrow()
  expect(() => distributionRecipes({ version: "1.2.3", assets: [...assets, { ...assets[0], target: "linux-arm64-musl" }] })).toThrow()
})

// Inert synthetic payloads prove recipe behavior, not native Homebrew/makepkg qualification.
const quotedAssets = assets.map((asset) => ({
  ...asset,
  url: asset.url.replace(".test/", ".test/a'b\"#{not_ruby_interpolation}$(not_shell_command)%20/"),
}))

test("executes Ruby formula and restores every descriptor mode plus nonexecutable metadata", async () => {
  const fixture = await payloadFixture("darwin-arm64")
  try {
    const formula = path.join(fixture.root, "orchestra.rb")
    const prefix = path.join(fixture.root, "brew-prefix")
    await Bun.write(formula, distributionRecipes({ version: "1.2.3", assets: quotedAssets }).homebrew)
    const result = await runHomebrew(formula, fixture.srcdir, prefix)
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout.toString())).toEqual({
      version: "1.2.3",
      dependencies: ["macos"],
      assets: quotedAssets.slice(0, 2).map((asset) => ({ url: asset.url, sha256: asset.sha256 })),
    })
    await expectPayload(path.join(prefix, "libexec"), fixture.payload)
    expect(await readdir(fixture.srcdir)).not.toContain("SHOULD_NOT_EXIST")
    expect((await readdir(prefix)).sort()).toEqual(["bin", "libexec"])
    expect(await readdir(path.join(prefix, "bin"))).toEqual(["orchestra"])
    expect((await lstat(path.join(prefix, "bin/orchestra"))).isSymbolicLink()).toBe(true)
    expect(await readlink(path.join(prefix, "bin/orchestra"))).toBe(path.join(prefix, "libexec/bin/orchestra"))
    expect(await Bun.file(path.join(prefix, "bin/orchestra")).bytes()).toEqual(
      await Bun.file(path.join(fixture.srcdir, "bin/orchestra")).bytes(),
    )
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test("executes bash package() with real jq and restores every descriptor mode from flat srcdir", async () => {
  const fixture = await payloadFixture()
  try {
    const pkgbuild = path.join(fixture.root, "PKGBUILD")
    const pkgdir = path.join(fixture.root, "pkg")
    await Bun.write(pkgbuild, distributionRecipes({ version: "1.2.3", assets: quotedAssets }).aur)
    const result = await runAur(pkgbuild, fixture.srcdir, pkgdir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.toString().trimEnd().split("\n")).toEqual([
      "1.2.3",
      "!strip",
      "jq",
      "glibc",
      "gcc-libs",
      quotedAssets[2].url,
      quotedAssets[2].sha256,
      quotedAssets[3].url,
      quotedAssets[3].sha256,
    ])
    await expectPayload(path.join(pkgdir, "usr/lib/orchestra"), fixture.payload)
    expect(await readdir(fixture.srcdir)).not.toContain("SHOULD_NOT_EXIST")
    expect(await readdir(pkgdir)).toEqual(["usr"])
    expect((await readdir(path.join(pkgdir, "usr"))).sort()).toEqual(["bin", "lib"])
    expect(await readdir(path.join(pkgdir, "usr/lib"))).toEqual(["orchestra"])
    expect(await readdir(path.join(pkgdir, "usr/bin"))).toEqual(["orchestra"])
    expect((await lstat(path.join(pkgdir, "usr/bin/orchestra"))).isSymbolicLink()).toBe(true)
    expect(await readlink(path.join(pkgdir, "usr/bin/orchestra"))).toBe("/usr/lib/orchestra/bin/orchestra")
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

const executableFiles = [
  "bin/orchestra",
  "bin/hugr-omni-supervisor",
  "bin/hugr_omni.node",
  "bin/extra helpers/ helper 'quoted' $(touch SHOULD_NOT_EXIST)",
]

for (const recipe of ["homebrew", "aur"] as const) {
  for (const invalid of [
    { name: "string executable", override: { executable: "true" } },
    { name: "false string executable", override: { executable: "false" } },
    { name: "numeric executable", override: { executable: 1 } },
    { name: "null executable", override: { executable: null } },
    { name: "missing executable", override: { executable: undefined } },
    { name: "absolute path", override: { path: "/outside-mode-sentinel" } },
    { name: "parent traversal", override: { path: "../outside-mode-sentinel" } },
    ...[
      "bin/./helper", "bin//helper", "bin/helper/", "bin/helper\\other",
      "bin/control\npath", "bin/nonascii-é", "bin/trailing.", "bin/trailing ",
      "bin/NUL.node", "bin/a:helper", "bin/*.node", 'bin/"helper',
    ].map((file) => ({ name: `unsafe path ${JSON.stringify(file)}`, override: { path: file } })),
  ]) {
    test(`${recipe} refuses ${invalid.name} before any chmod or public link`, async () => {
      const fixture = await payloadFixture(recipe === "homebrew" ? "darwin-arm64" : "linux-x64-baseline")
      try {
        const sentinel = path.join(fixture.root, "outside-mode-sentinel")
        await Bun.write(sentinel, "must not be chmodded or evaluated\n")
        await chmod(sentinel, 0o600)
        const directory = path.join(fixture.root, recipe === "homebrew" ? "prefix/libexec" : "prefix/usr/lib/orchestra")
        const descriptor = JSON.parse(fixture.payload["distribution.json"]) as DistributionManifest
        const override = "path" in invalid.override
          ? { path: invalid.override.path === "/outside-mode-sentinel" ? sentinel :
            invalid.override.path === "../outside-mode-sentinel" ? path.relative(directory, sentinel) : invalid.override.path }
          : invalid.override
        const files = descriptor.files.map((entry, index) => index === descriptor.files.length - 1
          ? {
            ...entry,
            ...override,
            path: "path" in override && typeof override.path === "string" ? override.path : entry.path,
          }
          : entry)
        // Keep ordering valid so path rejection cannot pass only because inventory is unsorted.
        await Bun.write(path.join(fixture.srcdir, "distribution.json"), JSON.stringify({
          ...descriptor,
          files: files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
        }))
        const result = await runFixture(recipe, fixture)
        expect(result.exitCode).not.toBe(0)
        expect((await lstat(sentinel)).mode & 0o777).toBe(0o600)
        expect((await lstat(path.join(directory, "bin/orchestra"))).mode & 0o777).toBe(0o600)
        expect(await lstat(path.join(fixture.root, recipe === "homebrew" ? "prefix/bin/orchestra" : "prefix/usr/bin/orchestra"))
          .then(() => true, (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return false
            throw error
          })).toBe(false)
      } finally {
        await rm(fixture.root, { recursive: true, force: true })
      }
    })
  }

  for (const content of ["{invalid json", "null", "[]", "{}", "multiple documents"]) {
    test(`${recipe} refuses invalid descriptor ${content}`, async () => {
      const fixture = await payloadFixture(recipe === "homebrew" ? "darwin-arm64" : "linux-x64-baseline")
      try {
        await Bun.write(path.join(fixture.srcdir, "distribution.json"), content === "multiple documents"
          ? fixture.payload["distribution.json"] + fixture.payload["distribution.json"]
          : content)
        expect((await runFixture(recipe, fixture)).exitCode).not.toBe(0)
      } finally {
        await rm(fixture.root, { recursive: true, force: true })
      }
    })
  }

  for (const invalid of ["symlink file", "symlink directory", "symlink descriptor", "symlink table", "directory file", "missing file"]) {
    test(`${recipe} refuses ${invalid} without chmodding external target`, async () => {
      const fixture = await payloadFixture(recipe === "homebrew" ? "darwin-arm64" : "linux-x64-baseline")
      try {
        const external = path.join(fixture.root, "external")
        await mkdir(external)
        const sentinel = path.join(external, path.basename(executableFiles[3]))
        await Bun.write(sentinel, "external target bytes\n")
        await chmod(sentinel, 0o600)
        const file = invalid === "symlink directory" ? "bin/extra helpers" :
          invalid === "symlink descriptor" ? "distribution.json" :
          invalid === "symlink table" ? "checksums.sha256" : executableFiles[3]
        await rm(path.join(fixture.srcdir, file), { recursive: true })
        if (invalid.startsWith("symlink")) {
          const target = invalid === "symlink directory" ? external : sentinel
          if (invalid === "symlink descriptor") await Bun.write(sentinel, fixture.payload["distribution.json"])
          await symlink(target, path.join(fixture.srcdir, file))
        }
        if (invalid === "directory file") await mkdir(path.join(fixture.srcdir, file))
        expect((await runFixture(recipe, fixture)).exitCode).not.toBe(0)
        expect((await lstat(sentinel)).mode & 0o777).toBe(0o600)
      } finally {
        await rm(fixture.root, { recursive: true, force: true })
      }
    })
  }
}

async function payloadFixture(target = "linux-x64-baseline") {
  const root = await mkdtemp(path.join(tmpdir(), "distribution-recipes-"))
  const srcdir = path.join(root, "src")
  const payload: Record<string, string> = {
    "bin/orchestra": "inert CLI bytes\0\x01\n",
    "bin/hugr-omni-supervisor": "inert supervisor bytes\0\x02\n",
    "bin/hugr_omni.node": "inert executable addon bytes\0\x03\n",
    "bin/extra helpers/ helper 'quoted' $(touch SHOULD_NOT_EXIST)": "inert executable helper bytes\0\x05\n",
    "bin/tree-sitter/example/package.json": '{"name":"example"}\n',
    "bin/tree-sitter/example/prebuilds/native.node": "inert binding bytes\0\x04\n",
    "bin/tree-sitter/example/LICENSE": "fixture license\n",
    "package.json": JSON.stringify({
      name: `@orchestra/cli-${target}`,
      version: "1.2.3",
      os: [target.startsWith("darwin-") ? "darwin" : "linux"],
      cpu: [target.endsWith("arm64") ? "arm64" : "x64"],
    }) + "\n",
  }
  payload["distribution.json"] = JSON.stringify({
    schema: "orchestra-distribution-v1",
    version: "1.2.3",
    target,
    files: Object.keys(payload).sort().map((file) => ({
      path: file,
      sha256: new Bun.CryptoHasher("sha256").update(payload[file]).digest("hex"),
      executable: executableFiles.includes(file),
    })),
  }) + "\n"
  payload["checksums.sha256"] = Object.keys(payload).sort().map((file) =>
    `${new Bun.CryptoHasher("sha256").update(payload[file]).digest("hex")}  ${file}\n`,
  ).join("")
  await Promise.all(Object.entries(payload).map(async ([file, content]) => {
    await mkdir(path.dirname(path.join(srcdir, file)), { recursive: true })
    await Bun.write(path.join(srcdir, file), content)
    // Flip both flags, including descriptor/table: archive modes are not authoritative.
    await chmod(path.join(srcdir, file), executableFiles.includes(file) ? 0o600 : 0o755)
  }))
  await Bun.write(path.join(root, "downloaded.tar.gz"), "fake downloaded archive\n")
  await symlink(path.join(root, "downloaded.tar.gz"), path.join(srcdir, "orchestra.tar.gz"))
  await Bun.write(path.join(srcdir, ".build-state"), "hidden build garbage\n")
  await mkdir(path.join(srcdir, "build"))
  await Bun.write(path.join(srcdir, "build/garbage"), "build garbage\n")
  return { root, srcdir, payload }
}

async function runFixture(recipe: "homebrew" | "aur", fixture: Awaited<ReturnType<typeof payloadFixture>>) {
  const file = path.join(fixture.root, recipe === "homebrew" ? "orchestra.rb" : "PKGBUILD")
  await Bun.write(file, distributionRecipes({ version: "1.2.3", assets: quotedAssets })[recipe])
  return recipe === "homebrew"
    ? runHomebrew(file, fixture.srcdir, path.join(fixture.root, "prefix"))
    : runAur(file, fixture.srcdir, path.join(fixture.root, "prefix"))
}

async function expectPayload(directory: string, payload: Record<string, string>) {
  expect((await readdir(directory)).sort()).toEqual(["bin", "checksums.sha256", "distribution.json", "package.json"])
  const actual = await readdir(directory, { recursive: true })
  const expected = [...new Set(Object.keys(payload).flatMap((file) => {
    const parts = file.split("/")
    return parts.map((_, index) => parts.slice(0, index + 1).join("/"))
  }))]
  expect(actual.sort()).toEqual(expected.sort())
  await Promise.all(Object.entries(payload).map(async ([file, content]) => {
    expect((await lstat(path.join(directory, file))).isFile()).toBe(true)
    expect(await Bun.file(path.join(directory, file)).bytes()).toEqual(new TextEncoder().encode(content))
    expect((await lstat(path.join(directory, file))).mode & 0o777).toBe(executableFiles.includes(file) ? 0o755 : 0o644)
  }))
}

async function runHomebrew(formula: string, srcdir: string, prefix: string) {
  const ruby = Bun.which("ruby")
  if (!ruby) throw new Error("Distribution recipe CI requires ruby")
  // The formula itself must load JSON; the capture DSL does not preload it.
  const program = `
require "pathname"
require "fileutils"

class InstallPath < Pathname
  def install(*entries)
    FileUtils.mkdir_p(self)
    entries.each { |entry| FileUtils.cp_r(entry, self, preserve: true, dereference_root: false) }
  end

  def install_symlink(target)
    FileUtils.mkdir_p(self)
    File.symlink(target, self/target.basename)
  end
end

class Formula
  class << self
    attr_reader :urls, :dependencies
    def desc(value); end
    def homepage(value); end
    def version(value = nil)
      @version = value unless value.nil?
      @version
    end
    def depends_on(value)
      (@dependencies ||= []) << value
    end
    def preserve_rpath; @preserve_rpath = true; end
    def preserve_rpath?; @preserve_rpath == true; end
    def on_arm(&block); class_eval(&block); end
    def on_intel(&block); class_eval(&block); end
    def url(value)
      (@urls ||= []) << { url: value }
    end
    def sha256(value); @urls.last[:sha256] = value; end
    def test(&block); end
  end

  def initialize(prefix); @prefix = Pathname.new(prefix); end
  def libexec; InstallPath.new(@prefix/"libexec"); end
  def bin; InstallPath.new(@prefix/"bin"); end
  def chmod(mode, target); FileUtils.chmod(mode, target); end
end

load ARGV.fetch(0)
Dir.chdir(ARGV.fetch(1)) { Orchestra.new(ARGV.fetch(2)).install }
puts JSON.generate({ version: Orchestra.version, dependencies: Orchestra.dependencies, assets: Orchestra.urls })
`
  return $`${ruby} - ${formula} ${srcdir} ${prefix} < ${new Blob([program])}`.nothrow().quiet()
}

async function runAur(pkgbuild: string, srcdir: string, pkgdir: string) {
  const bash = Bun.which("bash")
  if (!bash) throw new Error("Distribution recipe CI requires bash")
  if (!Bun.which("jq")) throw new Error("Distribution recipe CI requires jq")
  const program = `
set -euo pipefail
source "$1"
srcdir="$2"
pkgdir="$3"
cd "$srcdir"
package
printf '%s\\n' "$pkgver" "\${options[@]}" "\${makedepends[@]}" "\${depends[@]}" "\${source_x86_64[0]}" "\${sha256sums_x86_64[0]}" "\${source_aarch64[0]}" "\${sha256sums_aarch64[0]}"
`
  return $`${bash} -s -- ${pkgbuild} ${srcdir} ${pkgdir} < ${new Blob([program])}`.nothrow().quiet()
}
