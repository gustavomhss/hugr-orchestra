import { expect, test } from "bun:test"
import { chmod, lstat, mkdir, readlink, readdir, rm, symlink } from "node:fs/promises"
import path from "node:path"
import { command, cpu, expectClean, expectLauncher, fatHeader, fixture, hostileTar, install, installedTree, isolated, nativeHeader, os, producerFixture, repack, rollback, sha256, snapshotTree, target } from "../distribution/test/fixture"
import type { Files } from "../distribution/test/fixture"
import { requireDistributionHost } from "./fixture/distribution-host"

requireDistributionHost()

if (!process.env.RUNNER_OS) throw new Error("Distribution installer fixture tests require an isolated CI runner")
const posix = (name: string, run: () => Promise<void>, timeout: number) => test.skipIf(process.platform === "win32")(
  process.platform === "win32" ? `${name} [platform-unavailable: Windows has no supported POSIX installer]` : name, run, timeout)

posix("producer gzip install, update, exact reuse and rollback preserve complete old trees and modes", () => isolated(async (root, prefix) => {
  const v1 = await producerFixture(root, "1.0.0")
  const v2 = await producerFixture(root, "2.0.0")
  const expected = await Promise.all([v1, v2].map(installedTree))
  expect(Buffer.from(await Bun.file(v1.archive).bytes()).subarray(0, 2).toString("hex")).toBe("1f8b")
  expect((await install(prefix, v1)).code).toBe(0)
  expect(await snapshotTree(path.join(prefix, `versions/${v1.version}-${target}`))).toEqual(expected[0]!)
  expect(await readlink(path.join(prefix, "bin/orchestra"))).toBe("../current/bin/orchestra")
  await expectLauncher(prefix, "1.0.0")
  for (const payload of [v1, v2]) {
    expect((await install(prefix, payload)).code).toBe(0)
    const manifest = await Bun.file(path.join(payload.dir, "distribution.json")).json()
    for (const entry of manifest.files as { path: string; executable: boolean }[]) {
      expect(Boolean((await lstat(path.join(prefix, `versions/${payload.version}-${target}`, entry.path))).mode & 0o111)).toBe(entry.executable)
    }
    expect((await lstat(path.join(prefix, `versions/${payload.version}-${target}/distribution.json`))).mode & 0o111).toBe(0)
    expect((await lstat(path.join(prefix, `versions/${payload.version}-${target}/checksums.sha256`))).mode & 0o111).toBe(0)
    expect(await snapshotTree(path.join(prefix, `versions/${v1.version}-${target}`))).toEqual(expected[0]!)
    expect(await snapshotTree(path.join(prefix, `versions/${payload.version}-${target}`))).toEqual(expected[payload === v1 ? 0 : 1]!)
    await expectClean(prefix)
    await expectLauncher(prefix, payload.version)
  }
  const updated = await snapshotTree(prefix)
  expect((await install(prefix, v2)).code).toBe(0)
  expect(await snapshotTree(prefix)).toEqual(updated)
  await expectLauncher(prefix, "2.0.0")
  expect((await rollback(prefix, v1.version)).code).toBe(0)
  for (const [index, payload] of [v1, v2].entries()) {
    expect(await snapshotTree(path.join(prefix, `versions/${payload.version}-${target}`))).toEqual(expected[index]!)
  }
  await expectLauncher(prefix, "1.0.0")
  expect((await readdir(path.join(prefix, "versions"))).sort()).toEqual([`1.0.0-${target}`, `2.0.0-${target}`])
  expect((await readdir(prefix)).sort()).toEqual(["bin", "current", "versions"])
}), 120_000)

