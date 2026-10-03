import path from "node:path"
import { mkdir, realpath, symlink } from "node:fs/promises"
import assert from "node:assert/strict"

/** Factory conformance uses the installed SDK, not an unrelated network package installation. */
export async function prepareArsenalSDK(directory: string, configDirectory: string) {
  const modules = await realpath(path.resolve(import.meta.dir, "../../node_modules"))
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
  const installed = await realpath(path.join(modules, name))
  assert.equal(await realpath(path.join(installed, "package.json")), await realpath(manifest), "Arsenal fixture SDK package resolution mismatch")
  await Promise.all(
    [configDirectory, path.join(directory, ".opencode")].map(async (root) => {
      await mkdir(root, { recursive: true })
      const target = path.join(root, "node_modules")
      await symlink(modules, target, "dir").catch(async (error: unknown) => {
        if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "EEXIST") throw error
        // Another fixture may link the workspace root instead of package-local
        // modules. Accept that only when it resolves this exact installed SDK.
        if (await realpath(path.join(target, name)).catch(() => undefined) !== installed)
          throw new Error("Arsenal fixture SDK installation mismatch")
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
