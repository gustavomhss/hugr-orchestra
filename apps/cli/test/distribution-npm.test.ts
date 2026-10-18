import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { omniTargets } from "@orchestra/script/omni"
import { NATIVE_MACHINES, treeSitterBundle } from "@orchestra/script/tree-sitter-prebuilds"
import { namedTargets } from "../script/targets"
import { prepareDistribution, verifyDistribution } from "../script/distribution-payload"
import { prepareNpmDistribution } from "../script/distribution-npm"
import { requireDistributionHost } from "./fixture/distribution-host"

requireDistributionHost()

const roots: string[] = []
const windows = process.platform === "win32"
const target = `${windows ? "windows" : process.platform}-${process.arch}${process.arch === "x64" ? "-baseline" : ""}`
const versions = ["1.18.27-npm-test-a", "1.18.27-npm-test-b"]
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })

async function root() {
  const directory = await mkdtemp(join(await realpath(tmpdir()), "cli-npm-test-"))
  roots.push(directory)
  return directory
}

// Inert native headers + POSIX test executable prove packaging/lifecycle only.
// They do not load addons, extract embedded skills or qualify the real CLI.
async function fixture(directory: string, version = versions[0]!, name = target, special?: string) {
  const tuple = namedTargets.find((entry) => entry.target === name)!
  const source = join(directory, `source-${version}-${name}`, `cli-${name}`)
  const binding = Buffer.alloc(128)
  const machine = NATIVE_MACHINES[`${tuple.os}-${tuple.arch}`]!
  if (tuple.os === "linux") {
    binding.writeUInt32BE(0x7f454c46); binding[4] = 2; binding[5] = 1; binding.writeUInt16LE(machine, 18)
  }
  if (tuple.os === "darwin") { binding.writeUInt32LE(0xfeedfacf); binding.writeUInt32LE(machine, 4) }
  if (tuple.os === "win32") {
    binding.writeUInt16LE(0x5a4d); binding.writeUInt32LE(64, 0x3c); binding.writeUInt32BE(0x50450000, 64); binding.writeUInt16LE(machine, 68)
  }
  const companions = [...treeSitterBundle(tuple).map((file) => `tree-sitter/${file}`),
    ...(omniTargets[name]!.enabled ? ["hugr_omni.node", "hugr-omni-supervisor"] : [])]
  for (const file of [...companions, "marker", ...(special ? [special] : [])]) {
    await mkdir(dirname(join(source, "bin", file)), { recursive: true })
    await writeFile(join(source, "bin", file), file.endsWith(".node") ? binding : file.endsWith("package.json")
      ? JSON.stringify({ name: "synthetic-fixture", version: "1.0.0" }) : `${version}\n`, { mode: file === "hugr-omni-supervisor" ? 0o755 : 0o644 })
  }
  await writeFile(join(source, "bin/orchestra"), `#!/bin/sh\nset -eu\nhere=\${0%/*}\n${["marker", ...companions].map((file) => `test -f "$here/${file}" || exit 73`).join("\n")}\nprintf '%s\\n' '${version}' "$here"\n`, { mode: 0o755 })
  await writeFile(join(source, "package.json"), JSON.stringify({ name: `@humangr/cli-${name}`, version, os: [tuple.os], cpu: [tuple.arch] }))
  const payload = join(directory, `payload-${version}-${name}`)
  await prepareDistribution({ dist: dirname(source), out: payload, version, target: name })
  return { source, payload, out: join(directory, "npm-output") }
}

async function command(args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  const child = Bun.spawn(args, { cwd, env, stdout: "pipe", stderr: "pipe" })
  const timer = setTimeout(() => child.kill(), 90_000)
  try {
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect({ code, stderr }).toEqual({ code: 0, stderr: expect.any(String) })
    return stdout
  } finally { clearTimeout(timer) }
}

