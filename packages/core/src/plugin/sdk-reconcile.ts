export * as PluginSdkReconcile from "./sdk-reconcile"

import path from "node:path"
import { realpath } from "node:fs/promises"
import type Arborist from "@npmcli/arborist"
import { PluginSdkPackage } from "./sdk-package"

export async function reconcile(tree: Arborist.Node, directory: string, dist: { tarball: string; integrity: string }, cache: string) {
  const nodes = Array.from(tree.inventory.values())
  const targets = new Set(nodes.filter((node) => !node.isRoot && !node.linksIn.size && (node.package.name === PluginSdkPackage.manifest.name || node.name === PluginSdkPackage.manifest.name)))
  nodes.forEach((node) => node.edgesOut.forEach((edge) => {
    if (PluginSdkPackage.request(edge.name, edge.spec) && edge.to) targets.add(edge.to)
  }))
  const root = await realpath(directory)
  for (const node of targets) {
    if (!(await PluginSdkPackage.valid(node.path))) {
      // Only replace regular cache-owned SDK trees; foreign links need a fresh install.
      if (!PluginSdkPackage.contains(root, node.path) || !(await PluginSdkPackage.owned(node.path, cache)))
        throw new PluginSdkPackage.SetupError({ path: node.path, reason: "Foreign SDK outside owned npm cache; left intact" })
      if (node.isLink)
        throw new PluginSdkPackage.SetupError({ path: node.path, reason: "Foreign SDK link requires a fresh owned installation; left intact" })
      await PluginSdkPackage.write(node.path, true)
    }
    node.package = PluginSdkPackage.manifest
    node.resolved = dist.tarball
    node.integrity = dist.integrity
    if (tree.meta) addMetadata(tree.meta, node)
  }
  if (targets.size) await tree.meta?.save()
}

// Shrinkwrap.add is present in the installed Arborist 9 SPI, but omitted from
// its public declarations. Fail if that capability disappears; never skip it.
function addMetadata(meta: Arborist.Shrinkwrap, node: Arborist.Node) {
  if (!("add" in meta) || typeof meta.add !== "function")
    throw new PluginSdkPackage.SetupError({ path: meta.path, reason: "Required Shrinkwrap.add SPI is unavailable" })
  meta.add(node)
}
