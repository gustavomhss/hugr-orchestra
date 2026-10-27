import { Schema } from "effect"
import { lstat, readFile, realpath } from "node:fs/promises"
import { dirname, join, resolve, sep } from "node:path"
import { cli, sha256, target } from "./distribution-native"
import type { Built } from "./distribution-native"
import { requireCompilerProvenance } from "./distribution-provider-compiler-edge"

const Edge = Schema.Struct({ path: Schema.String, kind: Schema.String, original: Schema.optional(Schema.String), external: Schema.optional(Schema.Boolean) })
const CapturedFile = Schema.Struct({ path: Schema.String, sha256: Schema.String, gitBlob: Schema.String, bytes: Schema.Number })
const Metafile = Schema.Struct({
  inputs: Schema.Record(Schema.String, Schema.Struct({ bytes: Schema.Number, imports: Schema.Array(Edge), format: Schema.optional(Schema.String) })),
  outputs: Schema.Record(Schema.String, Schema.Struct({ bytes: Schema.Number, inputs: Schema.Record(Schema.String,
    Schema.Struct({ bytesInOutput: Schema.Number })), imports: Schema.Array(Edge), exports: Schema.Array(Schema.String), entryPoint: Schema.optional(Schema.String) })),
})
const Receipt = Schema.Struct({
  schema: Schema.Literal("orchestra-compile-evidence-v2"), bun: Schema.Literal("1.3.14"), cwd: Schema.String,
  version: Schema.String, target: Schema.String, entrypoints: Schema.Array(Schema.String),
  binary: Schema.Struct({ path: Schema.String, sha256: Schema.String }),
  inputs: Schema.Array(Schema.Struct({ ...CapturedFile.fields,
    key: Schema.String, analysisKey: Schema.String, capture: Schema.Literal("raw-resolved-file"),
    analysisBytes: Schema.Number, compilerBytes: Schema.Number,
    transform: Schema.Literals(["bun-native", "solid-runtime-replacement", "solid-jsx-babel"]),
    backing: Schema.optional(CapturedFile), packageFile: Schema.optional(CapturedFile),
    packageVersion: Schema.optional(Schema.String), loader: Schema.optional(Schema.Literal("js")),
  })),
  metafile: Metafile, analysisMetafile: Metafile,
  transformLedger: Schema.Struct({
    toolchain: Schema.Struct({ name: Schema.Literal("@opentui/solid"), version: Schema.Literal("0.4.5"),
      plugin: CapturedFile, transform: CapturedFile, packageFile: CapturedFile, lockfile: CapturedFile }),
    scope: Schema.String,
  }),
})

// Reviewed routing/composition bytes at dev df5d604aa9 (re-reviewed 2026-10-27: the
// ExecutionHost branch stays off without an agent engine, the bash sandbox still wraps
// first, and the title agent's call is skipped because the proof names its Session).
// Content hashes, not a syntax
// approximation, bind dispatch semantics. Any changed route needs lead review
// before its new source hash is admitted, even if all modules remain in a bundle.
const bindings = {
  "apps/cli/src/omni-entry.ts": "3a328f28a5db6102f0f0707fd3ef7327780d5d30",
  "apps/cli/src/index.ts": "65566f305c1e92cb1fdd2a50e942dbd1834551b6",
  "apps/cli/src/framework/runtime.ts": "02d1d778896d87fd360a75f10d749342c0698ea1",
  "apps/cli/src/framework/spec.ts": "c921de73756b0a6a005586d853b3f87760d3daa0",
  "apps/cli/src/commands/commands.ts": "f60680a73c12d9fe0bef1b4ef6f56bc6cf0dcfcd",
  "apps/cli/src/commands/handlers/api.ts": "992bf3688415a6c6cd0469955602344e376860d7",
  "apps/cli/src/commands/handlers/serve.ts": "f11a2c92019d75847eac7b87d0b762cf944e7c93",
  "apps/cli/src/commands/handlers/service/start.ts": "0d6fbaada9fca59087cb9ca2c9837549a0dda0bf",
  "apps/cli/src/commands/handlers/service/password.ts": "6bf49d50d049ba7a26d97069955f0ed551137464",
  "apps/cli/src/commands/handlers/service/stop.ts": "8da9b04cffd5b2e8e893aecab117ff5140950caf",
  "apps/cli/src/commands/handlers/service/status.ts": "d409970e8bcd1b998473ce083d9f1b618ec5de75",
  "apps/cli/src/services/daemon.ts": "c6b5124fd3b2ef67d387f96c0b04026e598fac3d",
  "packages/server/src/routes.ts": "75b0f9753e4c879767ef186f5003519e2b681025",
  "packages/server/src/handlers/session.ts": "1ce1cd359f5c9bbfc12122fad3d4439655a1e5bb",
  "packages/core/src/session.ts": "402a192a69bcad6a4b08c695657e24ff5e335f93",
  "packages/core/src/session/execution/local.ts": "e7b758462abfd388f937fb18b79f82f2733dffad",
  "packages/core/src/location-services.ts": "c754426dde31acad2dbbfd96459b32624cfdd2e4",
  "packages/core/src/session/runner/llm.ts": "aa5cfa24f2254771b55309da7cbe6fa7e60e7fe2",
  "packages/core/src/session/runner/model.ts": "329158b19246bdacf2ec1fe67409e8707e94a6c8",
  "packages/core/src/tool/bash.ts": "648692192b262905cc922deecaf9c1fa99a83f35",
}

