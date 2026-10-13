import { expect } from "bun:test"
import { chmod, lstat, readFile, readlink, readdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { verifyDistribution } from "../../script/distribution-payload"
import { assertVersion, cli, command, sandbox, successful, snapshot, skillIdentity, target } from "./distribution-native"
import type { Built } from "./distribution-native"
import { qualify, stopServices } from "./distribution-native-proof"

export async function curlChannel(directory: string, built: Built) {
  const box = await sandbox(join(directory, "curl"))
  const prefix = join(box.directory, "prefix")
  const launcher = join(prefix, "bin/orchestra")
  const installer = join(cli, "distribution/install.sh")
  const key = join(box.directory, "https.key")
  const cert = join(box.directory, "https.crt")
  const config = join(box.directory, "https.cnf")
  await Bun.write(config, "[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=127.0.0.1\n[v3]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n")
  await successful(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key,
    "-out", cert, "-days", "1", "-config", config, "-extensions", "v3"], box)
  const downloads: string[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0, tls: { key: Bun.file(key), cert: Bun.file(cert) },
    fetch(request) {
      const payload = built.payloads.find((payload) => new URL(request.url).pathname === `/${payload.version}.tar.gz`)
      if (!payload) return new Response(null, { status: 404 })
      downloads.push(payload.version)
      return new Response(Bun.file(payload.archive.file), { headers: { "content-type": "application/gzip" } })
    },
  })
  const env = { ...box.env, CURL_CA_BUNDLE: cert }
  const install = (payload: Built["payloads"][number]) => successful(["sh", installer, "--prefix", prefix,
    "--target", target, "--version", payload.version, "--archive", `${server.url.origin}/${payload.version}.tar.gz`,
    "--sha256", payload.archive.sha256], { ...box, env })
  const rollback = (version: string) => ["sh", installer, "--prefix", prefix, "--target", target, "--rollback", version]
  const retained = new Map<string, Awaited<ReturnType<typeof snapshot>>>()
  const skills = new Map<string, Awaited<ReturnType<typeof snapshot>>>()
  try {
    expect(server.url.protocol).toBe("https:")
    for (const [index, payload] of built.payloads.entries()) {
      await stopServices()
      const cached = await snapshot(box.namespace)
      await install(payload)
      expect(await snapshot(box.namespace)).toEqual(cached)
      if (index === 0) expect(await snapshot(box.namespace)).toBeUndefined() // Installer's --version stays lazy too.
      expect(await readlink(join(prefix, "bin/orchestra"))).toBe("../current/bin/orchestra")
      expect(await readlink(join(prefix, "current"))).toBe(`versions/${payload.version}-${target}`)
      const installed = join(prefix, "versions", `${payload.version}-${target}`)
      expect(await verifyDistribution(installed, { version: payload.version, target })).toEqual(payload.manifest)
      expect(await snapshot(installed)).toEqual(payload.snapshot)
      retained.set(installed, await snapshot(installed))
      const root = await qualify({ launcher, payload: installed, box, version: payload.version, oracle: built.oracle, negative: index === 1 })
      skills.set(root, await snapshot(root))
      for (const [old, expected] of retained) expect(await snapshot(old)).toEqual(expected)
      for (const [old, expected] of skills) expect(await snapshot(old)).toEqual(expected)
    }
    const first = built.payloads[0]
    const published = join(prefix, "versions", `${first.version}-${target}`)
    const addon = join(published, "bin/hugr_omni.node")
    const bytes = await readFile(addon)
    const mode = (await lstat(addon)).mode & 0o777
    // Real published companion, not a fake executable or native-header fixture.
    for (const kind of ["missing", "corrupt"] as const) {
      try {
        if (kind === "missing") await rm(addon)
        if (kind === "corrupt") await writeFile(addon, "corrupt published addon")
        const before = await snapshot(published)
        const inventory = await readdir(join(prefix, "versions"))
        const refused = await command(rollback(first.version), box)
        expect(refused.code).not.toBe(0)
        expect(refused.stderr).toMatch(/checksum (inventory )?mismatch/)
        expect(await snapshot(published)).toEqual(before)
        expect(await readdir(join(prefix, "versions"))).toEqual(inventory)
        for (const [old, expected] of retained)
          if (old !== published) expect(await snapshot(old)).toEqual(expected)
        for (const [old, expected] of skills) expect(await snapshot(old)).toEqual(expected)
        expect(await readlink(join(prefix, "current"))).toBe(`versions/${built.payloads[1].version}-${target}`)
        await assertVersion(launcher, built.payloads[1].version, box)
      } finally { await writeFile(addon, bytes); await chmod(addon, mode) }
    }
    await stopServices()
    await successful(rollback(first.version), box)
    expect(await readlink(join(prefix, "current"))).toBe(`versions/${first.version}-${target}`)
    await qualify({ launcher, payload: published, box, version: first.version, oracle: built.oracle })
    expect(downloads).toEqual(built.payloads.map((payload) => payload.version))
    expect((await readdir(join(prefix, "versions"))).sort()).toEqual(built.payloads.map((payload) => `${payload.version}-${target}`).sort())
    expect((await readdir(box.namespace)).sort()).toEqual(built.payloads.map((payload) => skillIdentity(payload.version, built.oracle)).sort())
    for (const [old, expected] of retained) expect(await snapshot(old)).toEqual(expected)
    for (const [old, expected] of skills) expect(await snapshot(old)).toEqual(expected)
  } finally {
    await stopServices().finally(() => server.stop(true))
  }
}
