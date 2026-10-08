export * as PluginSdkAdmission from "./sdk-admission"

import path from "node:path"
import { fileURLToPath } from "node:url"
import { realpath, stat } from "node:fs/promises"
import type Arborist from "@npmcli/arborist"
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
  for (const directory of parents) {
    if (await PluginSdkPackage.exists(path.join(directory, "package.json"))) return directory
    // Local configuration code has its own source envelope, even when the
    // containing application is a workspace with thousands of installed packages.
    if (["plugin", "plugins", "tool", "tools"].includes(path.basename(directory)) && path.basename(path.dirname(directory)) === ".orchestra")
      return path.dirname(file)
  }
  return path.dirname(file)
}

async function dependency(directory: string, name: string) {
  for (const dir of ancestry(directory)) {
    const slot = path.join(dir, "node_modules", name)
    if (await PluginSdkPackage.exists(slot)) return slot
  }
}

// Admit source envelopes and dependency roots, not the containing application.
// Inventory installed namespaces once without recursively walking their sources.
// Deliberate escapes and later filesystem mutation are not sandboxed here.
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
    const namespaces = new Map<string, Promise<Arborist.Node>>()
    const indexed = new Set<string>()
    const metadata = new Map<string, Record<string, unknown>>()
    const nodes = new Map<string, Arborist.Node>()
    const sdk = new Set<string>()
    const create = new Set<string>()
    const quota = PluginSdkLimits.budget()
    const inventoryQuota = PluginSdkLimits.budget()
    const bundled = await realpath(path.resolve(import.meta.dir, "../../../plugin"))
    // This exact host package is already the authority backing runtime modules.
    // A different tree bearing its name (including any foreign link) is untrusted.
    const host = async (directory: string) => await realpath(directory) === bundled
    const read = async (directory: string, budget = quota) => {
      const canonical = await realpath(directory)
      if (metadata.has(canonical)) return metadata.get(canonical)!
      const pkg = path.join(canonical, "package.json")
      const value = await PluginSdkPackage.exists(pkg) ? decodePackage((await PluginSdkLimits.read(pkg, budget)).toString("utf8")) : {}
      metadata.set(canonical, value)
      return value
    }
    // Bound the installed metadata before Arborist allocates its inventory. Only
    // namespace/package metadata is visited; .git, builds and assets never enter.
    const index = async (namespace: string): Promise<void> => {
      const canonical = await realpath(namespace)
      if (indexed.has(canonical)) return
      indexed.add(canonical)
      for await (const entry of PluginSdkLimits.entries(canonical, inventoryQuota)) {
        if (entry.name.startsWith(".")) continue
        const directory = path.join(canonical, entry.name)
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
        if (entry.name.startsWith("@")) {
          await index(directory)
          continue
        }
        await read(directory, inventoryQuota)
        const nested = path.join(await realpath(directory), "node_modules")
        if (await PluginSdkPackage.exists(nested)) await index(nested)
      }
    }
    const inventory = async (namespace: string) => {
      const canonical = await realpath(namespace)
      const previous = namespaces.get(canonical)
      if (previous) return previous
      const loading = (async () => {
        await index(canonical)
        // Global mode indexes node_modules without adopting the application's
        // package, workspace globs, lockfiles or missing dependency graph.
        const options = { path: path.dirname(canonical), global: true, ignoreMissing: true, workspacesEnabled: false }
        const tree = await new Arborist(options).loadActual()
        for (const node of tree.inventory.values()) {
          if (node.isRoot) continue
          nodes.set(node.path, node)
          nodes.set(node.realpath, node.isLink ? node.target : node)
          const nested = path.join(node.realpath, "node_modules")
          if (indexed.has(nested) && !namespaces.has(nested)) namespaces.set(nested, Promise.resolve(tree))
          if (node.errors.length) throw new Error(`Cannot prove package metadata at ${node.path}`)
          if (node.name === PluginSdkPackage.manifest.name || node.package.name === PluginSdkPackage.manifest.name) {
            if (!(await host(node.path))) sdk.add(node.path)
          }
          for (const edge of node.edgesOut.values()) {
            if (edge.name !== PluginSdkPackage.manifest.name && !edge.rawSpec.startsWith("npm:")) continue
            const slot = edge.to?.path ?? await dependency(node.realpath, edge.name)
            if (slot && edge.rawSpec.startsWith("workspace:") && await host(slot)) continue
            if (!PluginSdkPackage.request(edge.name, edge.rawSpec)) continue
            if (slot) {
              if (!(await host(slot))) sdk.add(slot)
            } else create.add(path.join(node.path, "node_modules", edge.name))
          }
        }
        return tree
      })()
      namespaces.set(canonical, loading)
      return loading
    }
    while (pending.size) {
      const directory = pending.values().next().value
      if (!directory) break
      pending.delete(directory)
      const canonical = await realpath(directory)
      // A linked module executes with realpath ancestry. Lexical ancestry alone
      // misses SDK trees above its external target, including computed imports.
      for (const parent of new Set([...ancestry(directory), ...ancestry(canonical)])) {
        const namespace = path.join(parent, "node_modules")
        if (await PluginSdkPackage.exists(namespace)) {
          const slot = path.join(namespace, PluginSdkPackage.manifest.name)
          if (await PluginSdkPackage.exists(slot)) {
            if (!(await host(slot))) sdk.add(slot)
          }
          else create.add(slot)
          await inventory(namespace)
        }
      }
      if (visited.has(canonical)) continue
      if (visited.size >= PluginSdkLimits.limits.directories) throw new Error("Module footprint exceeds admission bound")
      visited.add(canonical)
      const pkg = await read(canonical)
      if (pkg.name === PluginSdkPackage.manifest.name && !(await host(directory))) sdk.add(directory)
      if (sdk.has(directory) || sdk.has(canonical)) continue
      const node = nodes.get(canonical)
      for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "devDependencies"]) {
        if (pkg[field] === undefined) continue
        const requests = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.String))(pkg[field])
        for (const [name, spec] of Object.entries(requests)) {
          const slot = node?.edgesOut.get(name)?.to?.path ?? await dependency(canonical, name)
          const request = (name === PluginSdkPackage.manifest.name || spec.startsWith("npm:")) && PluginSdkPackage.request(name, spec)
          if (request) {
            if (slot) {
              if (!(await host(slot))) sdk.add(slot)
            } else create.add(path.join(canonical, "node_modules", name))
            continue
          }
          if (slot) {
            // Installed application workspaces supply normal dependencies. Their
            // namespace metadata is indexed; their whole source repo is not ours.
            const resolved = node?.edgesOut.get(name)?.to
            if (!resolved?.isWorkspace && !(resolved?.isLink && PluginSdkPackage.contains(path.dirname(bundled), resolved.realpath))) pending.add(slot)
            continue
          }
          const peers = pkg.peerDependenciesMeta === undefined ? {} : Schema.decodeUnknownSync(
            Schema.Record(Schema.String, Schema.Struct({ optional: Schema.optional(Schema.Boolean) })),
          )(pkg.peerDependenciesMeta)
          const optional = field === "peerDependencies" && peers[name]?.optional === true
          if (field === "dependencies" || (field === "peerDependencies" && !optional))
            throw new Error(`Dependency ${name} is outside installed footprint at ${canonical}`)
        }
      }
      for await (const entry of PluginSdkLimits.entries(canonical, quota)) {
        if (entry.name === "node_modules") continue
        const target = path.join(canonical, entry.name)
        if (entry.isDirectory()) pending.add(target)
        if (entry.isSymbolicLink()) {
          const resolved = await realpath(target)
          if ((await stat(resolved)).isDirectory()) pending.add(target)
          else pending.add(await scope(resolved))
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