posix("staging restores every executable boolean even when archive modes disagree", () => isolated(async (root, prefix) => {
  const payload = await fixture(root, "1.0.0", (files) => { files["bin/extra tool"] = "#!/bin/sh\nexit 0\n" })
  const manifest = await Bun.file(path.join(payload.dir, "distribution.json")).json() as { files: { path: string; executable: boolean }[] }
  for (const entry of manifest.files) await chmod(path.join(payload.dir, entry.path), entry.executable ? 0o644 : 0o755)
  await chmod(path.join(payload.dir, "distribution.json"), 0o755)
  await chmod(path.join(payload.dir, "checksums.sha256"), 0o755)
  expect((await install(prefix, await repack(payload))).code).toBe(0)
  for (const entry of manifest.files) {
    expect(Boolean((await lstat(path.join(prefix, `versions/1.0.0-${target}`, entry.path))).mode & 0o111)).toBe(entry.executable)
  }
  for (const file of ["distribution.json", "checksums.sha256"]) {
    expect((await lstat(path.join(prefix, `versions/1.0.0-${target}`, file))).mode & 0o111).toBe(0)
  }
}), 120_000)

posix("checksum, missing companions, reserved extras, package metadata and CLI version refuse", () => isolated(async (root, prefix) => {
  const v1 = await fixture(root, "1.0.0")
  expect((await install(prefix, v1)).code).toBe(0)
  const before = await snapshotTree(prefix)
  const v2 = await fixture(root, "2.0.0")
  expect((await install(prefix, { ...v2, digest: "0".repeat(64) })).code).not.toBe(0)
  await expectClean(prefix)
  expect(await snapshotTree(prefix)).toEqual(before)
  await Bun.write(path.join(v2.dir, "bin/hugr_omni.node"), "tampered")
  const tampered = await install(prefix, await repack(v2))
  expect(tampered.code).not.toBe(0); expect(tampered.stderr).toContain("checksum mismatch")
  await expectClean(prefix)
  expect(await snapshotTree(prefix)).toEqual(before)
  const cases: ((files: Files) => void)[] = [
    (files) => { delete files["bin/hugr-omni-supervisor"] },
    (files) => { files["package.json"] = String(files["package.json"]).replace(target, "linux-wrong") },
    (files) => { files["bin/orchestra"] = "#!/bin/sh\nprintf 'wrong\\n'\n" },
    (files) => { delete files["bin/tree-sitter/tree-sitter-python/LICENSE"] },
    (files) => { files["bin/tree-sitter/tree-sitter/prebuilds/wrong-x64/tree-sitter.node"] = nativeHeader() },
    (files) => { files["bin/tree-sitter/tree-sitter/extra.js"] = "extra" },
    (files) => { files["bin/hugr-extra"] = "extra" },
    (files) => { files["bin/hugr-omni-supervisor.exe"] = "extra" },
    (files) => { files["package.json"] = JSON.stringify({ ...JSON.parse(String(files["package.json"])), version: null }) },
    (files) => { files["package.json"] = JSON.stringify({ ...JSON.parse(String(files["package.json"])), cpu: [cpu === "x64" ? "arm64" : "x64"] }) },
    (files) => { files["package.json"] = JSON.stringify({ ...JSON.parse(String(files["package.json"])), os: [os === "linux" ? "darwin" : "linux"] }) },
    (files) => { files["package.json"] = JSON.stringify({ ...JSON.parse(String(files["package.json"])), cpu: [cpu, cpu] }) },
    (files) => { files["package.json"] = JSON.stringify({ ...JSON.parse(String(files["package.json"])), os: [null] }) },
  ]
  for (const [index, mutate] of cases.entries()) {
    expect((await install(prefix, await fixture(root, `3.0.${index}`, mutate))).code).not.toBe(0)
    await expectClean(prefix)
    expect(await snapshotTree(prefix)).toEqual(before)
  }
  expect(await readlink(path.join(prefix, "current"))).toBe(`versions/1.0.0-${target}`)
  expect(await readdir(path.join(prefix, "versions"))).toEqual([`1.0.0-${target}`])
}), 120_000)

