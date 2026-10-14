import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import { prepareNpmDistribution } from "../../script/distribution-npm"
import { verifyDistribution } from "../../script/distribution-payload"
import { sandbox, successful, snapshot, skillIdentity, target } from "./distribution-native"
import type { Built, Sandbox } from "./distribution-native"
import { qualify, stopServices } from "./distribution-native-proof"

type RegistryVersion = Record<string, unknown> & { dist: { tarball: string; integrity: string; shasum: string } }

export async function npmChannel(
  directory: string,
  built: Built,
  beforePublic?: (input: { payload: string; version: string; box: Sandbox }) => Promise<void>,
) {
  const box = await sandbox(join(directory, "npm"))
  const tarballs = join(box.directory, "tarballs")
  const prefix = join(box.directory, "prefix")
  await mkdir(tarballs)
  const packages = new Map<string, Map<string, RegistryVersion>>()
  const blobs = new Map<string, string>()
  const requests: string[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(request) {
      const route = decodeURIComponent(new URL(request.url).pathname.slice(1))
      requests.push(route)
      const blob = blobs.get(route)
      if (blob) return new Response(Bun.file(blob), { headers: { "content-type": "application/octet-stream" } })
      const entries = packages.get(route)
      if (!entries) return new Response(null, { status: 404 })
      return Response.json({ name: route, versions: Object.fromEntries(entries), "dist-tags": { latest: built.payloads[1].version } })
    },
  })
  const registry = server.url.origin
  const env = {
    ...box.env, npm_config_userconfig: join(box.directory, "user.npmrc"),
    npm_config_globalconfig: join(box.directory, "global.npmrc"), npm_config_cache: join(box.directory, "npm-cache"),
    npm_config_prefix: prefix, npm_config_registry: registry,
  }
  const npmBox = { ...box, env }
  const extracted = []
  const skills = new Map<string, Awaited<ReturnType<typeof snapshot>>>()
  try {
    for (const payload of built.payloads) {
      const output = join(box.directory, `generated-${payload.version}`)
      await prepareNpmDistribution({ payloads: [payload.payload], out: output })
      const modules = join(box.directory, `extracted-${payload.version}`, "node_modules")
      for (const name of ["cli", `cli-${target}`]) {
        const source = join(output, name)
        const metadata = await Bun.file(join(source, "package.json")).json()
        const packed = JSON.parse(await successful(["npm", "pack", "--json", "--ignore-scripts", "--cache", join(box.directory, "pack-cache"), "--pack-destination", tarballs, source], npmBox))
        expect(packed).toHaveLength(1)
        const tarball = join(tarballs, packed[0].filename)
        const bytes = await readFile(tarball)
        const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`
        const shasum = createHash("sha1").update(bytes).digest("hex")
        expect(packed[0].integrity).toBe(integrity)
        expect(packed[0].shasum).toBe(shasum)
        const entries = packages.get(metadata.name) ?? new Map<string, RegistryVersion>()
        entries.set(payload.version, {
          ...metadata, dist: { tarball: `${registry}/${packed[0].filename}`, integrity, shasum },
        })
        packages.set(metadata.name, entries)
        blobs.set(packed[0].filename, tarball)
        const destination = join(modules, "@orchestra", name)
        await mkdir(destination, { recursive: true })
        // Actual npm tarball extraction preserves archive modes; no fabricated bin.
        await successful(["tar", "-xzf", tarball, "--strip-components=1", "-C", destination], box)
        if (name === "cli") {
          expect(metadata.optionalDependencies).toEqual({ [`@orchestra/cli-${target}`]: payload.version })
          continue
        }
        const manifest = await verifyDistribution(source, { version: payload.version, target })
        expect(await verifyDistribution(destination, { version: payload.version, target })).toEqual(manifest)
        expect(await snapshot(destination)).toEqual(await snapshot(source))
        for (const file of payload.manifest.files.filter((file) => file.path.startsWith("bin/")))
          expect(manifest.files.find((entry) => entry.path === file.path)?.sha256).toBe(file.sha256)
        const members = await new Bun.Archive(bytes).files()
        expect([...members.keys()].sort()).toEqual([
          ...manifest.files.map((file) => `package/${file.path}`), "package/distribution.json", "package/checksums.sha256",
        ].sort())
        extracted.push({ version: payload.version, modules, payload: destination, manifest,
          snapshot: await snapshot(destination), wrapper: await snapshot(join(modules, "@orchestra/cli")) })
      }
    }
    expect(extracted).toHaveLength(2)
    for (const payload of [built.payloads[0], built.payloads[1], built.payloads[0]]) {
      await stopServices()
      // Async child lets the same-loop registry serve metadata and tarballs.
      await successful(["npm", "install", "--no-audit", "--no-fund", "--save-exact", "--include=optional",
        "--prefix", prefix, "--registry", registry, `@orchestra/cli@${payload.version}`], npmBox, 180_000)
      const modules = join(prefix, "node_modules")
      const platform = join(modules, "@orchestra", `cli-${target}`)
      const expected = extracted.find((entry) => entry.version === payload.version)
      if (!expected) throw new Error("EXTRACTED_VERSION_MISSING")
      const registered = packages.get(`@orchestra/cli-${target}`)?.get(payload.version)
      const wrapper = packages.get("@orchestra/cli")?.get(payload.version)
      if (!registered || !wrapper) throw new Error("REGISTRY_VERSION_MISSING")
      expect((await Bun.file(join(prefix, "package.json")).json()).dependencies["@orchestra/cli"]).toBe(payload.version)
      const lock = await Bun.file(join(prefix, "package-lock.json")).json()
      expect(lock.packages["node_modules/@orchestra/cli"].version).toBe(payload.version)
      expect(lock.packages["node_modules/@orchestra/cli"].integrity).toBe(wrapper.dist.integrity)
      expect(lock.packages[`node_modules/@orchestra/cli-${target}`].version).toBe(payload.version)
      expect(lock.packages[`node_modules/@orchestra/cli-${target}`].integrity).toBe(registered.dist.integrity)
      expect((await Bun.file(join(modules, "@orchestra/cli/package.json")).json()).version).toBe(payload.version)
      expect((await Bun.file(join(platform, "package.json")).json()).version).toBe(payload.version)
      expect(await snapshot(join(modules, "@orchestra/cli"))).toEqual(expected.wrapper)
      expect(await verifyDistribution(platform, { version: payload.version, target })).toEqual(expected.manifest)
      expect(await snapshot(platform)).toEqual(expected.snapshot)
      if (process.platform === "win32") {
        const { assertWindowsPE } = await import("./distribution-windows-process")
        const images = expected.manifest.files.filter((file) => /\.(exe|node)$/.test(file.path))
        expect(images.length).toBeGreaterThan(2)
        for (const file of images) await assertWindowsPE(join(platform, file.path), file.path.endsWith(".node"))
        const shims = await snapshot(join(modules, ".bin"))
        if (!shims) throw new Error("WINDOWS_NPM_PUBLIC_SHIMS_MISSING")
        expect([...shims.files.keys()].sort()).toEqual(["orchestra", "orchestra.cmd", "orchestra.ps1"])
        expect(shims.directories).toEqual([])
        for (const shim of shims.files.values()) expect(shim.bytes.length).toBeGreaterThan(0)
      }
      // Optional host diagnostic runs the exact verified npm-installed closure.
      // Public launcher qualification remains mandatory after this control.
      if (beforePublic) await beforePublic({ payload: platform, version: payload.version, box })
      const root = await qualify({ launcher: join(modules, `.bin/orchestra${process.platform === "win32" ? ".cmd" : ""}`), payload: platform, version: payload.version,
        box, oracle: built.oracle, negative: payload === built.payloads[1] })
      skills.set(root, await snapshot(root))
      for (const [old, expected] of skills) expect(await snapshot(old)).toEqual(expected)
      for (const old of extracted) {
        expect(await snapshot(old.payload)).toEqual(old.snapshot)
        expect(await snapshot(join(old.modules, "@orchestra/cli"))).toEqual(old.wrapper)
      }
      if (process.platform === "win32")
        for (const source of built.payloads) expect(await snapshot(source.payload)).toEqual(source.snapshot)
    }
    // Retained old npm-extracted closures must still run through their public wrapper.
    for (const old of extracted) {
      await qualify({ launcher: join(old.modules, "@orchestra/cli/bin/orchestra.cjs"), payload: old.payload,
        version: old.version, box, oracle: built.oracle })
      expect(await snapshot(old.payload)).toEqual(old.snapshot)
      expect(await snapshot(join(old.modules, "@orchestra/cli"))).toEqual(old.wrapper)
      for (const [root, expected] of skills) expect(await snapshot(root)).toEqual(expected)
    }
    expect((await readdir(box.namespace)).sort()).toEqual(built.payloads.map((payload) => skillIdentity(payload.version, built.oracle)).sort())
    expect(requests).toContain("@orchestra/cli")
    expect(requests).toContain(`@orchestra/cli-${target}`)
    for (const filename of blobs.keys()) expect(requests).toContain(filename)
  } finally { await stopServices().finally(() => server.stop(true)) }
}