// Bun 1.3.14 metafile imports retain original/erased records, not an authoritative
// resolved dependency graph. Complete source capture and emitted golden pins
// establish provenance; the installed public Session V2 proof establishes execution.
export async function requireV2CompilerProvenance(built: Built, evidence: string) {
  const root = await realpath(resolve(cli, "../.."))
  const results = []
  for (const payload of built.payloads) {
    const file = join(cli, "dist", `compile-evidence-${target}-${payload.version}.json`)
    const info = await lstat(file)
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error("PROVIDER_COMPILER_RECEIPT_NOT_REGULAR")
    const bytes = await readFile(file)
    await Bun.write(join(evidence, `compile-evidence-${payload.version}.json`), bytes)
    const receipt = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Receipt)))(bytes.toString("utf8"))
    const provenance = requireCompilerProvenance(receipt, {
      root, version: payload.version, target,
      manifestSHA256: payload.manifest.files.find((entry) => entry.path === "bin/orchestra")?.sha256,
      binarySHA256: sha256(await readFile(join(payload.payload, "bin/orchestra"))),
    }, bindings)
    const toolchain = receipt.transformLedger.toolchain
    if (toolchain.plugin.gitBlob !== "28c0b12271d07444f36b81cb36f1f332b76bbe4b" ||
        toolchain.transform.gitBlob !== "6987446ee22b4fc9e6544e913524b1f243dc36db") throw new Error("PROVIDER_SOLID_PLUGIN_SOURCE_UNAUDITED")
    for (const captured of [toolchain.plugin, toolchain.transform, toolchain.packageFile, toolchain.lockfile]) await requireCapturedFile(captured)
    const pluginPackage = await Bun.file(toolchain.packageFile.path).json()
    if (pluginPackage.name !== toolchain.name || pluginPackage.version !== toolchain.version) throw new Error("PROVIDER_SOLID_PLUGIN_VERSION_MISMATCH")
    for (const input of receipt.inputs) {
      await requireCapturedFile(input)
      const replacement = /[/\\]node_modules[/\\]solid-js[/\\]dist[/\\]server\.js$/.test(input.path) ? "solid.js"
        : /[/\\]node_modules[/\\]solid-js[/\\]store[/\\]dist[/\\]server\.js$/.test(input.path) ? "store.js" : undefined
      if (replacement) {
        if (input.transform !== "solid-runtime-replacement" || !input.backing || !input.packageFile || input.loader !== "js" ||
            input.backing.path !== join(dirname(input.path), replacement) ||
            input.packageFile.path !== resolve(dirname(input.path), replacement === "solid.js" ? "../package.json" : "../../package.json"))
          throw new Error(`PROVIDER_SOLID_REPLACEMENT_RELATIONSHIP_INVALID: ${input.key}`)
        await requireCapturedFile(input.backing)
        await requireCapturedFile(input.packageFile)
        if (input.compilerBytes !== input.backing.bytes) throw new Error(`PROVIDER_SOLID_BACKING_CONTENT_SIZE_MISMATCH: ${input.key}`)
        const runtimePackage = await Bun.file(input.packageFile.path).json()
        if (runtimePackage.name !== "solid-js" || runtimePackage.version !== input.packageVersion || !["1.9.10", "1.9.12"].includes(input.packageVersion ?? ""))
          throw new Error(`PROVIDER_SOLID_RUNTIME_VERSION_UNAUDITED: ${input.key}`)
        continue
      }
      if (input.backing || input.packageFile || input.packageVersion || input.loader || input.transform === "solid-runtime-replacement")
        throw new Error(`PROVIDER_SOLID_REPLACEMENT_UNCLASSIFIED: ${input.key}`)
      const jsx = /\.[cm]?[jt]sx$/.test(input.path) && !input.path.includes(`${sep}node_modules${sep}`)
      if (input.transform !== (jsx ? "solid-jsx-babel" : "bun-native")) throw new Error(`PROVIDER_COMPILER_TRANSFORM_UNCLASSIFIED: ${input.key}`)
    }
    await Bun.write(join(evidence, `compiler-provenance-${payload.version}.json`), JSON.stringify({
      version: payload.version, binarySHA256: receipt.binary.sha256, receiptSHA256: sha256(bytes), ...provenance,
      scope: "complete captured compiler inputs and exact emitted reviewed dispatchpins; no transitive graph/liveness inference",
    }, null, 2))
    results.push({ version: payload.version, binarySHA256: receipt.binary.sha256, receiptSHA256: sha256(bytes) })
  }
  if (results.length !== 2) throw new Error("PROVIDER_COMPILER_TWO_BUILD_RECEIPTS_REQUIRED")
  return results
}

async function requireCapturedFile(input: typeof CapturedFile.Type) {
  const source = await readFile(input.path)
  const blob = new Bun.CryptoHasher("sha1").update(`blob ${source.byteLength}\0`).update(source).digest("hex")
  if (await realpath(input.path) !== input.path || !(await lstat(input.path)).isFile() ||
      sha256(source) !== input.sha256 || blob !== input.gitBlob || source.byteLength !== input.bytes)
    throw new Error(`PROVIDER_COMPILER_SOURCE_SHA_MISMATCH: ${input.path}`)
}

export type CompilerReceipts = Awaited<ReturnType<typeof requireV2CompilerProvenance>>
