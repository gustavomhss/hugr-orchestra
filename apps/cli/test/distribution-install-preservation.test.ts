import { expect, test } from "bun:test"
import { chmod, lstat, mkdir, readdir, readlink, rm } from "node:fs/promises"
import path from "node:path"
import { command, cpu, expectClean, expectLauncher, fixture, install, installedTree, isolated, modeZeroArchive, os, repack, rollback, snapshotTree, target } from "../distribution/test/fixture"

if (!process.env.RUNNER_OS) throw new Error("Distribution installer fixture tests require an isolated CI runner")
const posix = (name: string, run: () => Promise<void>, timeout = 120_000) => test.skipIf(process.platform === "win32")(
  process.platform === "win32" ? `${name} [platform-unavailable: Windows has no supported POSIX installer]` : name, run, timeout)

posix("real mode000 archive parents restore top-down; malformed payload cleans stage/lock and permits next install", () => isolated(async (root, prefix) => {
  expect(process.getuid!()).not.toBe(0) // Root would hide the traversal/removal defect.
  const directories = ["bin", "bin/tree-sitter", "bin/tree-sitter/tree-sitter", "bin/tree-sitter/tree-sitter/prebuilds",
    `bin/tree-sitter/tree-sitter/prebuilds/${os}-${cpu}`]
  const v1 = await modeZeroArchive(await fixture(root, "1.0.0"), directories)
  const expected1 = await installedTree(v1)
  // Calibrate against actual host tar: every selected parent really becomes 000.
  const extracted = path.join(root, "tar-control")
  await mkdir(extracted)
  expect((await command(["tar", "-xf", v1.archive, "-C", extracted])).code).toBe(0)
  for (const directory of directories) {
    expect((await lstat(path.join(extracted, directory))).mode & 0o777).toBe(0)
    await chmod(path.join(extracted, directory), 0o700)
  }
  expect(await Bun.file(path.join(extracted, "bin/tree-sitter/tree-sitter/LICENSE")).text()).toBe(v1.version)
  expect((await install(prefix, v1)).code).toBe(0)
  expect(await snapshotTree(path.join(prefix, `versions/${v1.version}-${target}`))).toEqual(expected1)
  await expectClean(prefix)
  const v2 = await fixture(root, "2.0.0")
  const expected2 = await installedTree(v2)
  expect((await install(prefix, v2)).code).toBe(0)
  expect(await snapshotTree(path.join(prefix, `versions/${v1.version}-${target}`))).toEqual(expected1)
  expect(await snapshotTree(path.join(prefix, `versions/${v2.version}-${target}`))).toEqual(expected2)
  const before = await snapshotTree(prefix)
  const malformed = await modeZeroArchive(await fixture(root, "3.0.0", (files) => {
    delete files["bin/hugr-omni-supervisor"]
  }), directories)
  const refused = await install(prefix, malformed)
  expect(refused.code).toBe(1)
  expect(refused.stderr).toContain("missing companion: bin/hugr-omni-supervisor")
  await expectClean(prefix)
  expect(await snapshotTree(prefix)).toEqual(before)
  await expectLauncher(prefix, "2.0.0")
  expect((await install(prefix, v2)).code).toBe(0)
  expect(await snapshotTree(prefix)).toEqual(before)
  await expectClean(prefix)
}))

posix("stale payload checksum blocks CLI execution despite correct version and recomputed archive digest", () => isolated(async (root, prefix) => {
  const marker = path.join(root, "executed")
  const control = await fixture(root, "1.0.0", (files) => {
    files["bin/orchestra"] = `#!/bin/sh\n: > '${marker}'\nprintf '%s\\n' '1.0.0'\n`
  })
  expect((await install(prefix, control)).code).toBe(0)
  expect(await Bun.file(marker).exists()).toBe(true)
  await rm(marker)
  const before = await snapshotTree(prefix)
  const candidate = await fixture(root, "2.0.0", (files) => {
    files["bin/orchestra"] = `#!/bin/sh\n: > '${marker}'\nprintf '%s\\n' '2.0.0'\n`
  })
  await Bun.write(path.join(candidate.dir, "bin/orchestra"), `${await Bun.file(path.join(candidate.dir, "bin/orchestra")).text()}# stale checksum\n`)
  const stale = await repack(candidate)
  expect(stale.digest).not.toBe(candidate.digest)
  const result = await install(prefix, stale)
  expect(result.code).toBe(1)
  expect(result.stderr).toContain("checksum mismatch: bin/orchestra")
  expect(await Bun.file(marker).exists()).toBe(false)
  await expectClean(prefix)
  expect(await snapshotTree(prefix)).toEqual(before)
  await expectLauncher(prefix, "1.0.0")
  expect(await Bun.file(marker).exists()).toBe(true)
}))

