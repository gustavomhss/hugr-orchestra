import { mkdirSync, readFileSync, realpathSync, symlinkSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"

// Native lanes run from fresh checkouts without installing external packages.
// Relative source links also resolve inside the musl lane's /work bind mount.
const root = realpathSync(process.cwd())
const registry = JSON.parse(readFileSync(join(root, "script/module-registry.json"), "utf8"))
if (registry.format !== 1 || !Array.isArray(registry.modules) || !registry.modules.length)
  throw new Error("ARTIFACT_WORKSPACE_REGISTRY_INVALID")
const links = ["@orchestra/script", "@orchestra/core"].map((name) => {
  const entries = registry.modules.filter((entry) => entry.name === name)
  if (entries.length !== 1 || typeof entries[0].path !== "string")
    throw new Error(`ARTIFACT_WORKSPACE_ENTRY_INVALID:${name}`)
  const target = realpathSync(resolve(root, entries[0].path))
  const owned = relative(root, target)
  if (!owned || owned === ".." || owned.startsWith(`..${sep}`) || isAbsolute(owned))
    throw new Error(`ARTIFACT_WORKSPACE_PATH_OUTSIDE_ROOT:${name}`)
  if (JSON.parse(readFileSync(join(target, "package.json"), "utf8")).name !== name)
    throw new Error(`ARTIFACT_WORKSPACE_NAME_MISMATCH:${name}`)
  return { name, target, link: join(root, "node_modules", name) }
})
links.forEach((entry) => {
  mkdirSync(dirname(entry.link), { recursive: true })
  symlinkSync(relative(dirname(entry.link), entry.target), entry.link, "dir")
  if (realpathSync(entry.link) !== entry.target) throw new Error(`ARTIFACT_WORKSPACE_LINK_MISMATCH:${entry.name}`)
  console.log(`artifact workspace: ${entry.name} -> ${relative(root, entry.target)}`)
})
