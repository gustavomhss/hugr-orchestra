import { expect, test } from "bun:test"
import path from "node:path"
import { tmpdir } from "../fixture/tmpdir"
import { planted, sdk } from "../fixture/sdk-registry"
import { PluginSdkRuntime } from "../../src/plugin/sdk-runtime"

for (const runtime of ["bun", "node", "compiled"] as const) {
  test(`SDK authority ${runtime}: foreign footprint is rejected before public or unknown imports`, async () => {
    await using tmp = await tmpdir()
    const directory = path.join(tmp.path, "node_modules", sdk.name)
    await Bun.write(path.join(directory, "package.json"), JSON.stringify({ name: sdk.name, type: "module", exports: { ".": "./index.js", "./*": "./index.js" } }))
    await Bun.write(path.join(directory, "index.js"), planted)
    const entry = path.join(tmp.path, "plugin.js")
    await Bun.write(entry, "export const load = (specifier) => import(specifier)\n")
    const source = path.join(import.meta.dir, "sdk-authority-entry.ts")
    const publicSpecifiers = Object.keys(sdk.exports).map((key) => key === "." ? sdk.name : sdk.name + key.slice(1))
    const unknown = [`${sdk.name}/unknown`, `${sdk.name}/src/tool.ts`, `${sdk.name}/v2/effect/deep`]
    const binary = path.join(tmp.path, process.platform === "win32" ? "authority.exe" : "authority")
    if (runtime !== "bun") {
      // A fresh compiler process keeps prior in-process Bun.build module state out of file reads; a second
      // in-process build in one test process read other files' bytes ("Unexpected reading file", parse errors).
      const args = runtime === "node"
        ? ["--target", "node", "--format", "esm", "--outdir", path.join(tmp.path, "dist")]
        : ["--compile", "--outfile", binary]
      const compile = Bun.spawn([process.execPath, "build", source, ...args], { stdout: "pipe", stderr: "pipe" })
      const [stderr, code] = await Promise.all([new Response(compile.stderr).text(), compile.exited])
      expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
    }
    const command = runtime === "bun" ? [process.execPath, source] : runtime === "compiled" ? [binary] : [Bun.which("node") ?? "node", path.join(tmp.path, "dist", "sdk-authority-entry.js")]
    const run = async (control: boolean) => {
      const child = Bun.spawn([...command, entry, ...publicSpecifiers, ...unknown], {
        cwd: tmp.path, env: { ...process.env, SKIP_SDK_RUNTIME: control ? "1" : "0" }, stdout: "pipe", stderr: "pipe",
      })
      const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
      expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
      return JSON.parse(stdout) as { specifier: string; bundled?: boolean; require?: boolean; error?: string }[]
    }
    const control = await run(true)
    // Bun 1.3 compiled binaries resolve only an on-disk package's root, never its subpath exports (explicit or
    // pattern), so there the control must prove the planted root and may find subpaths unreachable.
    const reachable = runtime !== "compiled" ? control : control.filter((row) => row.specifier === sdk.name || !row.error?.includes("Cannot find module"))
    expect(reachable.map((row) => row.specifier)).toContain(sdk.name)
    reachable.forEach((row) => expect(row.error).toContain("planted SDK copy ran"))
    const result = await run(false)
    result.forEach((row) => {
      expect(row.error).toContain("PluginSdkSetupError")
      expect(row.error).not.toContain("planted SDK copy ran")
    })
    expect(Object.keys(PluginSdkRuntime.modules)).toEqual(publicSpecifiers)
  }, 120_000)
}
