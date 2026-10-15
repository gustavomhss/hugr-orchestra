import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

test("CLI rejects invalid target before loading the version snapshot", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cli-preflight-"))
  try {
    await Promise.all(["build.ts", "targets.ts"].map(async (file) => {
      await Bun.write(path.join(directory, file), await Bun.file(path.resolve(import.meta.dir, "../../cli/script", file)).arrayBuffer())
    }))
    await mkdir(path.join(directory, "node_modules/@orchestra"), { recursive: true })
    await symlink(path.resolve(import.meta.dir, ".."), path.join(directory, "node_modules/@orchestra/script"), "junction")
    const result = await run([path.join(directory, "build.ts"), "--target=invalid-wave-target"],
      { ORCHESTRA_VERSION: "not-a-semver" }, directory)
    expect(result.status).toBe(1)
    expect(result.error).toContain("Invalid --target: invalid-wave-target. Expected one of:")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("Nix verifier rejects missing arguments before output or native activity", async () => {
  const verify = await run([path.resolve(import.meta.dir, "../../../nix/scripts/verify-distribution.ts")])
  expect(verify.status).toBe(1)
  expect(verify.error).toContain("NIX_DISTRIBUTION_FAILURE:MISSING_OUTPUT_ARGUMENT")
})

test("Nix probe rejects missing arguments before output or native activity", async () => {
  const probe = await run([path.resolve(import.meta.dir, "../../../nix/scripts/probe-distribution.ts")])
  expect(probe.status).toBe(1)
  expect(probe.error).toContain("NIX_DISTRIBUTION_FAILURE:MISSING_PROBE_ARGUMENTS")
})

test("packaged admission modules import without a source workspace", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "admission-import-"))
  try {
    await Promise.all(["tree-sitter-prebuilds.ts", "workspace-paths.ts", "module-catalog.ts", "module-resolver.ts"].map(async (file) => {
      await Bun.write(path.join(directory, file), await Bun.file(path.resolve(import.meta.dir, "../src", file)).arrayBuffer())
    }))
    const schema = path.join(directory, "node_modules/@orchestra/schema")
    await Bun.write(path.join(schema, "package.json"), JSON.stringify({ name: "@orchestra/schema", type: "module", exports: { "./elf": "./elf.ts" } }))
    await Bun.write(path.join(schema, "elf.ts"), await Bun.file(path.resolve(import.meta.dir, "../../schema/src/elf.ts")).arrayBuffer())
    await Bun.write(path.join(directory, "empty.node"), new Uint8Array())
    const result = await run(["-e", `import assert from "node:assert/strict";
      const module = await import(${JSON.stringify(pathToFileURL(path.join(directory, "tree-sitter-prebuilds.ts")).href)});
      assert.equal(typeof module.requireTreeSitterBundle, "function");
      assert.throws(() => module.inspectElf("./empty.node"), /ELF_TRUNCATED/);
      console.log("ADMISSION_IMPORT_OK")`], {}, directory)
    expect(result.status, result.error).toBe(0)
    expect(result.output.trim()).toBe("ADMISSION_IMPORT_OK")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

async function run(args: string[], env: Record<string, string> = {}, cwd?: string) {
  const child = Bun.spawn([process.execPath, "--no-install", ...args], {
    cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe",
  })
  const [output, error, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  return { status, output, error }
}