posix("descriptor types/schema and checksum separator reject without activation", () => isolated(async (root, prefix) => {
  const v1 = await fixture(root, "1.0.0")
  expect((await install(prefix, v1)).code).toBe(0)
  const before = await snapshotTree(prefix)
  for (const [index, change] of [
    (value: { schema: string }) => { value.schema = "wrong" },
    (value: { version: string }) => { Object.assign(value, { version: 2 }) },
    (value: { target: string }) => { value.target = "linux-wrong" },
    (value: { files: unknown[] }) => { value.files = [] },
    (value: { files: { executable: boolean }[] }) => { Object.assign(value.files[0]!, { executable: "true" }) },
    (value: { files: { sha256: string }[] }) => { Object.assign(value.files[0]!, { sha256: 123 }) },
    (value: { files: { path: string }[] }) => { value.files[0]!.path = "bin/../escape" },
    (value: { files: unknown[] }) => { value.files.push(value.files[0]) },
    (value: { files: { path: string; executable: boolean }[] }) => { value.files.find((file) => file.path === "bin/hugr-omni-supervisor")!.executable = false },
    (value: object) => { Object.assign(value, { extra: 42 }) },
    (value: { files: object[] }) => { Object.assign(value.files[0]!, { extra: null }) },
  ].entries()) {
    const result = await install(prefix, await fixture(root, `2.0.${index}`, undefined, change))
    expect(result.code).not.toBe(0)
    await expectClean(prefix)
    expect(await snapshotTree(prefix)).toEqual(before)
  }
  for (const separator of [" ", "\t", "   "]) {
    const payload = await fixture(root, "3.0.0", undefined, undefined, (text) => text.replace("  ", separator))
    expect((await install(prefix, payload)).code).not.toBe(0)
    await expectClean(prefix)
    expect(await snapshotTree(prefix)).toEqual(before)
  }
  const noNewline = await fixture(root, "4.0.0", undefined, undefined, (text) => text.trimEnd())
  await Bun.write(path.join(noNewline.dir, "package.json"), JSON.stringify({
    ...await Bun.file(path.join(noNewline.dir, "package.json")).json(), unknown: 123,
  }))
  const lastChecksum = await install(prefix, await repack(noNewline))
  expect(lastChecksum.code).not.toBe(0); expect(lastChecksum.stderr).toContain("checksum mismatch: package.json")
  await expectClean(prefix)
  expect(await snapshotTree(prefix)).toEqual(before)
  expect(await readlink(path.join(prefix, "current"))).toBe(`versions/1.0.0-${target}`)
}), 120_000)

posix("foreign host OS/CPU refuses before prefix creation or execution", () => isolated(async (root, prefix) => {
  const payload = await fixture(root, "1.0.0")
  const bin = path.join(root, "host-path")
  await mkdir(bin)
  for (const [host, arch] of [[os === "linux" ? "Darwin" : "Linux", cpu === "x64" ? "x86_64" : "arm64"],
    [os === "linux" ? "Linux" : "Darwin", cpu === "x64" ? "aarch64" : "x86_64"]]) {
    await Bun.write(path.join(bin, "uname"), `#!/bin/sh\ncase "$1" in -s) printf '%s\\n' '${host}' ;; -m) printf '%s\\n' '${arch}' ;; *) exit 1 ;; esac\n`)
    await chmod(path.join(bin, "uname"), 0o755)
    const result = await install(prefix, payload, [], { PATH: `${bin}:${process.env.PATH}` })
    expect(result.code).not.toBe(0); expect(result.stderr).toContain("target does not match host OS/CPU")
    expect(await readdir(root)).not.toContain("prefix")
    expect((await rollback(prefix, payload.version, { PATH: `${bin}:${process.env.PATH}` })).stderr).toContain("target does not match host OS/CPU")
    expect(await readdir(root)).not.toContain("prefix")
  }
}), 120_000)

