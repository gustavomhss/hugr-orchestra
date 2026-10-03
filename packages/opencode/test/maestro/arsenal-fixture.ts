import path from "node:path"
import { mkdir, realpath, symlink } from "node:fs/promises"
import assert from "node:assert/strict"

/** Factory conformance uses the installed SDK, not an unrelated network package installation. */
export async function prepareArsenalSDK(directory: string, configDirectory: string) {
  await Promise.all([directory, configDirectory].map((root) => mkdir(root, { recursive: true })))
  const owned = await Promise.all([directory, configDirectory].map((root) => realpath(root)))
  const workspace = await realpath(path.resolve(import.meta.dir, "../../../.."))
  const manifest = Bun.resolveSync("@opencode-ai/plugin/package.json", path.resolve(import.meta.dir, "../.."))
  const sdk: unknown = await Bun.file(manifest).json()
  assert(
    typeof sdk === "object" &&
      sdk !== null &&
      "name" in sdk &&
      sdk.name === "@opencode-ai/plugin" &&
      "version" in sdk &&
      typeof sdk.version === "string" &&
      sdk.version.length > 0,
    "Arsenal fixture installed SDK identity unavailable",
  )
  const name = sdk.name
  const version = sdk.version
  const dependencies = { [name]: version }
  const installed = path.dirname(await realpath(manifest))
  assert.equal(await realpath(path.join(installed, "package.json")), await realpath(manifest), "Arsenal fixture SDK package resolution mismatch")
  await Promise.all(
    [configDirectory, path.join(directory, ".opencode")].map(async (root) => {
      await mkdir(root, { recursive: true })
      // Keep the modules root fixture-owned so background npm work cannot mutate
      // the workspace's node_modules through a root-directory symlink.
      const target = path.join(root, "node_modules", name)
      const modulesRoot = path.join(root, "node_modules")
      await mkdir(modulesRoot, { recursive: true })
      requireOwnedModules(await realpath(modulesRoot), owned, workspace)
      await mkdir(path.dirname(target), { recursive: true })
      requireOwnedModules(await realpath(path.dirname(target)), owned, workspace)
      await symlink(installed, target, process.platform === "win32" ? "junction" : "dir").catch(async (error: unknown) => {
        if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "EEXIST") throw error
        const resolved = await realpath(target).catch(() => undefined)
        if (resolved !== installed)
          throw new Error(`Arsenal fixture SDK installation mismatch: ${target} resolves ${resolved ?? "missing"}; expected ${installed}`)
      })
      await Bun.write(path.join(root, "package.json"), JSON.stringify({ private: true, type: "module", dependencies }))
      await Bun.write(
        path.join(root, "package-lock.json"),
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            "": { dependencies },
            "node_modules/@opencode-ai/plugin": { version, resolved: `file:${installed}`, link: true },
          },
        }),
      )
    }),
  )
}

function requireOwnedModules(directory: string, roots: string[], workspace: string) {
  if (roots.some((root) => contains(root, directory)) && !contains(workspace, directory)) return
  throw new Error(`Arsenal fixture SDK installation mismatch: modules parent outside fixture ownership: ${directory}`)
}

function contains(directory: string, target: string) {
  const relative = path.relative(directory, target)
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}
