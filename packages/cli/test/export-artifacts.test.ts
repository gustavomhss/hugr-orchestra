import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { verifyCliArtifact } from "../../desktop/src/main/cli-artifacts"
import { namedTargets } from "../script/targets"
import { artifactNative } from "../script/artifact-fs"

const version = "1.18.27-export-test"
const script = resolve(import.meta.dirname, "../script/export-artifacts.ts")

async function fixture(run: (input: { root: string; dist: string; out: string }) => Promise<void>, existing = true) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "cli-export-test-")))
  const input = { root, dist: join(root, "dist"), out: join(root, "artifacts") }
  if (existing) {
    await mkdir(input.out)
    await writeFile(join(input.out, "sentinel"), "previous output")
  }
  await Promise.all(
    namedTargets.map(async (item) => {
      const source = join(input.dist, `cli-${item.target}`)
      await mkdir(join(source, "bin"), { recursive: true })
      await writeFile(
        join(source, "package.json"),
        JSON.stringify({
          name: `@orchestra/cli-${item.target}`,
          version,
          os: [item.os],
          cpu: [item.arch],
        }),
      )
      // Deliberately non-executable fixture bytes: producer never executes artifacts.
      await writeFile(
        join(source, "bin", `orchestra${item.os === "win32" ? ".exe" : ""}`),
        Buffer.concat([Buffer.from([0, 255, 128, 10]), Buffer.from(item.target)]),
      )
    }),
  )
  return run(input).finally(() => rm(root, { recursive: true, force: true }))
}

async function run(input: { dist: string; out: string }, targets: string[], extra: string[] = []) {
  const child = Bun.spawn(
    [
      process.execPath,
      "--bun",
      script,
      "--dist",
      input.dist,
      "--out",
      input.out,
      "--version",
      version,
      ...targets.flatMap((target) => ["--target", target]),
      ...extra,
    ],
    { stdout: "pipe", stderr: "pipe", timeout: 30_000 },
  )
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return { code, stdout, stderr }
}

async function snapshot(directory: string): Promise<Record<string, string>> {
  const entries = await readdir(directory, { withFileTypes: true })
  return Object.assign(
    {},
    ...(await Promise.all(
      entries.map(async (entry) => {
        if (entry.isDirectory())
          return Object.fromEntries(
            Object.entries(await snapshot(join(directory, entry.name))).map(([file, value]) => [
              join(entry.name, file),
              value,
            ]),
          )
        return { [entry.name]: (await readFile(join(directory, entry.name))).toString("hex") }
      }),
    )),
  )
}

test("exports all builder targets as raw bytes accepted by Desktop schema1 verifier", () =>
  fixture(async (input) => {
    const before = await snapshot(input.dist)
    const result = await run(
      input,
      namedTargets.map((item) => item.target),
    )
    expect(result.stderr).toBe("")
    expect(result.code).toBe(0)
    const manifest = await Bun.file(join(input.out, "manifest.json")).json()
    expect(manifest.schema).toBe(1)
    expect(manifest.version).toBe(version)
    expect(manifest.artifacts).toHaveLength(namedTargets.length)
    expect((await readdir(input.out)).sort()).toEqual(
      [
        "manifest.json",
        ...namedTargets.map((item) => `orchestra-${item.target}${item.os === "win32" ? ".exe" : ""}`),
      ].sort(),
    )
    await Promise.all(
      namedTargets.map(async (item, index) => {
        const file = `orchestra-${item.target}${item.os === "win32" ? ".exe" : ""}`
        const bytes = await readFile(
          join(input.dist, `cli-${item.target}`, "bin", `orchestra${item.os === "win32" ? ".exe" : ""}`),
        )
        expect(await readFile(join(input.out, file))).toEqual(bytes)
        expect((await lstat(join(input.out, file))).isFile()).toBe(true)
        if (process.platform !== "win32" && item.os !== "win32")
          expect((await lstat(join(input.out, file))).mode & 0o777).toBe(0o755)
        expect(manifest.artifacts[index]).toEqual({
          target: item.target,
          file,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        })
        expect(await verifyCliArtifact(input.out, item.target)).toEqual({ path: join(input.out, file), version })
      }),
    )
    expect(await snapshot(input.dist)).toEqual(before)
  }, false))

