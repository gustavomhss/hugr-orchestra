import path from "node:path"
import { mkdir, readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import sdk from "../../../plugin/package.json"

export const planted = 'throw new Error("planted SDK copy ran"); export const tool = () => {}; export const marker = true\n'

// Real HTTP packuments and npm tarballs, consumed by the installed Arborist/pacote.
export async function registry(root: string) {
  const packages = new Map<string, { manifest: Record<string, unknown>; bytes: Buffer }>()
  const hits: string[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const name = decodeURIComponent(new URL(request.url).pathname.slice(1))
      hits.push(name)
      const archive = name.startsWith("tarballs/")
      const item = packages.get(archive ? name.slice("tarballs/".length, -4) : name)
      if (!item) return new Response("fixture package missing", { status: 404 })
      if (archive) return new Response(item.bytes)
      return Response.json({
        name,
        "dist-tags": { latest: item.manifest.version },
        versions: { [String(item.manifest.version)]: item.manifest },
      })
    },
  })
  const url = `http://127.0.0.1:${server.port}`
  return {
    url,
    hits,
    async publish(name: string, manifest: Record<string, unknown> = {}, files: Record<string, string> = {}) {
      const directory = path.join(root, "archives", name)
      await mkdir(path.join(directory, "package"), { recursive: true })
      const pkg = { name, version: sdk.version, type: "module", main: "index.js", ...manifest }
      await Promise.all(Object.entries({ "package.json": JSON.stringify(pkg), "index.js": "export const ordinary = 42\n", ...files })
        .map(([file, body]) => Bun.write(path.join(directory, "package", file), body)))
      const tar = Bun.spawnSync(["tar", "-czf", "package.tgz", "package"], { cwd: directory })
      if (tar.exitCode !== 0) throw new Error(`fixture tar failed: ${tar.stderr.toString()}`)
      const bytes = await readFile(path.join(directory, "package.tgz"))
      packages.set(name, {
        bytes,
        manifest: { ...pkg, dist: {
          tarball: `${url}/tarballs/${encodeURIComponent(name)}.tgz`,
          integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
        } },
      })
    },
    async config(directory: string) {
      await Bun.write(path.join(directory, "empty.npmrc"), "")
      await Bun.write(path.join(directory, ".npmrc"), [
        `registry=${url}/`, `@orchestra:registry=${url}/`,
        `cache=${path.join(root, "npm-cache").replaceAll("\\", "/")}`,
        `userconfig=${path.join(directory, "empty.npmrc").replaceAll("\\", "/")}`,
        "audit=false", "fund=false", "fetch-retries=0",
      ].join("\n"))
    },
    async [Symbol.asyncDispose]() { await server.stop(true) },
  }
}

export { sdk }
