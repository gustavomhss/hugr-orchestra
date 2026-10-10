import { expect, test } from "bun:test"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { createRequire } from "node:module"
import ts from "typescript"
import baseBuilder from "./electron-builder.config"
import builder from "./electron-builder.candidate.config"
import baseVite from "./electron.vite.config"
import vite from "./electron.vite.candidate.config"
import { assertCandidateHost, assertMachOX64, inventory, verifyMaterials } from "./scripts/lean-candidate"
import { leanNotices, leanPin } from "../orchestra/script/lean-notices"

test("candidate identity disables production protocols, feeds and signing", () => {
  expect(builder.appId).toBe("ai.hugr.orchestra.lean.candidate")
  expect(builder.productName).toBe("HuGR Lean Candidate")
  expect(builder.extraMetadata.name).toBe("hugr-orchestra-lean-candidate")
  expect(builder.extraMetadata.name).not.toBe(baseBuilder.extraMetadata?.name)
  expect(builder.extraMetadata.desktopName).toBe(`${builder.appId}.desktop`)
  expect(builder.directories.output).toBe("dist-candidate")
  expect(builder.protocols).toEqual([])
  expect(builder.publish).toBeNull()
  expect(builder.forceCodeSigning).toBe(false)
  expect(builder.mac.identity).toBeNull()
  expect(builder.mac.notarize).toBe(false)
  expect(builder.mac.hardenedRuntime).toBe(false)
  expect(builder.dmg.sign).toBe(false)
  expect(baseBuilder.protocols).not.toEqual([])
  expect(baseBuilder.mac?.notarize).toBe(true)
})

