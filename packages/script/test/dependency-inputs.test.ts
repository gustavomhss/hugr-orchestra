import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

test("dependency fingerprint includes relocated modules and both native/domain roots", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "dependency-inputs-"))
  try {
    const files = {
      "script/module-registry.json": JSON.stringify({ format: 1, modules: [{ path: "moved/script" }] }),
      "script/toolchain-registry.json": JSON.stringify({ format: 1, roots: {
        omni: { path: "native/engine", manifest: "Cargo.toml" },
        atlas: { path: "domains/knowledge", manifest: "package.json" },
      } }),
      "moved/script/package.json": '{"name":"@orchestra/script"}',
      "native/engine/Cargo.toml": "[workspace]\n",
      "domains/knowledge/package.json": '{"name":"atlas"}',
      "domains/knowledge/source.ts": "export const value = 1\n",
      "packages/retained/package.json": "{}",
      "bun.lock": "fixture lock",
      "nix/node_modules.nix": "fixture expression",
    }
    await Promise.all(Object.entries(files).map(async ([file, content]) => {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true })
      await Bun.write(path.join(root, file), content)
    }))
    await run(root, ["git", "init", "-q"])
    await run(root, ["git", "add", ...Object.keys(files)])
    await run(root, ["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"])
    const code = `import json,runpy; print(json.dumps(runpy.run_path(${JSON.stringify(path.resolve(import.meta.dir, "../../../nix/scripts/dependency_measurement.py"))})["fingerprint"]("HEAD")))`
    const before = JSON.parse(await run(root, ["python3", "-c", code]))
    expect(Object.keys(before).sort()).toEqual(Object.keys(files).sort())
    await Bun.write(path.join(root, "domains/knowledge/source.ts"), "export const value = 2\n")
    await run(root, ["git", "add", "domains/knowledge/source.ts"])
    await run(root, ["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "domain changed"])
    const after = JSON.parse(await run(root, ["python3", "-c", code]))
    expect(after["domains/knowledge/source.ts"]).not.toBe(before["domains/knowledge/source.ts"])
    await run(root, ["git", "rm", "native/engine/Cargo.toml"])
    await run(root, ["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "missing domain"])
    await expect(run(root, ["python3", "-c", code])).rejects.toThrow("DEPENDENCY_TOOLCHAIN_MISSING:native/engine")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

for (const variant of ["literal-names", "module-symlink", "domain-symlink"] as const) {
  test(`dependency fingerprint validates ${variant} immutable manifests`, async () => {
    const root = await mkdtemp(path.join(tmpdir(), "dependency-manifests-"))
    const module = 'moved/café"script'
    const native = "native/éengine"
    try {
      const files = {
        "script/module-registry.json": JSON.stringify({ format: 1, modules: [{ path: module }] }),
        "script/toolchain-registry.json": JSON.stringify({ format: 1, roots: {
          omni: { path: native, manifest: "Cargo.toml" }, atlas: { path: "domains/atlas", manifest: "package.json" },
        } }),
        [`${module}/package.json`]: '{"name":"@orchestra/script"}',
        [`${native}/Cargo.toml`]: "[workspace]\n",
        "domains/atlas/package.json": '{"name":"atlas"}',
        "domains/atlas/control\rname.ts": "CR input",
        "domains/atlas/control\nname.ts": "LF input",
        "bun.lock": "fixture",
        "nix/node_modules.nix": "fixture",
      }
      await run(root, ["git", "init", "-q"])
      for (const [index, [file, content]] of Object.entries(files).entries()) {
        await Bun.write(path.join(root, `payload-${index}`), content)
        const blob = await run(root, ["git", "hash-object", "-w", `payload-${index}`])
        // Immutable index entries only: Git for Windows otherwise rejects names
        // which are valid in a source tree but cannot be checked out on NTFS.
        await run(root, ["git", "-c", "core.protectNTFS=false", "update-index", "--add", "--cacheinfo", "100644", blob, file])
      }
      const manifest = variant === "module-symlink" ? `${module}/package.json` : `${native}/Cargo.toml`
      if (variant !== "literal-names") {
        await Bun.write(path.join(root, "link-target"), "../../missing-manifest")
        const blob = await run(root, ["git", "hash-object", "-w", "link-target"])
        await run(root, ["git", "-c", "core.protectNTFS=false", "update-index", "--cacheinfo", "120000", blob, manifest])
      }
      await run(root, ["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "fixture"])
      const code = `import json,runpy; print(json.dumps(runpy.run_path(${JSON.stringify(path.resolve(import.meta.dir, "../../../nix/scripts/dependency_measurement.py"))})["fingerprint"]("HEAD")))`
      if (variant === "literal-names") {
        expect(Object.keys(JSON.parse(await run(root, ["python3", "-c", code]))).sort()).toEqual(Object.keys(files).sort())
        return
      }
      await expect(run(root, ["python3", "-c", code])).rejects.toThrow(`DEPENDENCY_MANIFEST_NOT_REGULAR:${manifest}`)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
}

async function run(cwd: string, cmd: string[]) {
  const child = Bun.spawn(cmd, { cwd, stdout: "pipe", stderr: "pipe" })
  const [output, error, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  if (status !== 0) throw new Error(error)
  return output.trim()
}
