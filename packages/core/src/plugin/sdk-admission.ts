export * as PluginSdkAdmission from "./sdk-admission"

import path from "node:path"
import { fileURLToPath } from "node:url"
import { realpath, stat } from "node:fs/promises"
import { Schema } from "effect"
import { Global } from "../global"
import { Flock } from "../util/flock"
import { PluginSdkPackage } from "./sdk-package"
import { PluginSdkLimits } from "./sdk-limits"

const decodePackage = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)))

function ancestry(directory: string): string[] {
  const parent = path.dirname(directory)
  return directory === parent ? [directory] : [directory, ...ancestry(parent)]
}

async function scope(file: string) {
  const parents = ancestry(path.dirname(file))
  const packages = (await Promise.all(parents.map(async (dir) => (await PluginSdkPackage.exists(path.join(dir, "package.json"))) ? dir : undefined)))
    .filter((dir): dir is string => dir !== undefined)
  return packages.find((dir) => !dir.split(path.sep).includes("node_modules")) ?? packages[0] ?? path.dirname(file)
}

async function dependency(directory: string, name: string) {
  for (const dir of ancestry(directory)) {
    const slot = path.join(dir, "node_modules", name)
    if (await PluginSdkPackage.exists(slot)) return slot
  }
}

// Admit the complete on-disk package/source envelope and every installed namespace
// in its resolution ancestry. No import-text guessing; deliberate escapes or later
// filesystem mutation are not sandboxed by this admission.
export async function prepare(specifier: string) {
  return admit(specifier).catch((cause: unknown) => {
    if (cause instanceof PluginSdkPackage.SetupError) throw cause
    throw new PluginSdkPackage.SetupError({ path: specifier, reason: `Cannot prove external module footprint: ${String(cause)}` })
  })
}

async function admit(specifier: string) {
  const file = specifier.startsWith("file:") ? fileURLToPath(specifier) : specifier
  if (!path.isAbsolute(file)) throw new PluginSdkPackage.SetupError({ path: specifier, reason: "External import needs a concrete filesystem entrypoint" })
  return Flock.withLock(`sdk-admission:${await scope(file)}`, async () => {
    const actual = await realpath(file)
    if (!(await stat(actual)).isFile()) throw new Error("External entrypoint is not a regular file")
    const { Arborist } = await import("@npmcli/arborist")
    const pending = new Set([await scope(file), await scope(actual)])
    const visited = new Set<string>()
    const namespaces = new Set<string>()
    const manifests = new Set<string>()
    const sdk = new Set<string>()
    const create = new Set<string>()
    const quota = PluginSdkLimits.budget()
    while (pending.size) {
      const directory = pending.values().next().value
      if (!directory) break
      pending.delete(directory)
      const canonical = await realpath(directory)
      // A linked module executes with realpath ancestry. Lexical ancestry alone
      // misses SDK trees above its external target, including computed imports.
      for (const parent of new Set([...ancestry(directory), ...ancestry(canonical)])) {
        const namespace = path.join(parent, "node_modules")
        if (namespaces.has(namespace)) continue
        namespaces.add(namespace)
        if (await PluginSdkPackage.exists(namespace)) {
          pending.add(namespace)
          const slot = path.join(namespace, PluginSdkPackage.manifest.name)
          if (await PluginSdkPackage.exists(slot)) sdk.add(slot)
          else create.add(slot)
        }
      }
      if (visited.has(canonical)) continue
      if (visited.size >= PluginSdkLimits.limits.directories) throw new Error("Module footprint exceeds admission bound")
      visited.add(canonical)
      const pkg = path.join(canonical, "package.json")
      if (await PluginSdkPackage.exists(pkg)) {
        const metadata = decodePackage((await PluginSdkLimits.read(pkg, quota)).toString("utf8"))
        if (metadata.name === PluginSdkPackage.manifest.name) sdk.add(directory)
        else manifests.add(canonical)
      }
      if (sdk.has(directory) || sdk.has(canonical)) continue
      for await (const entry of PluginSdkLimits.entries(canonical, quota)) {
        const target = path.join(canonical, entry.name)
        if (entry.isDirectory()) pending.add(target)
        if (entry.isSymbolicLink()) {
          const resolved = await realpath(target)
          if ((await stat(resolved)).isDirectory()) pending.add(target)
          else pending.add(await scope(resolved))
        }
      }
    }
    // Arborist's parsed edges expose aliases even when the package metadata lies
    // about its name. Its installed inventory also includes workspace/link targets.
    for (const directory of manifests) {
      const tree = await new Arborist({ path: directory }).loadActual()
      for (const node of tree.inventory.values()) {
        if (node.errors.length) throw new Error(`Cannot prove package metadata at ${node.path}`)
        for (const edge of node.edgesOut.values()) {
          const slot = edge.to?.path ?? await dependency(node.path, edge.name)
          if (PluginSdkPackage.request(edge.name, edge.spec)) {
            if (slot) sdk.add(slot)
            else create.add(path.join(node.path, "node_modules", edge.name))
          } else if (!slot && (edge.type === "prod" || edge.type === "peer")) {
            throw new Error(`Dependency ${edge.name} is outside installed footprint at ${node.path}`)
          }
        }
      }
    }
    for (const directory of sdk) {
      if ((await PluginSdkPackage.exists(directory))?.isSymbolicLink())
        throw new PluginSdkPackage.SetupError({ path: directory, reason: "SDK symlink cannot be admitted; left intact" })
      if (await PluginSdkPackage.valid(directory)) continue
      if (!(await PluginSdkPackage.owned(directory, Global.Path.cache)))
        throw new PluginSdkPackage.SetupError({ path: directory, reason: "Foreign or altered SDK tree; left intact" })
      await PluginSdkPackage.write(directory, true)
    }
    for (const root of [await scope(file), await scope(actual)]) create.add(path.join(root, "node_modules", PluginSdkPackage.manifest.name))
    // Only create absent bridges after the whole footprint has been admitted.
    // Existing directories must prove their bytes; no user SDK is overwritten.
    for (const directory of create) {
      if (sdk.has(directory)) continue
      await PluginSdkPackage.write(directory)
    }
  })
}
