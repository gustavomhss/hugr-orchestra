import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import semver from "semver"
import pkg from "../../orchestra/package.json" with { type: "json" }

async function load(options: { version?: string; channel?: string; bump?: string; source?: string; probe?: boolean } = {}) {
  // A copied module reads a real isolated owned manifest, including SemVer boundary fixtures.
  const fixture = options.source === undefined ? undefined : await mkdtemp(path.join(import.meta.dir, "../.version-"))
  try {
    if (fixture) {
      await mkdir(path.join(fixture, "packages/script/src"), { recursive: true })
      await Bun.write(path.join(fixture, "packages/script/src/index.ts"), Bun.file(path.join(import.meta.dir, "index.ts")))
      await Bun.write(path.join(fixture, "packages/orchestra/package.json"), JSON.stringify({ version: options.source }))
      await Bun.write(path.join(fixture, "package.json"), Bun.file(path.join(import.meta.dir, "../../../package.json")))
      await Bun.write(path.join(fixture, ".github/TEAM_MEMBERS"), Bun.file(path.join(import.meta.dir, "../../../.github/TEAM_MEMBERS")))
    }
    const child = Bun.spawn([process.execPath, "--eval", `
      // The import has no network seam; guard fetch in this child only, never in the test process.
      globalThis.fetch = async (input) => { throw new Error('NETWORK_DISABLED:' + input) }
      ${options.probe ? "await fetch('https://registry.npmjs.org/orchestra-ai/latest')" : ""}
      const { Script } = await import('./src/index.ts')
      console.log('VERSION_RESULT:' + JSON.stringify({version:Script.version,channel:Script.channel,preview:Script.preview}))
    `], {
      cwd: fixture ? path.join(fixture, "packages/script") : path.join(import.meta.dir, ".."),
      env: { ...process.env, ORCHESTRA_CHANNEL: options.channel ?? "dev", ORCHESTRA_VERSION: options.version ?? "", ORCHESTRA_BUMP: options.bump ?? "", ORCHESTRA_RELEASE: "" },
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    return { stdout, stderr, exitCode }
  } finally {
    if (fixture) await rm(fixture, { recursive: true, force: true })
  }
}

async function version(options: Parameters<typeof load>[0] = {}) {
  const result = await load(options)
  expect(result.stderr).toBe("")
  expect(result.exitCode).toBe(0)
  const line = result.stdout.split("\n").find((line) => line.startsWith("VERSION_RESULT:"))
  expect(line).toBeDefined()
  return JSON.parse(line!.slice("VERSION_RESULT:".length)) as { version: string; channel: string; preview: boolean }
}

test("preview builds identify their actual source release for provider compatibility", async () => {
  const result = await version()
  expect(result.channel).toBe("dev")
  expect(result.preview).toBe(true)
  expect(result.version).toMatch(new RegExp(`^${pkg.version.replaceAll(".", "\\.")}-dev-[0-9]{12}$`))
  expect(semver.valid(result.version)).toBe(result.version)
  expect(semver.gte(result.version, "1.18.0")).toBe(true)
})

test("explicit preview and release versions remain exact", async () => {
  expect((await version({ version: "0.0.0-explicit-preview" })).version).toBe("0.0.0-explicit-preview")
  expect((await version({ version: "1.20.0" })).version).toBe("1.20.0")
})

test("network guard rejects the old registry endpoint", async () => {
  const result = await load({ probe: true })
  expect(result.exitCode).not.toBe(0)
  expect(result.stderr).toContain("NETWORK_DISABLED:https://registry.npmjs.org/orchestra-ai/latest")
})

test("latest defaults to owned source patch without registry access", async () => {
  expect((await version({ channel: "latest" })).version).toBe(semver.inc(pkg.version, "patch")!)
})

for (const [bump, expected] of [["major", "2.0.0"], ["minor", "1.19.0"], ["patch", "1.18.28"], ["PATCH", "1.18.28"]] as const) {
  test(`owned source ${bump} golden without registry access`, async () => {
    expect(await version({ channel: "", bump })).toEqual({ version: expected, channel: "latest", preview: false })
  })
}

for (const explicit of ["1.20.0", "1.20.0-rc.2+build.7", "v1.20.0", "0.0.0-explicit-preview"]) {
  test(`explicit SemVer ${explicit} is preserved exactly`, async () => {
    const result = await version({ channel: "", version: explicit, bump: "major" })
    expect(result.version).toBe(explicit)
    expect(result.channel).toBe("latest")
    expect(result.preview).toBe(false)
  })
}

test("explicit preview retains automatic channel selection", async () => {
  const result = await version({ channel: "", version: "0.0.0-explicit-preview" })
  expect(result.version).toBe("0.0.0-explicit-preview")
  expect(result.channel).not.toBe("latest")
  expect(result.preview).toBe(true)
})

for (const invalid of ["invalid", "1.2", "1.02.3", "1.2.3-beta.01", "9007199254740992.0.0"]) {
  test(`invalid explicit version ${invalid} fails with named error`, async () => {
    const result = await load({ version: invalid })
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain(`Invalid ORCHESTRA_VERSION: ${invalid}`)
    expect(result.stderr).not.toContain("NETWORK_DISABLED:")
  })
}

for (const invalid of ["banana", "prerelease", "patch ", "major.minor", " "]) {
  test(`invalid bump ${JSON.stringify(invalid)} fails before networking or override`, async () => {
    for (const options of [{ channel: "latest" }, { channel: "dev" }, { version: "1.20.0" }]) {
      const result = await load({ ...options, bump: invalid })
      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toContain(`Invalid ORCHESTRA_BUMP: ${invalid}`)
      expect(result.stderr).not.toContain("NETWORK_DISABLED:")
    }
  })
}

for (const [source, bump, expected] of [
  ["0.0.0", "major", "1.0.0"],
  ["0.0.0", "minor", "0.1.0"],
  ["0.0.0", "patch", "0.0.1"],
  ["1.9.99", "minor", "1.10.0"],
  ["1.2.3-rc.4+build.5", "patch", "1.2.3"],
  ["2.0.0-rc.1", "major", "2.0.0"],
  ["1.3.0-rc.1", "minor", "1.3.0"],
] as const) {
  test(`owned source boundary ${source} ${bump} produces ${expected}`, async () => {
    expect((await version({ source, channel: "latest", bump })).version).toBe(expected)
  })
}

test("preview prefix follows isolated owned source", async () => {
  expect((await version({ source: "2.3.4", channel: "beta" })).version).toMatch(/^2\.3\.4-beta-[0-9]{12}$/)
})

test("invalid owned source fails with named error", async () => {
  const result = await load({ source: "invalid", channel: "latest" })
  expect(result.exitCode).not.toBe(0)
  expect(result.stderr).toContain("Invalid source version: invalid")
  expect(result.stderr).not.toContain("NETWORK_DISABLED:")
})
