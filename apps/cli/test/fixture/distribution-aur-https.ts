import { expect } from "bun:test"
import { chmod, readFile } from "node:fs/promises"
import { join } from "node:path"
import { sha256, successful, target } from "./distribution-native"
import type { Sandbox } from "./distribution-native"
import type { AurPayload } from "./distribution-aur-inventory"

export async function aurArchives(box: Sandbox, payloads: AurPayload[]) {
  const ca = join(box.directory, "ca.crt")
  const key = join(box.directory, "server.key")
  const cert = join(box.directory, "server.crt")
  const config = join(box.directory, "tls.cnf")
  await Bun.write(config, "[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=127.0.0.1\n[ca]\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n[server]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n")
  await successful(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(box.directory, "ca.key"),
    "-out", ca, "-days", "1", "-subj", "/CN=Orchestra AUR qualification CA", "-config", config, "-extensions", "ca"], box)
  await successful(["openssl", "req", "-new", "-newkey", "rsa:2048", "-nodes", "-keyout", key,
    "-out", join(box.directory, "server.csr"), "-config", config], box)
  await successful(["openssl", "x509", "-req", "-in", join(box.directory, "server.csr"), "-CA", ca,
    "-CAkey", join(box.directory, "ca.key"), "-CAcreateserial", "-out", cert, "-days", "1",
    "-extfile", config, "-extensions", "server"], box)
  await Promise.all([key, join(box.directory, "ca.key")].map((path) => chmod(path, 0o600)))
  const bytes = await Promise.all(payloads.map(async (payload) => {
    const original = await readFile(payload.archive.file)
    expect(sha256(original)).toBe(payload.archive.sha256)
    const tampered = Buffer.from(original)
    tampered[tampered.length - 1] ^= 1
    expect(sha256(tampered)).not.toBe(payload.archive.sha256)
    return { original, tampered, tamperedSha256: sha256(tampered) }
  }))
  const tamper = { enabled: false }
  const requests: { version: string; target: string; tampered: boolean; served: boolean; sha256?: string }[] = []
  const assets = payloads.map((payload) => ["darwin-arm64", "darwin-x64-baseline", "linux-x64-baseline", "linux-arm64"]
    .map((candidate) => ({
      target: candidate, version: payload.version, url: "",
      // Other target rows are refused sentinels, never claimed built/qualified hashes.
      sha256: candidate === target ? payload.archive.sha256 : "0".repeat(64),
      path: `/${payload.version}/${candidate}/archive::payload.tar.gz`,
    })))
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0, tls: { key: Bun.file(key), cert: Bun.file(cert) },
    fetch(request) {
      const asset = assets.flat().find((asset) => asset.path === new URL(request.url).pathname)
      if (!asset) return new Response("AUR_ROUTE_UNAVAILABLE", { status: 404 })
      const served = asset.target === target
      const index = payloads.findIndex((payload) => payload.version === asset.version)
      const archive = bytes[index]
      if (!archive) return new Response("AUR_ARCHIVE_UNAVAILABLE", { status: 500 })
      requests.push({ version: asset.version, target: asset.target, served, tampered: served && tamper.enabled,
        sha256: served ? (tamper.enabled ? archive.tamperedSha256 : asset.sha256) : undefined })
      if (!served) return new Response("AUR_FOREIGN_TARGET_UNQUALIFIED", { status: 410 })
      return new Response(tamper.enabled ? archive.tampered : archive.original,
        { headers: { "content-type": "application/gzip" } })
    },
  })
  expect(server.url.protocol).toBe("https:")
  assets.forEach((rows) => rows.forEach((asset) => { asset.url = `${server.url.origin}${asset.path}` }))
  return { ca, server, tamper, requests, assets, bytes }
}
