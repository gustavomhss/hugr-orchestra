const homebrewTargets = ["darwin-arm64", "darwin-x64-baseline"]
const aurTargets = ["linux-x64-baseline", "linux-arm64"]

export function distributionRecipes(input: {
  version: string
  assets: { target: string; url: string; sha256: string }[]
}): { homebrew: string; aur: string } {
  // Preparation admits stable versions only; prerelease ordering is not defined for these channels.
  if (input.version.match(/^[0-9]+\.[0-9]+\.[0-9]+$/)?.[0] !== input.version)
    throw new Error("Invalid distribution version: stable X.Y.Z required")

  const assets = new Map<string, { url: string; sha256: string }>()
  for (const asset of input.assets) {
    if (![...homebrewTargets, ...aurTargets].includes(asset.target) || assets.has(asset.target))
      throw new Error(`Unsupported or duplicate distribution target: ${asset.target}`)
    if (asset.sha256.length !== 64 || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error(`Invalid SHA-256 for ${asset.target}`)
    if (/[^\x21-\x7e]|\\/.test(asset.url)) throw new Error(`Invalid URL for ${asset.target}`)
    const url = new URL(asset.url)
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password)
      throw new Error(`Invalid HTTPS URL for ${asset.target}`)
    assets.set(asset.target, { url: asset.url, sha256: asset.sha256 })
  }

  for (const target of [...homebrewTargets, ...aurTargets])
    if (!assets.has(target)) throw new Error(`Missing distribution target: ${target}`)

  const ruby = (value: string) => `'${value.replaceAll("'", "\\'")}'`
  const shell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  const homebrew = String.raw`require "json"

class Orchestra < Formula
  desc "Command-line interface for Orchestra"
  homepage "https://github.com/gustavomhss/hugr-orchestra"
  version "${input.version}"
  depends_on :macos
  preserve_rpath

  on_arm do
    url ${ruby(assets.get("darwin-arm64")!.url)}
    sha256 "${assets.get("darwin-arm64")!.sha256}"
  end
  on_intel do
    url ${ruby(assets.get("darwin-x64-baseline")!.url)}
    sha256 "${assets.get("darwin-x64-baseline")!.sha256}"
  end

  def install
    libexec.install "bin", "package.json", "distribution.json", "checksums.sha256"
    metadata = ["distribution.json", "checksums.sha256"]
    metadata.each do |file|
      info = File.lstat(libexec/file)
      raise "Invalid distribution metadata file" unless info.file? && !info.symlink?
    end
    descriptor = JSON.parse((libexec/"distribution.json").read)
    raise "Invalid distribution descriptor" unless descriptor.is_a?(Hash) &&
      descriptor.keys.sort == ["files", "schema", "target", "version"] &&
      descriptor["schema"] == "orchestra-distribution-v1" && descriptor["version"] == "${input.version}" &&
      ["darwin-arm64", "darwin-x64-baseline"].include?(descriptor["target"]) &&
      descriptor["files"].is_a?(Array) && !descriptor["files"].empty?
    files = descriptor["files"]
    files.each do |entry|
      raise "Invalid distribution file entry" unless entry.is_a?(Hash) &&
        entry.keys.sort == ["executable", "path", "sha256"] &&
        [true, false].include?(entry["executable"]) &&
        entry["sha256"].is_a?(String) && entry["sha256"].match?(/\A[a-f0-9]{64}\z/)
      file = entry["path"]
      raise "Unsafe distribution path" unless file.is_a?(String) && file.match?(/\A[\x20-\x7e]+\z/) &&
        !file.match?(/[\\:<>"|?*]/) && (file == "package.json" || file.start_with?("bin/")) &&
        file.split("/", -1).all? { |part| !part.empty? && !part.match?(/[. ]\z/) &&
          !part.match?(/\A(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|\z)/i) }
      target = libexec
      parts = file.split("/")
      parts.each_with_index do |part, index|
        target = target/part
        info = File.lstat(target)
        raise "Invalid distribution target file" if info.symlink? ||
          (index == parts.length - 1 ? !info.file? : !info.directory?)
      end
    end
    paths = files.map { |entry| entry["path"] }
    raise "Invalid distribution file paths" unless paths == paths.sort && paths.uniq == paths
    files.each { |entry| chmod(entry["executable"] ? 0755 : 0644, libexec/entry["path"]) }
    metadata.each { |file| chmod 0644, libexec/file }
    bin.install_symlink libexec/"bin/orchestra"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/orchestra --version")
    assert_predicate libexec/"bin/tree-sitter", :exist?
  end
end
`
  const aur = String.raw`pkgname=orchestra-bin
pkgver=${input.version}
pkgrel=1
pkgdesc='Command-line interface for Orchestra'
arch=('x86_64' 'aarch64')
url='https://github.com/gustavomhss/hugr-orchestra'
license=('MIT')
makedepends=('jq')
depends=('glibc' 'gcc-libs')
# libtool/staticlibs/purge scan recursively; docs/zipman use configured directories.
# Keep prebuilt companions instead of stripping, removing or recompressing them.
options=('!strip' '!debug' '!lto' 'libtool' 'staticlibs' '!purge' 'docs' '!zipman' 'emptydirs')
provides=('orchestra')
conflicts=('orchestra')
# A safe filename owns the first :: delimiter, including for IPv6 and :: URL paths.
source_x86_64=(${shell(`orchestra-${input.version}-linux-x64-baseline.tar.gz::${assets.get("linux-x64-baseline")!.url}`)})
sha256sums_x86_64=('${assets.get("linux-x64-baseline")!.sha256}')
source_aarch64=(${shell(`orchestra-${input.version}-linux-arm64.tar.gz::${assets.get("linux-arm64")!.url}`)})
sha256sums_aarch64=('${assets.get("linux-arm64")!.sha256}')

package() {
  install -d "$pkgdir/usr/lib/orchestra" "$pkgdir/usr/bin"
  cp -a "$srcdir/bin" "$srcdir/package.json" "$srcdir/distribution.json" "$srcdir/checksums.sha256" "$pkgdir/usr/lib/orchestra/"
  local payload="$pkgdir/usr/lib/orchestra" modes mode file parent remaining
  for file in distribution.json checksums.sha256; do
    [[ -f "$payload/$file" && ! -L "$payload/$file" ]] || return 1
  done
  # Capture jq's status directly; a pipeline/process substitution can hide parse failures.
  if ! modes=$(jq -ers '
    def safe_path:
      type == "string" and length > 0 and
      (explode | all(. >= 32 and . <= 126)) and
      (test("[\\\\:<>\"|?*]") | not) and
      (. == "package.json" or startswith("bin/")) and
      (split("/") | all(length > 0 and (test("[. ]$") | not) and
        (test("(?i)^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\\.|$)") | not)));
    if length != 1 then error("Invalid distribution descriptor") else .[0] end |
    if type == "object" and keys == ["files", "schema", "target", "version"] and
      .schema == "orchestra-distribution-v1" and .version == "${input.version}" and
      (.target == "linux-x64-baseline" or .target == "linux-arm64") and
      (.files | type == "array" and length > 0) and
      (.files | all(type == "object" and keys == ["executable", "path", "sha256"] and
        (.executable | type == "boolean") and (.path | safe_path) and
        (.sha256 | type == "string" and length == 64 and test("^[a-f0-9]+$")))) and
      ([.files[].path] as $paths | $paths == ($paths | sort) and $paths == ($paths | unique))
    then .files[] | (if .executable then "0755" else "0644" end), .path
    else error("Invalid distribution descriptor") end
  ' "$payload/distribution.json"); then
    return 1
  fi
  # Validate every target and directory before changing any payload modes.
  while IFS= read -r mode && IFS= read -r file; do
    parent="$payload"
    remaining="$file"
    while [[ "$remaining" == */* ]]; do
      parent="$parent/${"${remaining%%/*}"}"
      [[ -d "$parent" && ! -L "$parent" ]] || return 1
      remaining="${"${remaining#*/}"}"
    done
    [[ -f "$payload/$file" && ! -L "$payload/$file" ]] || return 1
  done <<< "$modes"
  while IFS= read -r mode && IFS= read -r file; do
    chmod "$mode" "$payload/$file" || return 1
  done <<< "$modes"
  chmod 0644 "$payload/distribution.json" "$payload/checksums.sha256" || return 1
  ln -s /usr/lib/orchestra/bin/orchestra "$pkgdir/usr/bin/orchestra"
}
`
  return { homebrew, aur }
}
