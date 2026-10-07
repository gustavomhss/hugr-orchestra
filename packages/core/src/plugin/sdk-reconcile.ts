export * as PluginSdkReconcile from "./sdk-reconcile"

import path from "node:path"
import { mkdir, realpath, rm, writeFile } from "node:fs/promises"
import type Arborist from "@npmcli/arborist"
import { PluginSdkPackage } from "./sdk-package"

export async function reconcile(tree: Arborist.Node, directory: string, dist: { tarball: string; integrity: string }, materialize: boolean) {
  const nodes = Array.from(tree.inventory.values())
  const targets = new Set(nodes.filter((node) => !node.isRoot && (node.package.name === PluginSdkPackage.manifest.name || node.name === PluginSdkPackage.manifest.name)))
  nodes.forEach((node) => node.edgesOut.forEach((edge) => {
    if (PluginSdkPackage.request(edge.name, edge.spec) && edge.to) targets.add(edge.to)
  }))
  const root = await realpath(directory)
  for (const node of targets) {
    if (materialize) {
      // Resolve parents, never the SDK leaf: an existing SDK symlink is replaced, not followed.
      await mkdir(path.dirname(node.path), { recursive: true })
      const relative = path.relative(root, await realpath(path.dirname(node.path)))
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
        throw new Error(`SDK bridge target outside install directory: ${node.path}`)
      await rm(node.path, { recursive: true, force: true })
      await mkdir(node.path, { recursive: true })
      await Promise.all(Object.entries(PluginSdkPackage.sources).map(async ([file, source]) => {
        await mkdir(path.dirname(path.join(node.path, file)), { recursive: true })
        await writeFile(path.join(node.path, file), source)
      }))
    }
    node.package = PluginSdkPackage.manifest
    node.resolved = dist.tarball
    node.integrity = dist.integrity
    tree.meta?.add(node)
  }
  if (targets.size) await tree.meta?.save()
}
