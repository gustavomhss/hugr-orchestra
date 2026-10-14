import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { expect, test } from "bun:test"
import { ResourcePaths } from "../../desktop/scripts/resource-paths.ts"

test("resolves resources from a relocated module registry", async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "resource-paths-")))
  try {
    const modules = [
      ["app", "@orchestra/app", "apps/ui"],
      ["cli", "@orchestra/cli", "tools/command"],
      ["desktop", "@orchestra/desktop", "apps/shell"],
      ["orchestra", "orchestra", "services/api"],
    ] as const
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "workspace" }))
    await mkdir(path.join(root, "script"), { recursive: true })
    await writeFile(path.join(root, "script/module-registry.json"), JSON.stringify({
      format: 1,
      modules: modules.map(([alias, name, modulePath]) => ({ alias, kind: "bun", scope: ".", name, path: modulePath })),
    }))
    await writeFile(path.join(root, "script/toolchain-registry.json"), JSON.stringify({
      format: 1,
      roots: { omni: { path: "native/omni", manifest: "Cargo.toml" }, atlas: { path: "foundation/atlas", manifest: "package.json" } },
    }))
    await Promise.all(modules.map(async ([, name, modulePath]) => {
      const directory = path.join(root, modulePath)
      await mkdir(directory, { recursive: true })
      await writeFile(path.join(directory, "package.json"), JSON.stringify({ name }))
    }))
    await mkdir(path.join(root, "apps/shell/scripts"))
    await mkdir(path.join(root, "native/omni"), { recursive: true })
    await writeFile(path.join(root, "native/omni/Cargo.toml"), "[workspace]\n")
    await mkdir(path.join(root, "foundation/atlas"), { recursive: true })
    await writeFile(path.join(root, "foundation/atlas/package.json"), JSON.stringify({ name: "atlas" }))

    expect(ResourcePaths.make(path.join(root, "apps/shell/scripts"))).toEqual({
      root,
      desktop: path.join(root, "apps/shell"),
      cli: path.join(root, "tools/command"),
      orchestra: path.join(root, "services/api"),
      app: path.join(root, "apps/ui"),
      omni: path.join(root, "native/omni"),
      serverDist: path.join(root, "services/api/dist/node"),
      cliDist: path.join(root, "tools/command/dist"),
      cliResources: path.join(root, "apps/shell/resources/cli"),
      signWindows: path.join(root, "script/sign-windows.ps1"),
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