posix("native headers validate every addon CPU/class/endianness before CLI execution", () => isolated(async (root, prefix) => {
  const v1 = await fixture(root, "1.0.0")
  expect((await install(prefix, v1)).code).toBe(0)
  const marker = path.join(root, "executed")
  const control = await fixture(root, "1.1.0", (files) => {
    files["bin/orchestra"] = `#!/bin/sh\n: > '${marker}'\nprintf '%s\\n' '1.1.0'\n`
  })
  expect((await install(prefix, control)).code).toBe(0)
  expect(await Bun.file(marker).exists()).toBe(true)
  await rm(marker)
  const before = await snapshotTree(prefix)
  const manifest = await Bun.file(path.join(v1.dir, "distribution.json")).json() as { files: { path: string }[] }
  const bindings = manifest.files.filter((file) => file.path.endsWith(".node")).map((file) => file.path)
  expect(bindings).toContain("bin/hugr_omni.node")
  expect(bindings.some((file) => file.startsWith("bin/tree-sitter/"))).toBe(true)
  const broken = [Buffer.from("invalid header"), nativeHeader(cpu === "x64" ? "arm64" : "x64"),
    nativeHeader().subarray(0, 20), nativeHeader(cpu, os === "linux" ? "darwin" : "linux")]
  if (os === "linux") {
    const elf32 = nativeHeader(); elf32[4] = 1
    const bigEndian = nativeHeader(); bigEndian[5] = 2
    broken.push(elf32, bigEndian)
  }
  if (os === "darwin") {
    const mislabeledSlice = fatHeader()
    nativeHeader(cpu === "x64" ? "arm64" : "x64").copy(mislabeledSlice, 28)
    broken.push(fatHeader(cpu === "x64" ? "arm64" : "x64"), fatHeader().subarray(0, 12), mislabeledSlice)
  }
  for (const [index, bytes] of broken.entries()) {
    for (const file of bindings) {
      const payload = await fixture(root, `2.0.${index}`, (files) => {
        files[file] = bytes; files["bin/orchestra"] = `#!/bin/sh\n: > '${marker}'\nprintf '%s\\n' '2.0.${index}'\n`
      })
      const result = await install(prefix, payload)
      expect(result.code).not.toBe(0); expect(result.stderr).toContain(`native binding target mismatch: ${file}`)
      await expectClean(prefix)
      expect(await snapshotTree(prefix)).toEqual(before)
      expect(await Bun.file(marker).exists()).toBe(false)
      expect(await readlink(path.join(prefix, "current"))).toBe(`versions/1.1.0-${target}`)
    }
  }
  if (os === "darwin") {
    for (const [index, wide] of [false, true].entries()) {
      const payload = await fixture(root, `3.0.${index}`, (files) => { files["bin/hugr_omni.node"] = fatHeader(cpu, wide) })
      expect((await install(prefix, payload)).code).toBe(0)
    }
  }
}), 120_000)

posix("raw malicious tar never extracts; forwarding shim records valid extraction positive control", () => isolated(async (root, prefix) => {
  const realTar = (await command(["sh", "-c", "command -v tar"])).stdout.trim()
  expect(path.isAbsolute(realTar)).toBe(true)
  const bin = path.join(root, "tar-path")
  const marker = path.join(root, "extractions")
  await mkdir(bin)
  await Bun.write(path.join(bin, "tar"), `#!/bin/sh\ncase "$1" in -xf) printf '%s\\n' extracted >> "$EXTRACTION_MARKER" ;; esac\nexec "$REAL_TAR" "$@"\n`)
  await chmod(path.join(bin, "tar"), 0o755)
  const env = { PATH: `${bin}:${process.env.PATH}`, REAL_TAR: realTar, EXTRACTION_MARKER: marker }
  const v1 = await producerFixture(root, "1.0.0")
  expect((await install(prefix, v1, [], env)).code).toBe(0)
  expect(await Bun.file(marker).text()).toBe("extracted\n")
  await rm(marker)
  const before = await snapshotTree(prefix)
  const attacks = [
    [{ name: "/absolute" }], [{ name: "bin/../../escaped" }], [{ name: "bin/./orchestra" }],
    [{ name: "bin/back\\slash" }], [{ name: "bin/trailing " }], [{ name: "unexpected" }],
    [{ name: "bin/line\nbreak" }], [{ name: "bin/control\tbyte" }], [{ name: "bin/CON" }],
    [{ name: "bin/orchestra", type: "2" }], [{ name: "bin/orchestra", type: "1" }],
    [{ name: "bin/device", type: "3" }], [{ name: "bin/fifo", type: "6" }],
    [{ name: "bin/orchestra" }, { name: "bin/orchestra" }],
  ]
  for (const entries of attacks) {
    const archive = path.join(root, "hostile.tar")
    const bytes = hostileTar(entries)
    await Bun.write(archive, bytes)
    expect((await install(prefix, { archive, dir: root, version: "2.0.0", digest: sha256(bytes) }, [], env)).code).not.toBe(0)
    await expectClean(prefix)
    expect(await snapshotTree(prefix)).toEqual(before)
    expect(await Bun.file(marker).exists()).toBe(false)
    expect(await readlink(path.join(prefix, "current"))).toBe(`versions/1.0.0-${target}`)
  }
  expect((await install(prefix, v1, [], env)).code).toBe(0)
  expect(await Bun.file(marker).text()).toBe("extracted\n")
  expect(await Bun.file(path.join(root, "escaped")).exists()).toBe(false)
}), 120_000)