test("immutable publication rejects empty and nonempty existing outputs preserving every file", () =>
  fixture(async (input) => {
    await mkdir(join(input.out, "nested"))
    await writeFile(join(input.out, "nested/other"), "untouched")
    const before = await snapshot(input.out)
    const stat = await lstat(input.out)
    const result = await run(input, ["linux-arm64"])
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain("Artifact publication conflict")
    expect(await snapshot(input.out)).toEqual(before)
    expect((await lstat(input.out)).ino).toBe(stat.ino)
    const empty = join(input.root, "empty")
    await mkdir(empty)
    const emptyStat = await lstat(empty)
    const rejected = await run({ ...input, out: empty }, ["linux-arm64"])
    expect(rejected.code).not.toBe(0)
    expect(rejected.stderr).toContain("Artifact publication conflict")
    expect(await readdir(empty)).toEqual([])
    expect((await lstat(empty)).ino).toBe(emptyStat.ino)
    const file = join(input.root, "file")
    await writeFile(file, "existing regular file")
    const rejectedFile = await run({ ...input, out: file }, ["linux-arm64"])
    expect(rejectedFile.code).not.toBe(0)
    expect(rejectedFile.stderr).toContain("Artifact publication conflict")
    expect(await readFile(file, "utf8")).toBe("existing regular file")
  }))

async function identities(directory: string) {
  return Object.fromEntries(
    await Promise.all(
      ["", ...(await readdir(directory))].map(async (file) => {
        const stat = await lstat(join(directory, file))
        return [file, { ino: stat.ino, dev: stat.dev, mtime: stat.mtimeMs, ctime: stat.ctimeMs }]
      }),
    ),
  )
}

async function observeExisting(input: { dist: string; out: string }, targets: string[], extra: string[] = []) {
  const state = { done: false, samples: 0 }
  const expected = await snapshot(input.out)
  const execution = run(input, targets, extra).finally(() => {
    state.done = true
  })
  await (async () => {
    while (!state.done) {
      expect(await snapshot(input.out)).toEqual(expected)
      state.samples++
      await Bun.sleep(1)
    }
  })().finally(() => execution)
  expect(state.samples).toBeGreaterThan(0)
  return execution
}

test("exclusive OS publisher never replaces even an empty concurrent destination", () =>
  fixture(async (input) => {
    const staging = join(input.root, "staging")
    await mkdir(staging)
    await writeFile(join(staging, "ready"), "complete staging bytes")
    const source = await snapshot(staging)
    const empty = join(input.root, "empty")
    await mkdir(empty)
    const native = await artifactNative()
    // Fixture root has already been resolved. Root acquisition walks components
    // in the production admission tests; this primitive test pins its known parent.
    const parent = native.root(input.root)
    const directory = native.directory(parent, "staging", { removable: true })
    try {
      for (const output of [input.out, empty]) {
        const bytes = await snapshot(output)
        const before = await identities(output)
        expect(() => native.publish(parent, "staging", directory, output === empty ? "empty" : "artifacts")).toThrow()
        expect(await identities(output)).toEqual(before)
        expect(await snapshot(output)).toEqual(bytes)
        expect(await snapshot(staging)).toEqual(source)
      }
      const fresh = join(input.root, "fresh")
      native.publish(parent, "staging", directory, "fresh")
      expect(await snapshot(fresh)).toEqual(source)
    } finally {
      native.closeDirectory(directory)
      native.closeDirectory(parent)
      native.close()
    }
  }))

async function observePublication(input: { dist: string; out: string }, requests: string[][]) {
  const state = { done: false, samples: 0, visible: false, ino: 0 }
  const execution = Promise.all(requests.map((targets) => run(input, targets))).finally(() => {
    state.done = true
  })
  await (async () => {
    while (!state.done) {
      const stat = await lstat(input.out).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT" && !state.visible) return undefined
        throw error
      })
      if (stat) {
        if (state.visible) expect(stat.ino).toBe(state.ino)
        state.visible = true
        state.ino = stat.ino
        const manifest = await Bun.file(join(input.out, "manifest.json")).json()
        expect(manifest.schema).toBe(1)
        expect(manifest.version).toBe(version)
        await Promise.all(
          manifest.artifacts.map(async (entry: { target: string; file: string }) => {
            await verifyCliArtifact(input.out, entry.target)
            expect(await readFile(join(input.out, entry.file))).toEqual(
              await readFile(
                join(
                  input.dist,
                  `cli-${entry.target}`,
                  "bin",
                  `orchestra${entry.target.startsWith("windows-") ? ".exe" : ""}`,
                ),
              ),
            )
          }),
        )
        state.samples++
      }
      await Bun.sleep(1)
    }
  })().finally(() => execution)
  expect(state.samples).toBeGreaterThan(0)
  return execution
}

