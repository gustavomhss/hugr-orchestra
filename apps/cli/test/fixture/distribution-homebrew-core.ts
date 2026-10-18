import { expect } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { command, sha256, successful } from "./distribution-native"
import type { Sandbox } from "./distribution-native"

// HB-CORE: preserve the real macOS pkgconf check, with official pinned metadata.
// A blob-filtered sparse checkout avoids Homebrew's implicit full-history core clone.
export async function privateCoreTap(prefix: string, git: string, box: Pick<Sandbox, "cwd" | "env">,
  artifacts: string) {
  const revision = "3e60bfb7e813eaedb3ffc19532998cd9bd2fd750"
  const source = "https://github.com/Homebrew/homebrew-core.git"
  const directory = join(prefix, "Library/Taps/homebrew/homebrew-core")
  await successful([git, "clone", "--depth", "1", "--filter=blob:none", "--no-checkout", source, directory], box, 180_000)
  await successful([git, "-C", directory, "fetch", "--depth", "1", "--filter=blob:none", "origin", revision], box, 180_000)
  await successful([git, "-C", directory, "sparse-checkout", "set", "--no-cone",
    "/Formula/p/pkgconf.rb", "/Aliases/pkg-config", "/*.json"], box, 180_000)
  await successful([git, "-C", directory, "checkout", "--detach", revision], box, 180_000)
  expect(await successful([git, "-C", directory, "rev-parse", "HEAD"], box)).toBe(revision)
  expect(await successful([git, "-C", directory, "remote", "get-url", "origin"], box)).toBe(source)
  expect(await successful([git, "-C", directory, "status", "--porcelain"], box)).toBe("")
  const path = join(directory, "Formula/p/pkgconf.rb")
  const committed = await command([git, "-C", directory, "show", `${revision}:Formula/p/pkgconf.rb`], box)
  expect(committed.code, "HOMEBREW_CORE_COMMITTED_FORMULA_READ_FAILED").toBe(0)
  expect(committed.stdout.length, "HOMEBREW_CORE_FORMULA_MUST_NOT_BE_EMPTY").toBeGreaterThan(0)
  expect(await readFile(path, "utf8"), "HOMEBREW_CORE_FORMULA_MUST_MATCH_OFFICIAL_COMMIT").toBe(committed.stdout)
  // Exercise the exact upstream lookup before the first negative install/upgrade.
  // No monkey-patch, fake formula, inherited host Cellar or API substitution.
  expect(await successful([join(prefix, "bin/brew"), "ruby", "-e", `
require "formula"
require "extend/os/mac/pkgconf"
pkgconf = Formula["pkgconf"]
abort "HOMEBREW_PKGCONF_LOOKUP_PATH_MISMATCH" unless pkgconf.path.to_s == ${JSON.stringify(path)}
abort "HOMEBREW_PRIVATE_PKGCONF_MUST_NOT_BE_INSTALLED" if pkgconf.any_version_installed?
abort "HOMEBREW_PRIVATE_PKGCONF_SDK_MISMATCH" unless Homebrew::Pkgconf.macos_sdk_mismatch.nil?
puts "HOMEBREW_OFFICIAL_PKGCONF_LOOKUP_READY"
`], box, 180_000)).toBe("HOMEBREW_OFFICIAL_PKGCONF_LOOKUP_READY")
  console.info(`Homebrew core metadata: revision=${revision} pkgconf_sha256=${sha256(committed.stdout)}`)
  await Bun.write(join(artifacts, "brew-core-origin.json"), JSON.stringify({
    source, revision, directory, formula: path, formulaSha256: sha256(committed.stdout),
    checkout: "official-blob-filtered-sparse", pkgconfInstalled: false,
  }, null, 2))
}