posix("both complete versions and user modes survive refused admission, immutable conflict, tampered rollback and caller lock", () => isolated(async (root, prefix) => {
  const v1 = await fixture(root, "1.0.0")
  const v2 = await fixture(root, "2.0.0")
  const expected = await Promise.all([v1, v2].map(installedTree))
  expect((await install(prefix, v1)).code).toBe(0)
  expect((await install(prefix, v2)).code).toBe(0)
  for (const [index, payload] of [v1, v2].entries()) {
    expect(await snapshotTree(path.join(prefix, `versions/${payload.version}-${target}`))).toEqual(expected[index]!)
  }
  const updated = await snapshotTree(prefix)
  expect((await install(prefix, v2)).code).toBe(0)
  expect(await snapshotTree(prefix)).toEqual(updated)
  await expectLauncher(prefix, v2.version)
  expect((await rollback(prefix, v1.version)).code).toBe(0)
  for (const [index, payload] of [v1, v2].entries()) {
    expect(await snapshotTree(path.join(prefix, `versions/${payload.version}-${target}`))).toEqual(expected[index]!)
  }
  await expectLauncher(prefix, v1.version)
  expect((await install(prefix, v2)).code).toBe(0)
  await mkdir(path.join(prefix, "user"))
  await Bun.write(path.join(prefix, "user/sentinel"), "caller-owned bytes\n")
  await chmod(path.join(prefix, "user"), 0o500)
  await chmod(path.join(prefix, `versions/${v1.version}-${target}/bin/tree-sitter`), 0o500)
  const before = await snapshotTree(prefix)
  const invalid = await fixture(root, "3.0.0", (files) => { delete files["bin/hugr-omni-supervisor"] })
  const conflict = await fixture(path.join(root, "conflict"), v1.version, (files) => { files["bin/extra data"] = "valid conflicting payload" })
  for (const [payload, diagnostic] of [
    [{ ...v2, digest: "0".repeat(64) }, "archive checksum mismatch"],
    [invalid, "missing companion"], [conflict, "immutable version conflict"],
  ] as const) {
    const result = await install(prefix, payload)
    expect(result.code).toBe(1)
    expect(result.stderr).toContain(diagnostic)
    await expectClean(prefix)
    expect(await snapshotTree(prefix)).toEqual(before)
    await expectLauncher(prefix, "2.0.0")
  }
  await Bun.write(path.join(prefix, `versions/${v1.version}-${target}/bin/hugr_omni.node`), "tampered retained bytes")
  const tampered = await snapshotTree(prefix)
  for (const operation of [() => rollback(prefix, v1.version), () => install(prefix, v1)]) {
    const result = await operation()
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("checksum mismatch: bin/hugr_omni.node")
    await expectClean(prefix)
    expect(await snapshotTree(prefix)).toEqual(tampered)
    await expectLauncher(prefix, "2.0.0")
  }
  await mkdir(path.join(prefix, ".install-lock"))
  await Bun.write(path.join(prefix, ".install-lock/owner"), "caller lock")
  const locked = await snapshotTree(prefix)
  for (const operation of [() => install(prefix, v2), () => rollback(prefix, v2.version)]) {
    const result = await operation()
    expect(result.code).toBe(1)
    expect(result.stderr).toContain("prefix locked")
    expect((await readdir(prefix)).filter((name) => name.startsWith(".install-"))).toEqual([".install-lock"])
    expect(await snapshotTree(prefix)).toEqual(locked)
    await expectLauncher(prefix, "2.0.0")
  }
  await rm(path.join(prefix, ".install-lock"), { recursive: true })
  expect(await snapshotTree(prefix)).toEqual(tampered)
  await expectClean(prefix)
}))

posix("cleanup restores hidden mode000 descendants without following a stage symlink to user directories", () => isolated(async (root, prefix) => {
  const user = path.join(root, "user")
  await mkdir(user)
  await Bun.write(path.join(user, "sentinel"), "user bytes")
  await chmod(user, 0o500)
  const before = await snapshotTree(user)
  const payload = await fixture(root, "1.0.0", (files) => {
    files["bin/orchestra"] = `#!/bin/sh
set -eu
stage=$(dirname "$(dirname "$(dirname "$0")")")
mkdir -p "$stage/.hidden/locked"
: > "$stage/.hidden/locked/file"
ln -s '${user}' "$stage/.hidden/user-link"
chmod 000 "$stage/.hidden/locked" "$stage/.hidden"
printf '%s\\n' '1.0.0'
exit 7
`
  })
  const result = await install(prefix, payload)
  expect(result.code).toBe(7)
  await expectClean(prefix)
  expect(await snapshotTree(user)).toEqual(before)
  expect(await readdir(path.join(prefix, "versions"))).toEqual([])
  expect(await readdir(prefix)).not.toContain("current")
  expect((await install(prefix, await fixture(root, "2.0.0"))).code).toBe(0)
  await expectLauncher(prefix, "2.0.0")
}))

posix("cleanup faults report diagnostics, release owned lock, preserve failure status and fail successful work", () => isolated(async (root, prefix) => {
  const realRm = (await command(["sh", "-c", "command -v rm"])).stdout.trim()
  expect(path.isAbsolute(realRm)).toBe(true)
  const bin = path.join(root, "cleanup-path")
  await mkdir(bin)
  await Bun.write(path.join(bin, "rm"), `#!/bin/sh\ncase "$2" in */.install-*) exit 9 ;; esac\nexec "$REAL_RM" "$@"\n`)
  await chmod(path.join(bin, "rm"), 0o755)
  const env = { PATH: `${bin}:${process.env.PATH}`, REAL_RM: realRm }
  for (const [version, exit, wanted] of [["1.0.0", 0, 1], ["2.0.0", 7, 7]] as const) {
    const payload = await fixture(root, version, (files) => {
      files["bin/orchestra"] = `#!/bin/sh\nprintf '%s\\n' '${version}'\nexit ${exit}\n`
    })
    const result = await install(prefix, payload, [], env)
    expect(result.code).toBe(wanted)
    expect(result.stderr).toContain("installer: stage removal failed")
    const debris = (await readdir(prefix)).filter((name) => name.startsWith(".install-"))
    expect(debris).toHaveLength(1)
    expect(debris[0]).not.toBe(".install-lock")
    // Intentional cleanup fault leaves owned stage; repair via real host tool.
    expect((await command([realRm, "-rf", path.join(prefix, debris[0]!)])).code).toBe(0)
    await expectClean(prefix)
    expect(await readlink(path.join(prefix, "current"))).toBe(`versions/1.0.0-${target}`)
    await expectLauncher(prefix, "1.0.0")
  }
}))