async function cleanStages(directory: string) {
  expect((await readdir(directory)).filter((name) => /^\.(cli-npm-|npm-payloads-|distribution-)/.test(name))).toEqual([])
}

async function snapshot(path: string): Promise<unknown> {
  const info = await lstat(path)
  if (!info.isDirectory()) return { bytes: await readFile(path), mode: info.mode }
  const entries = []
  for (const name of (await readdir(path)).sort()) entries.push([name, await snapshot(join(path, name))])
  return entries
}

describe.skipIf(windows)(windows ? "BLOCKED: Windows npm lifecycle needs a Bun-compiled .exe fixture; no Windows qualification" : "synthetic npm distribution", () => {
  test("exact reuse retains full closure and dependency-free exact-version metadata", async () => {
    const directory = await root()
    const value = await fixture(directory)
    const input = { payloads: [value.payload], out: value.out }
    const before = await readFile(join(value.payload, "package.json"))
    expect(await prepareNpmDistribution(input)).toEqual(await prepareNpmDistribution(input))
    const platform = join(value.out, `cli-${target}`)
    const manifest = await verifyDistribution(platform)
    const metadata = await Bun.file(join(platform, "package.json")).json()
    expect(metadata.files).toEqual([...manifest.files.map((file) => file.path), "distribution.json", "checksums.sha256"].sort())
    const wrapper = await Bun.file(join(value.out, "cli/package.json")).json()
    expect(wrapper.optionalDependencies).toEqual({ [`@humangr/cli-${target}`]: versions[0] })
    expect(wrapper.bin).toEqual({ orchestra: "./bin/orchestra.cjs" })
    for (const key of ["dependencies", "devDependencies", "peerDependencies", "scripts", "workspaces"]) {
      expect(wrapper[key]).toBeUndefined(); expect(metadata[key]).toBeUndefined()
    }
    expect(await readFile(join(value.payload, "package.json"))).toEqual(before)
    await cleanStages(directory)
  })

  for (const kind of ["empty", "file", "bytes", "mode", "extra", "empty-directory"] as const) {
    test(`conflicting ${kind} destination stays untouched; owned stages cleaned`, async () => {
      const directory = await root()
      const value = await fixture(directory)
      const input = { payloads: [value.payload], out: value.out }
      if (kind === "empty") await mkdir(value.out)
      if (kind === "file") await writeFile(value.out, "caller-owned")
      if (!["empty", "file"].includes(kind)) {
        await prepareNpmDistribution(input)
        if (kind === "bytes") await writeFile(join(value.out, "cli/package.json"), "caller-owned")
        if (kind === "mode") await chmod(join(value.out, `cli-${target}/bin/orchestra`), 0o644)
        if (kind === "extra") await writeFile(join(value.out, "unowned"), "caller-owned")
        if (kind === "empty-directory") await mkdir(join(value.out, "unowned"))
      }
      const saved = await snapshot(value.out)
      await expect(prepareNpmDistribution(input)).rejects.toThrow()
      expect(await snapshot(value.out)).toEqual(saved)
      if (kind === "bytes") expect(await readFile(join(value.out, "cli/package.json"), "utf8")).toBe("caller-owned")
      if (kind === "mode") await expect(verifyDistribution(join(value.out, `cli-${target}`))).rejects.toThrow("mismatch")
      await cleanStages(directory)
    })
  }

  for (const winner of ["exact", "empty"] as const) {
    test(`no-replace publication race with ${winner} winner cleans owned stage`, async () => {
      const directory = await root()
      const value = await fixture(directory)
      const reference = join(directory, "reference")
      await prepareNpmDistribution({ payloads: [value.payload], out: reference })
      const state = { created: false }
      // Poll actual staging: macOS directory notifications may arrive after publication.
      const watcher = setInterval(() => {
        const filename = readdirSync(directory).find((name) => name.startsWith(".cli-npm-"))
        if (state.created || !filename || !existsSync(join(directory, filename))) return
        state.created = true
        if (winner === "exact") { cpSync(reference, value.out, { recursive: true }); return }
        mkdirSync(value.out)
      }, 1)
      try {
        const work = prepareNpmDistribution({ payloads: [value.payload], out: value.out })
        if (winner === "empty") await expect(work).rejects.toThrow("conflict")
        if (winner === "exact") await work
        expect(state.created).toBe(true) // Positive control: race must actually occur.
        expect(await snapshot(value.out)).toEqual(winner === "exact" ? await snapshot(reference) : [])
        await cleanStages(directory)
      } finally { clearInterval(watcher) }
    })
  }

  test("changed producer payload conflicts without replacing prior bytes", async () => {
    const directory = await root()
    const value = await fixture(directory)
    await prepareNpmDistribution({ payloads: [value.payload], out: value.out })
    const before = await snapshot(value.out)
    const changed = await fixture(directory, versions[1])
    await expect(prepareNpmDistribution({ payloads: [changed.payload], out: value.out })).rejects.toThrow("conflict")
    expect(await snapshot(value.out)).toEqual(before)
    await cleanStages(directory)
  })

  test("linked parent and source/output overlap refuse before writes", async () => {
    const directory = await root()
    const value = await fixture(directory)
    await symlink(value.payload, join(directory, "linked"), "dir")
    const before = await readdir(value.payload)
    for (const out of [value.payload, join(value.payload, "new/nested"), join(directory, "linked/new")])
      await expect(prepareNpmDistribution({ payloads: [value.payload], out })).rejects.toThrow()
    expect(await readdir(value.payload)).toEqual(before)
    await cleanStages(directory)
  })

  for (const special of [".npmignore", ".gitignore", ".npmrc", ".git/config", ".hg/store", ".svn/entries", "CVS/Entries", "node_modules/hidden", "package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "bun.lockb", "pnpm-lock.yaml", "config.gypi", "npm-debug.log.1", "note.orig", "extra/[glob].txt", "extra/+(glob).txt"]) {
    test(`reject npm-special payload path: ${special}`, async () => {
      const directory = await root()
      const value = await fixture(directory, versions[0], target, special)
      await expect(prepareNpmDistribution({ payloads: [value.payload], out: value.out })).rejects.toThrow("Npm-special payload path")
      expect(await readdir(directory)).not.toContain("npm-output")
      await cleanStages(directory)
    })
  }

  test("actual npm pack/extract + registry install/update/downgrade preserve closure and adjacency (synthetic, not native CLI qualification)", async () => {
    const directory = await root()
    const home = join(directory, "home")
    const tarballs = join(directory, "tarballs")
    const prefix = join(directory, "prefix")
    await mkdir(home); await mkdir(tarballs)
    await writeFile(join(directory, "user.npmrc"), ""); await writeFile(join(directory, "global.npmrc"), "")
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^npm_config_/i.test(key) && !["HOME", "USERPROFILE", "ORCHESTRA_BIN_PATH", "NODE_OPTIONS"].includes(key.toUpperCase())))
    Object.assign(env, { HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: join(home, "config"), XDG_CACHE_HOME: join(home, "cache"), XDG_DATA_HOME: join(home, "data"),
      npm_config_userconfig: join(directory, "user.npmrc"), npm_config_globalconfig: join(directory, "global.npmrc"), npm_config_cache: join(directory, "cache"), npm_config_prefix: prefix })
    const packages = new Map<string, Map<string, Record<string, unknown>>>()
    const blobs = new Map<string, Buffer>()
    const server = createServer((request, response) => {
      const route = decodeURIComponent(new URL(request.url!, "http://localhost").pathname.slice(1))
      const blob = blobs.get(route)
      if (blob) return response.writeHead(200, { "content-type": "application/octet-stream" }).end(blob)
      const entries = packages.get(route)
      if (!entries) return response.writeHead(404).end()
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ name: route, versions: Object.fromEntries(entries), "dist-tags": { latest: versions[1] } }))
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    try {
      const address = server.address()
      if (!address || typeof address === "string") throw new Error("Registry did not bind a TCP port")
      const registry = `http://127.0.0.1:${address.port}`
      const targets = process.platform === "linux" ? [target, `${target}-musl`] : [target]
      for (const version of versions) {
        const payloads = []
        for (const name of targets) payloads.push((await fixture(directory, version, name)).payload)
        const output = join(directory, `output-${version}`)
        await prepareNpmDistribution({ payloads, out: output })
        for (const name of ["cli", ...targets.map((target) => `cli-${target}`)]) {
          const packageDirectory = join(output, name)
          const metadata = await Bun.file(join(packageDirectory, "package.json")).json()
          const packed = JSON.parse(await command(["npm", "pack", "--json", "--ignore-scripts", "--pack-destination", tarballs, packageDirectory], directory, env))[0]
          const bytes = await readFile(join(tarballs, packed.filename))
          const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`
          expect(packed.integrity).toBe(integrity)
          // Registry versions are generated package.json, never npm-pack reports.
          if (!packages.has(metadata.name)) packages.set(metadata.name, new Map())
          packages.get(metadata.name)!.set(version, { ...metadata, dist: { tarball: `${registry}/${packed.filename}`, integrity, shasum: createHash("sha1").update(bytes).digest("hex") } })
          blobs.set(packed.filename, bytes)
          const extracted = join(directory, `extracted-${version}-${name}`)
          await mkdir(extracted)
          await new Bun.Archive(bytes).extract(extracted)
          if (name === "cli") continue
          const unpacked = join(extracted, "package")
          const manifest = await verifyDistribution(packageDirectory)
          const members = await new Bun.Archive(bytes).files()
          expect([...members.keys()].sort()).toEqual([...manifest.files.map((file) => `package/${file.path}`), "package/distribution.json", "package/checksums.sha256"].sort())
          for (const file of manifest.files) {
            expect(await readFile(join(unpacked, file.path))).toEqual(await readFile(join(packageDirectory, file.path)))
            // Bun extraction may normalize modes; restore only extracted copies.
            await chmod(join(unpacked, file.path), file.executable ? 0o755 : 0o644)
          }
          await chmod(join(unpacked, "distribution.json"), 0o644); await chmod(join(unpacked, "checksums.sha256"), 0o644)
          expect(await verifyDistribution(unpacked)).toEqual(manifest)
        }
      }
      for (const version of [versions[0]!, versions[1]!, versions[0]!]) {
        // Async child keeps same-loop HTTP registry serving npm requests.
        await command(["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", "--include=optional", "--prefix", prefix, "--registry", registry, `@humangr/cli@${version}`], directory, env)
        const modules = join(prefix, "node_modules")
        expect((await Bun.file(join(modules, "@humangr/cli/package.json")).json()).version).toBe(version)
        const lock = await Bun.file(join(prefix, "package-lock.json")).json()
        expect((await Bun.file(join(prefix, "package.json")).json()).dependencies["@humangr/cli"]).toBe(version)
        expect(lock.packages["node_modules/@humangr/cli"].version).toBe(version)
        for (const name of targets) {
          expect(lock.packages[`node_modules/@humangr/cli-${name}`].version).toBe(version)
          expect((await Bun.file(join(modules, `@humangr/cli-${name}/package.json`)).json()).version).toBe(version)
          await verifyDistribution(join(modules, `@humangr/cli-${name}`), { version, target: name })
        }
        const launched = (await command([join(modules, ".bin/orchestra")], directory, env)).trim().split("\n")
        expect(launched[0]).toBe(version)
        expect(targets.map((name) => join(modules, `@humangr/cli-${name}/bin`))).toContain(launched[1])
        expect(await readFile(join(launched[1]!, "marker"), "utf8")).toBe(`${version}\n`)
      }
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  }, 300_000)
})
