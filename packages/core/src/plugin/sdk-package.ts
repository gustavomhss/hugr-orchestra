export * as PluginSdkPackage from "./sdk-package"

import npa from "npm-package-arg"
import semver from "semver"
import { Schema } from "effect"
import path from "node:path"
import { lstat, mkdir, realpath, rm, writeFile } from "node:fs/promises"
import { PluginSdkLimits, SetupError } from "./sdk-limits"
export { SetupError } from "./sdk-limits"
import sdk from "../../../plugin/package.json"

export class VersionError extends Schema.TaggedErrorClass<VersionError>()("PluginSdkVersionError", {
  requested: Schema.String,
  bundled: Schema.String,
}) {}

export const manifest = {
  name: sdk.name,
  version: sdk.version,
  license: sdk.license,
  type: "module" as const,
  main: "./index.js",
  exports: Object.fromEntries(Object.entries(sdk.exports).map(([key, value]) => [key, value.replace("./src/", "./").replace(/\.ts$/, ".js")])),
}

export const sources = Object.fromEntries([
  ["package.json", JSON.stringify(manifest)],
  ...Object.entries(manifest.exports).map(([key, file]) => [
    file.slice(2),
    `export * from ${JSON.stringify("orchestra-plugin-sdk:" + sdk.name + (key === "." ? "" : key.slice(1)))}\n`,
  ]),
])

export async function exists(file: string) {
  return lstat(file).catch((cause: unknown) => {
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT") return
    throw cause
  })
}

export function contains(root: string, file: string) {
  const relative = path.relative(root, file)
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

// Check the complete generated tree, including bytes, closed exports and absence of extra code.
export async function valid(directory: string): Promise<boolean> {
  const leaf = await exists(directory)
  if (!leaf || !leaf.isDirectory()) return false
  const directories = new Set(Object.keys(sources).flatMap((file) => file.split("/").slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join("/"))))
  const quota = PluginSdkLimits.budget({ ...PluginSdkLimits.limits,
    directories: directories.size + 1,
    entries: Object.keys(sources).length + directories.size,
    bytes: Object.values(sources).reduce((sum, source) => sum + Buffer.byteLength(source) + 1, 0),
  })
  const found = new Set<string>()
  const walk = async (dir: string, prefix: string): Promise<boolean> => {
    for await (const entry of PluginSdkLimits.entries(dir, quota)) {
      const file = prefix + entry.name
      if (entry.isDirectory()) {
        if (!directories.has(file) || !(await walk(path.join(dir, entry.name), file + "/"))) return false
        continue
      }
      if (!entry.isFile() || !Object.hasOwn(sources, file)) return false
      if (!(await PluginSdkLimits.read(path.join(dir, entry.name), quota, Buffer.byteLength(sources[file]))).equals(Buffer.from(sources[file]))) return false
      found.add(file)
    }
    return true
  }
  return (await walk(directory, "")) && found.size === Object.keys(sources).length
}

export async function write(directory: string, replace = false) {
  if ((await exists(directory))?.isSymbolicLink())
    throw new SetupError({ path: directory, reason: "SDK symlink requires a fresh owned installation; left intact" })
  if (await valid(directory)) return
  if ((await exists(directory)) && !replace)
    throw new SetupError({ path: directory, reason: "Foreign or altered SDK tree; left intact" })
  await mkdir(path.dirname(directory), { recursive: true })
  if (replace) await rm(directory, { recursive: true, force: true })
  await mkdir(directory)
  const results = await Promise.allSettled(Object.entries(sources).map(async ([file, source]) => {
    await mkdir(path.dirname(path.join(directory, file)), { recursive: true })
    await writeFile(path.join(directory, file), source, { flag: "wx" })
  }))
  const failure = results.find((result) => result.status === "rejected")
  if (failure?.status === "rejected") throw failure.reason
}

export async function owned(file: string, cache: string) {
  const root = path.join(cache, "packages")
  if (!contains(root, file) || !(await exists(root))) return false
  const parents = async (parent: string): Promise<string> => (await exists(parent)) ? realpath(parent) : parents(path.dirname(parent))
  return contains(await realpath(root), await parents(path.dirname(file)))
}

// npm aliases carry their real package identity in subSpec, not the dependency key.
export function request(name: string, rawSpec: string) {
  const parsed = npa.resolve(name, rawSpec)
  const target = parsed.type === "alias" ? parsed.subSpec : parsed
  if (target.name !== sdk.name) return
  if ((target.type === "tag" && target.fetchSpec === "latest") ||
      ((target.type === "range" || target.type === "version") && target.fetchSpec && semver.satisfies(sdk.version, target.fetchSpec))) return target
  throw new VersionError({ requested: parsed.toString(), bundled: sdk.version })
}

export function requestSpec(specifier: string) {
  const parsed = npa(specifier)
  if (parsed.name) return request(parsed.name, parsed.rawSpec)
  if (parsed.type === "alias") return request(sdk.name, parsed.rawSpec)
}

export function versionFailure(cause: unknown) {
  if (cause instanceof VersionError) return cause
  if (cause instanceof SetupError) return cause
  if (cause && typeof cause === "object" && "code" in cause && cause.code === "ETARGET" &&
      "name" in cause && cause.name === sdk.name && "wanted" in cause && typeof cause.wanted === "string")
    return new VersionError({ requested: `${sdk.name}@${cause.wanted}`, bundled: sdk.version })
}