test("concurrent immutable initial publications expose only complete tree and exact retries succeed", () =>
  fixture(async (input) => {
    const targets = ["linux-arm64", "windows-x64-baseline"]
    const result = await observePublication(
      input,
      Array.from({ length: 6 }, () => targets),
    )
    result.map((entry) => expect(entry.code).toBe(0))
    await Promise.all(targets.map((target) => verifyCliArtifact(input.out, target)))
    expect((await readdir(input.root)).sort()).toEqual(["artifacts", "dist"])
  }, false))

test("concurrent conflicting initial publications preserve winner and return named conflicts", () =>
  fixture(async (input) => {
    const requests = Array.from({ length: 8 }, (_, index) => [index % 2 ? "linux-arm64" : "windows-x64-baseline"])
    const results = await observePublication(input, requests)
    const manifest = await Bun.file(join(input.out, "manifest.json")).json()
    expect(manifest.artifacts).toHaveLength(1)
    const winner = manifest.artifacts[0].target
    results.map((result, index) => {
      if (requests[index][0] === winner) return expect(result.code).toBe(0)
      expect(result.code).not.toBe(0)
      expect(result.stderr).toContain("Artifact publication conflict")
    })
    await verifyCliArtifact(input.out, winner)
    expect((await readdir(input.root)).sort()).toEqual(["artifacts", "dist"])
  }, false))

test("immutable publication exact retry makes no writes and never removes visible output", () =>
  fixture(async (input) => {
    const targets = ["linux-arm64", "windows-x64-baseline"]
    expect((await run(input, targets)).code).toBe(0)
    const before = await identities(input.out)
    const parent = await identities(input.root)
    expect((await observeExisting(input, [...targets].reverse())).code).toBe(0)
    expect(await identities(input.out)).toEqual(before)
    expect(await identities(input.root)).toEqual(parent)
    await Promise.all(targets.map((target) => verifyCliArtifact(input.out, target)))
  }, false))

test("immutable publication conflicts on changed bytes version targets and invalid output", () =>
  fixture(async (input) => {
    const targets = ["linux-arm64", "windows-x64-baseline"]
    expect((await run(input, targets)).code).toBe(0)
    const before = await identities(input.out)
    const bytes = await snapshot(input.out)
    const subset = await observeExisting(input, ["linux-arm64"])
    expect(subset.code).not.toBe(0)
    expect(subset.stderr).toContain("Artifact publication conflict")
    const binary = join(input.dist, "cli-linux-arm64/bin/orchestra")
    const original = await readFile(binary)
    await writeFile(binary, "changed source bytes")
    const changed = await observeExisting(input, targets)
    expect(changed.code).not.toBe(0)
    expect(changed.stderr).toContain("Artifact publication conflict")
    await writeFile(binary, original)
    await Promise.all(
      targets.map(async (target) => {
        const metadata = join(input.dist, `cli-${target}/package.json`)
        await writeFile(metadata, JSON.stringify({ ...(await Bun.file(metadata).json()), version: "new-version" }))
      }),
    )
    const changedVersion = await observeExisting(input, targets, ["--version", "new-version"])
    expect(changedVersion.code).not.toBe(0)
    expect(changedVersion.stderr).toContain("Artifact publication conflict")
    expect(await snapshot(input.out)).toEqual(bytes)
    expect(await identities(input.out)).toEqual(before)
    await Promise.all(
      targets.map(async (target) => {
        const metadata = join(input.dist, `cli-${target}/package.json`)
        await writeFile(metadata, JSON.stringify({ ...(await Bun.file(metadata).json()), version }))
      }),
    )
    for (const corrupt of [
      () => writeFile(join(input.out, "manifest.json"), "{"),
      () => writeFile(join(input.out, "orchestra-linux-arm64"), "tampered artifact"),
      () => writeFile(join(input.out, "extra"), "unowned file"),
    ]) {
      await corrupt()
      const invalid = await snapshot(input.out)
      const result = await observeExisting(input, targets)
      expect(result.code).not.toBe(0)
      expect(result.stderr).toContain("Artifact publication conflict")
      expect(await snapshot(input.out)).toEqual(invalid)
      await Promise.all(
        Object.entries(bytes).map(([file, value]) => writeFile(join(input.out, file), Buffer.from(value, "hex"))),
      )
    }
  }, false))

test("rejects wrong source version before replacing previous output", () =>
  fixture(async (input) => {
    const metadata = join(input.dist, "cli-linux-arm64/package.json")
    await writeFile(
      metadata,
      JSON.stringify({ name: "@orchestra/cli-linux-arm64", version: "wrong", os: ["linux"], cpu: ["arm64"] }),
    )
    const before = await snapshot(input.dist)
    const result = await run(input, ["windows-x64-baseline", "linux-arm64"])
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain("Artifact version mismatch")
    expect(await snapshot(input.out)).toEqual({ sentinel: Buffer.from("previous output").toString("hex") })
    expect(await snapshot(input.dist)).toEqual(before)
  }))

