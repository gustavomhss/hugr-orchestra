import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { lstat, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { basename, dirname, join, win32 } from "node:path"
import { archiveDistribution, prepareDistribution, verifyDistribution } from "../script/distribution-payload"
import type { DistributionManifest } from "../script/distribution-payload"
import { requireDistributionHost } from "./fixture/distribution-host"
import { binding, payloadFixture, payloadSnapshot, treeSitterPaths, tuple } from "./fixture/distribution-payload"

requireDistributionHost()

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

// These API proofs use inert images and the real filesystem/publication adapter.
// Real installed CLI/addon/parser byte and runtime proofs remain separate.
test("descriptor and archive inventory equal independently captured source bytes, hashes and modes", async () => {
  const value = await payloadFixture(roots)
  const source = await payloadSnapshot(value.source)
  const files = source.filter((entry) => entry.kind === "file").sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  expect(files.map((entry) => entry.path)).toEqual([
    "package.json", `bin/${tuple.executable}`, "bin/hugr_omni.node", `bin/${tuple.supervisor}`,
    "bin/extra/note.txt", ...treeSitterPaths,
  ].sort())
  const manifest = await prepareDistribution(value.input)
  expect(manifest.files).toEqual(files.map((entry) => ({ path: entry.path, sha256: entry.sha256, executable: Boolean(entry.mode & 0o111) })))
  const destination = await payloadSnapshot(value.input.out)
  expect(destination.filter((entry) => entry.kind === "file" && entry.path !== "distribution.json" && entry.path !== "checksums.sha256")
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).toEqual(files)
  // Native staging creates private directories; the descriptor's mode contract
  // concerns file executable flags, not preservation of source directory modes.
  expect(destination.filter((entry) => entry.kind === "directory").map((entry) => entry.path))
    .toEqual(source.filter((entry) => entry.kind === "directory").map((entry) => entry.path))
  expect(JSON.parse(await readFile(join(value.input.out, "distribution.json"), "utf8"))).toEqual(manifest)
  const table = destination.filter((entry) => entry.kind === "file" && entry.path !== "checksums.sha256")
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    .map((entry) => `${entry.sha256}  ${entry.path}\n`).join("")
  expect(await readFile(join(value.input.out, "checksums.sha256"), "utf8")).toBe(table)
  expect(await verifyDistribution(value.input.out)).toEqual(manifest)
  expect(await prepareDistribution(value.input)).toEqual(manifest)
  expect(await payloadSnapshot(value.source)).toEqual(source)
  expect(await payloadSnapshot(value.input.out)).toEqual(destination)
  const file = join(value.root, "inventory.tar.gz")
  await archiveDistribution({ directory: value.input.out, file })
  const members = await new Bun.Archive(await readFile(file)).files()
  expect([...members.keys()].sort()).toEqual([...files.map((entry) => entry.path), "distribution.json", "checksums.sha256"].sort())
  for (const entry of destination.filter((entry) => entry.kind === "file")) {
    const member = members.get(entry.path)
    expect(member).toBeDefined()
    expect(Buffer.from(await member!.arrayBuffer()).equals(entry.bytes)).toBe(true)
  }
})

for (const missing of treeSitterPaths) {
  test(`independent required tree-sitter path refuses omission before writes: ${missing}`, async () => {
    const value = await payloadFixture(roots)
    const manifest = await prepareDistribution(value.input)
    expect(await verifyDistribution(value.input.out)).toEqual(manifest)
    await rm(join(value.source, missing))
    // Remove only fixture-owned empty ancestors so companion admission, rather
    // than the empty-directory guard, decides every required-path negative.
    const state = { directory: dirname(join(value.source, missing)) }
    while (state.directory !== value.source && !(await readdir(state.directory)).length) {
      await rm(state.directory, { recursive: true })
      state.directory = dirname(state.directory)
    }
    const before = await payloadSnapshot(value.root)
    const out = join(value.root, "never-created", "prepared")
    await expect(prepareDistribution({ ...value.input, out })).rejects.toThrow(`Missing distribution companion: ${missing}`)
    expect(await payloadSnapshot(value.root)).toEqual(before)
    await expect(lstat(dirname(out))).rejects.toMatchObject({ code: "ENOENT" })
  })
}

for (const path of treeSitterPaths.filter((file) => file.endsWith(".node"))) {
  for (const kind of ["wrong-cpu", "wrong-format", "truncated"] as const) {
    test(`tree-sitter native header rejects ${kind} before writes: ${path}`, async () => {
      const value = await payloadFixture(roots)
      const manifest = await prepareDistribution(value.input)
      expect(await verifyDistribution(value.input.out)).toEqual(manifest)
      const bytes = kind === "wrong-cpu" ? binding(tuple.foreignMachine)
        : kind === "truncated" ? binding().subarray(0, 7)
        : binding(tuple.machine, "little", tuple.os === "win32" ? "linux" : "win32")
      await writeFile(join(value.source, path), bytes)
      const before = await payloadSnapshot(value.root)
      await expect(prepareDistribution({ ...value.input, out: join(value.root, "never-created", "prepared") }))
        .rejects.toThrow(`Native binding target mismatch: ${path}`)
      expect(await payloadSnapshot(value.root)).toEqual(before)
      expect(await verifyDistribution(value.input.out)).toEqual(manifest)
    })
  }

  test(`coherently rehashed wrong-target tree-sitter binding fails semantic verification and archive: ${path}`, async () => {
    const value = await payloadFixture(roots)
    const source = await payloadSnapshot(value.source)
    await prepareDistribution(value.input)
    await writeFile(join(value.input.out, path), binding(tuple.foreignMachine))
    const manifest = JSON.parse(await readFile(join(value.input.out, "distribution.json"), "utf8")) as DistributionManifest
    const replacement = manifest.files.find((entry) => entry.path === path)
    expect(replacement).toBeDefined()
    replacement!.sha256 = createHash("sha256").update(await readFile(join(value.input.out, path))).digest("hex")
    await writeFile(join(value.input.out, "distribution.json"), JSON.stringify(manifest, null, 2) + "\n")
    const files = (await payloadSnapshot(value.input.out)).filter((entry) => entry.kind === "file" && entry.path !== "checksums.sha256")
      .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
    expect(manifest.files).toEqual(files.filter((entry) => entry.path !== "distribution.json")
      .map((entry) => ({ path: entry.path, sha256: entry.sha256, executable: Boolean(entry.mode & 0o111) })))
    const table = files.map((entry) => `${entry.sha256}  ${entry.path}\n`).join("")
    await writeFile(join(value.input.out, "checksums.sha256"), table)
    expect(await readFile(join(value.input.out, "checksums.sha256"), "utf8")).toBe(table)
    const before = await payloadSnapshot(value.root)
    const error = `Native binding target mismatch: ${path}`
    await expect(verifyDistribution(value.input.out)).rejects.toThrow(error)
    expect(await payloadSnapshot(value.root)).toEqual(before)
    await expect(archiveDistribution({ directory: value.input.out, file: join(value.root, "invalid.tar.gz") })).rejects.toThrow(error)
    expect(await payloadSnapshot(value.root)).toEqual(before)
    await expect(prepareDistribution(value.input)).rejects.toThrow(error)
    expect(await payloadSnapshot(value.root)).toEqual(before)
    expect(await payloadSnapshot(value.source)).toEqual(source)
  })
}

test.skipIf(process.platform !== "win32")("Windows raw drive-relative, device and stream paths reject before source reads or output writes", async () => {
  // Keep drive-relative resolutions inside this fixture. No drive cwd changes,
  // host paths, global mocks or production synchronization hooks are involved.
  const value = await payloadFixture(roots, process.cwd())
  const drive = win32.parse(value.root).root.slice(0, 2)
  expect(drive).toMatch(/^[A-Za-z]:$/)
  const manifest = await prepareDistribution(value.input)
  expect(await verifyDistribution(value.input.out)).toEqual(manifest)
  const paths = (path: string) => [
    `${drive}..\\${basename(process.cwd())}\\${basename(value.root)}\\${win32.relative(value.root, path)}`,
    `\\\\?\\${path}`,
    `\\\\.\\${path}`,
    `${path}:payload`,
  ]
  const out = join(value.root, "never-created", "prepared")
  expect(win32.resolve(paths(out)[0]!)).toBe(out)
  expect(win32.resolve(paths(value.input.dist)[0]!)).toBe(value.input.dist)
  const before = await payloadSnapshot(value.root)
  for (const field of ["dist", "out"] as const) {
    for (const path of paths(field === "dist" ? value.input.dist : out)) {
      const error = path.endsWith(":payload") ? "Unsupported artifact Windows stream component" : "Unsupported artifact Windows root grammar"
      await expect(prepareDistribution({ ...value.input, out, [field]: path })).rejects.toThrow(error)
      expect(await payloadSnapshot(value.root)).toEqual(before)
      // An absent source makes ordering observable without intercepting I/O:
      // invalid raw output must fail grammar admission, never source ENOENT.
      if (field === "out") {
        await expect(prepareDistribution({ ...value.input, dist: join(value.root, "absent-source"), out: path })).rejects.toThrow(error)
        expect(await payloadSnapshot(value.root)).toEqual(before)
      }
    }
  }
  await expect(lstat(dirname(out))).rejects.toMatchObject({ code: "ENOENT" })
  expect(await prepareDistribution(value.input)).toEqual(manifest)
  expect(await payloadSnapshot(value.root)).toEqual(before)
})

test("concurrent archive publishers admit exactly one winner and preserve its complete bytes and hash", async () => {
  const values = await Promise.all([payloadFixture(roots), payloadFixture(roots)])
  await writeFile(join(values[1]!.source, "bin/extra/note.txt"), "distinct competing archive payload\n")
  const payloads = await Promise.all(values.map(async (value) => {
    await prepareDistribution(value.input)
    return payloadSnapshot(value.input.out)
  }))
  const sources = await Promise.all(values.map((value) => payloadSnapshot(value.source)))
  const file = join(values[0]!.root, "competing.tar.gz")
  // Start both real async APIs before awaiting either. The exclusive link is
  // the arbiter; which invocation wins is deliberately unspecified.
  const results = await Promise.allSettled(values.map((value) => archiveDistribution({ directory: value.input.out, file })))
  const winners = results.flatMap((result, index) => result.status === "fulfilled" ? [{ index, value: result.value }] : [])
  const losers = results.flatMap((result, index) => result.status === "rejected" ? [{ index, reason: result.reason as unknown }] : [])
  expect(winners).toHaveLength(1)
  expect(losers).toHaveLength(1)
  expect(losers[0]!.reason).toMatchObject({ code: "EEXIST" })
  const bytes = await readFile(file)
  const hash = createHash("sha256").update(bytes).digest("hex")
  expect(winners[0]!.value).toEqual({ version: "1.2.3", target: tuple.target, file, sha256: hash })
  const members = await new Bun.Archive(bytes).files()
  const expected = payloads[winners[0]!.index]!.filter((entry) => entry.kind === "file")
  expect([...members.keys()].sort()).toEqual(expected.map((entry) => entry.path).sort())
  for (const entry of expected) {
    const member = members.get(entry.path)
    expect(member).toBeDefined()
    expect(Buffer.from(await member!.arrayBuffer()).equals(entry.bytes)).toBe(true)
  }
  const before = await Promise.all(values.map((value) => payloadSnapshot(value.root)))
  await expect(archiveDistribution({ directory: values[losers[0]!.index]!.input.out, file })).rejects.toMatchObject({ code: "EEXIST" })
  expect(await readFile(file)).toEqual(bytes)
  expect(createHash("sha256").update(await readFile(file)).digest("hex")).toBe(hash)
  expect(await Promise.all(values.map((value) => payloadSnapshot(value.root)))).toEqual(before)
  expect(await Promise.all(values.map((value) => payloadSnapshot(value.source)))).toEqual(sources)
  expect(await Promise.all(values.map((value) => payloadSnapshot(value.input.out)))).toEqual(payloads)
})