test("candidate preserves production package filters and app resources, appends notices and external PTY", () => {
  expect(builder.files).toEqual(baseBuilder.files)
  const resources = baseBuilder.extraResources ?? []
  expect(builder.extraResources).toEqual([
    ...(Array.isArray(resources) ? resources : [resources]),
    { from: "../orchestra/dist/node/licenses", to: "licenses" },
  ])
  expect(builder.extraResources).toContainEqual({ from: "native/", to: "native/", filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"] })
  expect(builder.asarUnpack).toContain("node_modules/@lydell/node-pty-darwin-x64/**/*")
  expect(builder.mac.icon).toBe(baseBuilder.mac?.icon)
})

test("candidate defines compiled isolation only; preserves real main/sidecar/preload/renderer graph", () => {
  expect(vite.main?.define?.["import.meta.env.ORCHESTRA_LEAN_CANDIDATE"]).toBe('"1"')
  expect(baseVite.main?.define?.["import.meta.env.ORCHESTRA_LEAN_CANDIDATE"]).toBeUndefined()
  expect(vite.main?.define?.["import.meta.env.ORCHESTRA_CHANNEL"]).toBe(baseVite.main?.define?.["import.meta.env.ORCHESTRA_CHANNEL"])
  expect(vite.main?.build).toBe(baseVite.main?.build)
  expect(vite.main?.plugins).toBe(baseVite.main?.plugins)
  expect(vite.preload).toBe(baseVite.preload)
  expect(vite.renderer).toBe(baseVite.renderer)
  expect(vite.main?.build?.rollupOptions?.input).toEqual({ index: "src/main/index.ts", sidecar: "src/main/sidecar.ts" })
})

for (const channel of ["dev", "beta", "prod"]) {
  test(`fresh ${channel} config graph retains base resources and channel with candidate identity`, async () => {
    const child = Bun.spawn(["bun", "--eval", `
      import base from "./electron-builder.config.ts"
      import builder from "./electron-builder.candidate.config.ts"
      import normal from "./electron.vite.config.ts"
      import vite from "./electron.vite.candidate.config.ts"
      console.log(JSON.stringify({
        baseResources: base.extraResources, resources: builder.extraResources,
        appId: builder.appId, channel: vite.main.define["import.meta.env.ORCHESTRA_CHANNEL"],
        candidate: vite.main.define["import.meta.env.ORCHESTRA_LEAN_CANDIDATE"],
        normal: normal.main.define["import.meta.env.ORCHESTRA_LEAN_CANDIDATE"] ?? null,
      }))
    `], {
      cwd: import.meta.dirname,
      env: { ...process.env, ORCHESTRA_CHANNEL: channel, ORCHESTRA_LEAN_CANDIDATE: "1" },
      stdout: "pipe", stderr: "inherit",
    })
    const graph = await new Response(child.stdout).json()
    expect(await child.exited).toBe(0)
    expect(graph.appId).toBe("ai.hugr.orchestra.lean.candidate")
    expect(graph.channel).toBe(JSON.stringify(channel))
    expect(graph.candidate).toBe('"1"')
    expect(graph.normal).toBeNull()
    expect(graph.resources).toEqual([...graph.baseResources, { from: "../orchestra/dist/node/licenses", to: "licenses" }])
    expect(graph.baseResources.some((item: { filter?: string[] }) => item.filter?.includes("orchestra-cli*"))).toBe(channel === "dev")
  })
}

test("host guard rejects cross-platform and cross-arch packaging; Mach-O guard sees wrong ABI", () => {
  expect(() => assertCandidateHost("linux", "x64", "true")).toThrow("requires native darwin/x64")
  expect(() => assertCandidateHost("darwin", "arm64", "true")).toThrow("requires native darwin/x64")
  expect(() => assertCandidateHost("darwin", "x64", "false")).toThrow("requires GitHub Actions CI")
  const previous = process.env.GITHUB_ACTIONS
  process.env.GITHUB_ACTIONS = "true"
  try {
    expect(() => assertCandidateHost("darwin", "x64", "true")).not.toThrow()
  } finally {
    if (previous === undefined) delete process.env.GITHUB_ACTIONS
    if (previous !== undefined) process.env.GITHUB_ACTIONS = previous
  }
  const binary = Buffer.alloc(8)
  binary.writeUInt32LE(0xfeedfacf, 0)
  binary.writeUInt32LE(0x01000007, 4)
  expect(() => assertMachOX64(binary, "pty.node")).not.toThrow()
  binary.writeUInt32LE(0x0100000c, 4)
  expect(() => assertMachOX64(binary, "pty.node")).toThrow("Expected x64 Mach-O: pty.node")
  expect(() => assertMachOX64(Buffer.alloc(0), "empty.node")).toThrow("empty.node")
})

test("installed build tool metadata and real ASAR library resolve through builder dependencies", async () => {
  for (const name of ["electron", "electron-builder", "electron-vite"]) {
    const metadata = await Bun.file(Bun.resolveSync(`${name}/package.json`, import.meta.dirname)).json()
    expect(metadata.name).toBe(name)
    expect(metadata.version).toMatch(/^\d+\./)
  }
  const builderRequire = createRequire(Bun.resolveSync("electron-builder/package.json", import.meta.dirname))
  const require = createRequire(builderRequire.resolve("app-builder-lib/package.json"))
  expect(typeof require("@electron/asar").extractFile).toBe("function")
})

test("real pinned notice archive passes; missing, changed, extra and stale materials fail by name", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "lean-candidate-notices-"))
  try {
    await leanNotices(directory)
    const licenses = path.join(directory, "licenses")
    const verified = await verifyMaterials(licenses)
    expect(verified.commit).toBe(leanPin.commit)
    expect(verified.materials).toHaveLength(49)
    const target = path.join(licenses, "hugr-lean/LICENSE")
    const original = new Uint8Array(await Bun.file(target).arrayBuffer())
    await Bun.write(target, "mutated license")
    await expect(verifyMaterials(licenses)).rejects.toThrow("Lean material hash mismatch: LICENSE")
    await rm(target)
    await expect(verifyMaterials(licenses)).rejects.toThrow("Missing Lean material: LICENSE")
    await Bun.write(target, original)
    const extra = path.join(licenses, "hugr-lean/extra.txt")
    await Bun.write(extra, "extra")
    await expect(verifyMaterials(licenses)).rejects.toThrow("Lean material directory inventory mismatch")
    await rm(extra)
    const manifest = path.join(licenses, "hugr-lean/manifest.json")
    const metadata = await Bun.file(manifest).json()
    await Bun.write(manifest, JSON.stringify({ ...metadata, commit: "stale" }))
    await expect(verifyMaterials(licenses)).rejects.toThrow("Lean notice pin mismatch: commit")
    await Bun.write(manifest, JSON.stringify(metadata))
    expect(await verifyMaterials(licenses)).toEqual(verified)
    expect(await inventory(path.join(licenses, "hugr-lean"))).toHaveLength(50)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("candidate configuration and CLI compile with real dependency types", () => {
  const options: ts.CompilerOptions = {
    noEmit: true, strict: true, skipLibCheck: true, allowJs: true, esModuleInterop: true,
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: ["bun", "node"],
  }
  const files = ["electron-builder.candidate.config.ts", "electron.vite.candidate.config.ts", "scripts/lean-candidate.ts", "electron-builder.candidate.config.test.ts", "electron-builder.candidate.runner.test.ts"]
  const program = ts.createProgram(files.map((file) => path.join(import.meta.dirname, file)), options)
  const errors = ts.getPreEmitDiagnostics(program)
  expect(ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: (file) => file, getCurrentDirectory: () => import.meta.dirname, getNewLine: () => "\n" })).toBe("")
}, 120_000)

test("full desktop package typecheck on CI", async () => {
  const child = Bun.spawn(["bun", "typecheck"], { cwd: import.meta.dirname, stdout: "inherit", stderr: "inherit" })
  expect(await child.exited).toBe(0)
}, 120_000)
