import { expect, test } from "bun:test"
import { $ } from "bun"
import { chmod, lstat, mkdir, mkdtemp, readlink, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { distributionRecipes } from "../script/distribution-recipes"

const assets = ["darwin-arm64", "darwin-x64-baseline", "linux-x64-baseline", "linux-arm64"].map((target) => ({
  target,
  url: `https://downloads.example.test/${target}.tar.gz`,
  sha256: "1".repeat(64),
}))

test("renders safe AUR filenames before IPv6 and double-colon HTTPS URLs on every platform", () => {
  const unusual = assets.map((asset) => ({
    ...asset,
    url: asset.target === "linux-x64-baseline" ? "https://[2001:db8::1]/orchestra.tar.gz" :
      "https://downloads.example.test/path::part/orchestra.tar.gz",
  }))
  const recipe = distributionRecipes({ version: "1.2.3", assets: unusual }).aur
  expect(recipe).toContain("source_x86_64=('orchestra-1.2.3-linux-x64-baseline.tar.gz::https://[2001:db8::1]/orchestra.tar.gz')")
  expect(recipe).toContain("source_aarch64=('orchestra-1.2.3-linux-arm64.tar.gz::https://downloads.example.test/path::part/orchestra.tar.gz')")
})

// Execute generated recipes only: inert bytes, no Homebrew/makepkg tidy or package qualification.
for (const recipe of ["homebrew", "aur"] as const) {
  for (const unsafe of [
    "absolute path", "parent traversal", "bin/./orchestra", "bin//orchestra", "bin/helper/",
    "bin/helper\\other", "bin/control\npath", "bin/nonascii-é", "bin/trailing.", "bin/trailing ",
    "bin/NUL.node", "bin/a:helper", "bin/*.node", 'bin/"helper',
  ]) {
    test.skipIf(process.platform === "win32")(
      `${recipe} rejects existing unsafe target ${JSON.stringify(unsafe)} with full modes/link intact (Windows skipped: POSIX filenames/modes/symlinks)`,
      async () => {
        const root = await mkdtemp(path.join(tmpdir(), "distribution-recipe-paths-"))
        try {
          const srcdir = path.join(root, "src")
          const prefix = path.join(root, "prefix")
          const directory = path.join(prefix, recipe === "homebrew" ? "libexec" : "usr/lib/orchestra")
          const sentinel = path.join(root, "outside-mode-sentinel")
          const file = unsafe === "absolute path" ? sentinel : unsafe === "parent traversal" ? path.relative(directory, sentinel) : unsafe
          const normalized = unsafe === "bin/./orchestra" || unsafe === "bin//orchestra"
          const special = unsafe === "absolute path" || unsafe === "parent traversal" || normalized || unsafe.endsWith("/")
          const payload: Record<string, string> = {
            "bin/orchestra": "inert CLI bytes\0\x01\n",
            "bin/helper/probe": "inert helper bytes\0\x02\n",
            "package.json": JSON.stringify({
              name: `@orchestra/cli-${recipe === "homebrew" ? "darwin-arm64" : "linux-x64-baseline"}`,
              version: "1.2.3",
              os: [recipe === "homebrew" ? "darwin" : "linux"],
              cpu: [recipe === "homebrew" ? "arm64" : "x64"],
            }) + "\n",
            ...(!special ? { [file]: "inert unsafe-named companion bytes\0\x03\n" } : {}),
          }
          const files = Object.keys(payload).sort().map((name) => ({
            path: name,
            sha256: new Bun.CryptoHasher("sha256").update(payload[name]).digest("hex"),
            executable: name.startsWith("bin/"),
          }))
          const descriptor = {
            schema: "orchestra-distribution-v1",
            version: "1.2.3",
            target: recipe === "homebrew" ? "darwin-arm64" : "linux-x64-baseline",
            files: (special ? files.map((entry) => entry.path === (normalized ? "bin/orchestra" : "bin/helper/probe")
              ? { ...entry, path: file, sha256: unsafe === "absolute path" || unsafe === "parent traversal"
                ? new Bun.CryptoHasher("sha256").update("external sentinel bytes\n").digest("hex") : entry.sha256 }
              : entry) : files)
              .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
          }
          payload["distribution.json"] = JSON.stringify(descriptor) + "\n"
          payload["checksums.sha256"] = Object.keys(payload).sort().map((name) =>
            `${new Bun.CryptoHasher("sha256").update(payload[name]).digest("hex")}  ${name}\n`,
          ).join("")
          await mkdir(path.join(srcdir, "bin/helper"), { recursive: true })
          await Promise.all(Object.entries(payload).map(async ([name, bytes]) => {
            await Bun.write(path.join(srcdir, name), bytes)
            await chmod(path.join(srcdir, name), name.startsWith("bin/") ? 0o600 : 0o755)
          }))
          await Bun.write(sentinel, "external sentinel bytes\n")
          await chmod(sentinel, 0o640)
          // Every malformed path resolves before execution, including dot/empty segments.
          const target = path.resolve(unsafe === "parent traversal" ? directory : srcdir, file)
          // A trailing slash cannot name a POSIX regular file; its existing directory is a separate shape negative.
          expect((await lstat(target)).isFile()).toBe(!unsafe.endsWith("/"))
          if (!unsafe.endsWith("/")) {
            expect(new Bun.CryptoHasher("sha256").update(await Bun.file(target).bytes()).digest("hex")).toBe(
              descriptor.files.find((entry) => entry.path === file)!.sha256,
            )
          }
          const publicLink = path.join(prefix, recipe === "homebrew" ? "bin/orchestra" : "usr/bin/orchestra")
          await mkdir(path.dirname(publicLink), { recursive: true })
          await symlink(sentinel, publicLink)
          const linkMode = (await lstat(publicLink)).mode
          const sentinelMode = (await lstat(sentinel)).mode
          const modes = await Promise.all([...Object.keys(payload), "bin", "bin/helper"].map(async (name) => ({
            path: name,
            mode: (await lstat(path.join(srcdir, name))).mode,
          })))
          const source = path.join(root, recipe === "homebrew" ? "orchestra.rb" : "PKGBUILD")
          await Bun.write(source, distributionRecipes({ version: "1.2.3", assets })[recipe])
          const result = await execute(recipe, source, srcdir, prefix)
          expect(result.exitCode).not.toBe(0)
          expect(result.stderr.toString()).toContain(recipe === "homebrew" ? "Unsafe distribution path" : "Invalid distribution descriptor")
          await Promise.all(modes.map(async (entry) => {
            expect((await lstat(path.join(directory, entry.path))).mode).toBe(entry.mode)
          }))
          await Promise.all(Object.entries(payload).map(async ([name, bytes]) => {
            expect(await Bun.file(path.join(directory, name)).bytes()).toEqual(new TextEncoder().encode(bytes))
          }))
          expect((await lstat(sentinel)).mode).toBe(sentinelMode)
          expect(await Bun.file(sentinel).text()).toBe("external sentinel bytes\n")
          expect((await lstat(publicLink)).mode).toBe(linkMode)
          expect(await readlink(publicLink)).toBe(sentinel)
        } finally {
          await rm(root, { recursive: true, force: true })
        }
      },
    )
  }
}

async function execute(recipe: "homebrew" | "aur", source: string, srcdir: string, prefix: string) {
  if (recipe === "aur") {
    const bash = Bun.which("bash")
    if (!bash) throw new Error("Distribution recipe CI requires bash")
    if (!Bun.which("jq")) throw new Error("Distribution recipe CI requires jq")
    return $`${bash} -c ${'set -euo pipefail; source "$1"; srcdir="$2"; pkgdir="$3"; cd "$srcdir"; package'} -- ${source} ${srcdir} ${prefix}`.nothrow().quiet()
  }
  const ruby = Bun.which("ruby")
  if (!ruby) throw new Error("Distribution recipe CI requires ruby")
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
    def desc(value); end
    def homepage(value); end
    def version(value); end
    def depends_on(value); end
    def preserve_rpath; end
    def on_arm(&block); class_eval(&block); end
    def on_intel(&block); class_eval(&block); end
    def url(value); end
    def sha256(value); end
    def test(&block); end
  end
  def initialize(prefix); @prefix = Pathname.new(prefix); end
  def libexec; InstallPath.new(@prefix/"libexec"); end
  def bin; InstallPath.new(@prefix/"bin"); end
  def chmod(mode, target); FileUtils.chmod(mode, target); end
end
load ARGV.fetch(0)
Dir.chdir(ARGV.fetch(1)) { Orchestra.new(ARGV.fetch(2)).install }
`
  return $`${ruby} - ${source} ${srcdir} ${prefix} < ${new Blob([program])}`.nothrow().quiet()
}