test("rejects malformed args, traversal and duplicate/unknown targets without writes", () =>
  fixture(async (input) => {
    const before = await snapshot(input.dist)
    for (const [targets, extra] of [
      [[], []],
      [["linux-arm"], []],
      [["../foreign"], []],
      [["linux-arm64", "linux-arm64"], []],
      [["linux-arm64"], ["--target"]],
      [["linux-arm64"], ["--unknown"]],
      [["linux-arm64"], ["--version", " "]],
      [["linux-arm64"], ["--version", "v\n1"]],
    ] as [string[], string[]][])
      expect((await run(input, targets, extra)).code).not.toBe(0)
    expect((await run({ ...input, dist: `${input.dist}/../dist` }, ["linux-arm64"])).code).not.toBe(0)
    expect((await run({ ...input, out: `${input.out}/../artifacts` }, ["linux-arm64"])).code).not.toBe(0)
    expect(await snapshot(input.dist)).toEqual(before)
    expect(await readdir(input.out)).toEqual(["sentinel"])
  }))

test("rejects bad package tuple, malformed metadata and missing/nonregular sources before writes", () =>
  fixture(async (input) => {
    const metadata = join(input.dist, "cli-linux-arm64/package.json")
    const valid = await readFile(metadata)
    for (const value of [
      "{",
      "null",
      "[]",
      ...[{ name: "foreign" }, { os: ["darwin"] }, { cpu: ["x64"] }, { os: ["linux", "darwin"] }, { cpu: "arm64" }].map(
        (change) =>
          JSON.stringify({ name: "@orchestra/cli-linux-arm64", version, os: ["linux"], cpu: ["arm64"], ...change }),
      ),
    ]) {
      await writeFile(metadata, value)
      expect((await run(input, ["linux-arm64"])).code).not.toBe(0)
      expect(await readdir(input.out)).toEqual(["sentinel"])
    }
    await writeFile(metadata, valid)
    const binary = join(input.dist, "cli-linux-arm64/bin/orchestra")
    await rename(binary, `${binary}-saved`)
    expect((await run(input, ["linux-arm64"])).code).not.toBe(0)
    await mkdir(binary)
    expect((await run(input, ["linux-arm64"])).code).not.toBe(0)
    expect((await run({ ...input, dist: join(input.root, "missing") }, ["linux-arm64"])).code).not.toBe(0)
    expect(await readdir(input.out)).toEqual(["sentinel"])
  }))

test("rejects source/output overlap including nonexistent descendants", () =>
  fixture(async (input) => {
    const before = await snapshot(input.dist)
    for (const paths of [
      { dist: input.dist, out: input.dist },
      { dist: input.dist, out: join(input.dist, "new/output") },
      { dist: input.dist, out: input.root },
    ]) {
      const result = await run(paths, ["linux-arm64"])
      expect(result.code).not.toBe(0)
      expect(result.stderr).toContain("Artifact source/output overlap")
    }
    expect(await snapshot(input.dist)).toEqual(before)
    expect(await readdir(input.out)).toEqual(["sentinel"])
  }))

test("rejects symlink roots, ancestors, package metadata and binaries", () =>
  fixture(async (input) => {
    const before = await snapshot(input.dist)
    const alias = join(input.root, "alias")
    await symlink(input.dist, alias, process.platform === "win32" ? "junction" : "dir")
    for (const paths of [
      { dist: alias, out: input.out },
      { dist: input.dist, out: alias },
      { dist: input.dist, out: join(alias, "new/output") },
    ])
      expect((await run(paths, ["linux-arm64"])).code).not.toBe(0)
    for (const part of [
      "cli-linux-arm64",
      "cli-linux-arm64/bin",
      "cli-linux-arm64/package.json",
      "cli-linux-arm64/bin/orchestra",
    ]) {
      const file = join(input.dist, part)
      const stat = await lstat(file)
      await rename(file, `${file}-saved`)
      await symlink(
        `${file}-saved`,
        file,
        stat.isDirectory() ? (process.platform === "win32" ? "junction" : "dir") : "file",
      )
      expect((await run(input, ["linux-arm64"])).code).not.toBe(0)
      if (stat.isDirectory() && process.platform === "win32") await rmdir(file)
      if (!stat.isDirectory() || process.platform !== "win32") await unlink(file)
      await rename(`${file}-saved`, file)
    }
    expect(await snapshot(input.dist)).toEqual(before)
    expect(await readdir(input.out)).toEqual(["sentinel"])
  }))