posix("mode tampering refuses exact reuse/rollback and never repairs published trees", () => isolated(async (root, prefix) => {
  const v1 = await producerFixture(root, "1.0.0")
  const v2 = await producerFixture(root, "2.0.0")
  expect((await install(prefix, v1)).code).toBe(0)
  expect((await install(prefix, v2)).code).toBe(0)
  for (const [file, changed, original] of [["bin/orchestra", 0o644, 0o755], ["bin/extra tool", 0o644, 0o755],
    ["package.json", 0o755, 0o644], ["package.json", 0o645, 0o644], ["distribution.json", 0o755, 0o644], ["checksums.sha256", 0o755, 0o644]] as const) {
    const published = path.join(prefix, `versions/1.0.0-${target}`, file)
    await chmod(published, changed)
    const before = await snapshotTree(prefix)
    for (const operation of [() => install(prefix, v1), () => rollback(prefix, v1.version)]) {
      const result = await operation()
      expect(result.code).not.toBe(0); expect(result.stderr).toContain(`executable mode mismatch: ${file}`)
      await expectClean(prefix)
      expect(await snapshotTree(prefix)).toEqual(before)
      expect((await lstat(published)).mode & 0o777).toBe(changed)
      expect(await readlink(path.join(prefix, "current"))).toBe(`versions/2.0.0-${target}`)
    }
    await chmod(published, original)
  }
  const otherExecute = path.join(prefix, `versions/1.0.0-${target}/bin/extra tool`)
  await chmod(otherExecute, 0o641)
  expect((await install(prefix, v1)).code).toBe(0)
  expect((await lstat(otherExecute)).mode & 0o777).toBe(0o641)
  expect((await rollback(prefix, v1.version)).code).toBe(0)
  expect((await lstat(otherExecute)).mode & 0o777).toBe(0o641)
}), 120_000)

posix("lock, symlink root, immutable conflict and tampered rollback refuse", () => isolated(async (root, prefix) => {
  const v1 = await fixture(root, "1.0.0")
  const v2 = await fixture(root, "2.0.0")
  await mkdir(path.join(prefix, ".install-lock"), { recursive: true })
  expect((await install(prefix, v1)).code).not.toBe(0)
  expect(await readdir(prefix)).toEqual([".install-lock"])
  await rm(path.join(prefix, ".install-lock"), { recursive: true })
  await symlink(prefix, path.join(root, "alias"))
  expect((await install(path.join(root, "alias"), v1)).code).not.toBe(0)
  await expectClean(prefix)
  expect((await install(prefix, v1)).code).toBe(0)
  expect((await install(prefix, v2)).code).toBe(0)
  const conflict = await fixture(root, v1.version, (files) => { files["bin/extra data"] = "different valid fixture" })
  const result = await install(prefix, conflict)
  expect(result.code).not.toBe(0); expect(result.stderr).toContain("immutable version conflict")
  await expectClean(prefix)
  const old = path.join(prefix, `versions/1.0.0-${target}/bin/hugr_omni.node`)
  expect(Buffer.from(await Bun.file(old).bytes())).toEqual(nativeHeader())
  await Bun.write(old, "tampered old companion")
  expect((await rollback(prefix, v1.version)).code).not.toBe(0)
  await expectClean(prefix)
  expect((await install(prefix, conflict)).code).not.toBe(0)
  await expectClean(prefix)
  expect(await readlink(path.join(prefix, "current"))).toBe(`versions/2.0.0-${target}`)
  expect(await Bun.file(old).text()).toBe("tampered old companion")
}), 120_000)
