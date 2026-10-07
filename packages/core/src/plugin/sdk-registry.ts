export * as PluginSdkRegistry from "./sdk-registry"

import { createServer } from "node:http"
import { createHash, randomUUID } from "node:crypto"
import { gzipSync } from "node:zlib"
// @ts-expect-error Arborist's frozen packument-cache SPI has no published declarations.
import PackumentCache from "@npmcli/arborist/lib/packument-cache.js"
import { PluginSdkPackage } from "./sdk-package"

// Archive contains only generated, fixed SDK paths; no host files or workspace dependencies.
function archive() {
  return gzipSync(Buffer.concat([
    ...Object.entries(PluginSdkPackage.sources).flatMap(([file, source]) => {
      const bytes = Buffer.from(source)
      const header = Buffer.alloc(512)
      header.write(`package/${file}`, 0, 100)
      header.write("0000644\0", 100, 8)
      header.write("0000000\0", 108, 8)
      header.write("0000000\0", 116, 8)
      header.write(bytes.length.toString(8).padStart(11, "0") + "\0", 124, 12)
      header.write("00000000000\0", 136, 12)
      header.fill(32, 148, 156)
      header.write("0", 156, 1)
      header.write("ustar\0", 257, 6)
      header.write("00", 263, 2)
      header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, "0") + "\0 ", 148, 8)
      return [header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512)]
    }),
    Buffer.alloc(1024),
  ]))
}

function sdkKey(key: string) {
  if (!key.startsWith("full:") && !key.startsWith("corgi:")) return false
  const raw = key.slice(key.indexOf(":") + 1)
  if (!URL.canParse(raw)) return false
  return decodeURIComponent(new URL(raw).pathname).endsWith("/" + PluginSdkPackage.manifest.name)
}

export async function open() {
  const bytes = archive()
  const endpoint = "/" + randomUUID() + ".tgz"
  const server = createServer((request, response) => {
    if (request.url !== endpoint || request.method !== "GET") {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { "content-type": "application/octet-stream", "content-length": bytes.length }).end(bytes)
  })
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve() })
  })
  const address = server.address()
  if (!address || typeof address === "string") {
    server.close()
    throw new Error("SDK loopback listener has no TCP address")
  }
  const dist = {
    tarball: `http://127.0.0.1:${address.port}${endpoint}`,
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
  }
  const packument = {
    name: PluginSdkPackage.manifest.name,
    "dist-tags": { latest: PluginSdkPackage.manifest.version },
    versions: { [PluginSdkPackage.manifest.version]: { ...PluginSdkPackage.manifest, dist } },
  }
  // Preserve Arborist's normal LRU behavior for every non-SDK key.
  const packumentCache = new class extends PackumentCache {
    has(key: string) { return sdkKey(key) || super.has(key) }
    get(key: string) { return sdkKey(key) ? packument : super.get(key) }
  }()
  return {
    dist,
    packumentCache,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}
