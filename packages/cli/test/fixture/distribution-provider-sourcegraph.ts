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

// Reviewed routing/composition bytes at 0001b09c39 plus dev e6c39ff72d's
// SessionSubagentModels handlers/layer. Existing V2 execution edges are unchanged.
// Content hashes, not a syntax
// approximation, bind dispatch semantics. Any changed route needs lead review
// before its new source hash is admitted, even if all modules remain in a bundle.
const bindings = {
  "packages/cli/src/omni-entry.ts": "7bc97e5bd9ac4b37a4bf932301fa58c78badb72e",
  "packages/cli/src/index.ts": "2331af83e5790cb11428570aa896632ff042eb01",
  "packages/cli/src/framework/runtime.ts": "97247e4d6b813dcf33be4a38c85601da61b70a1a",
  "packages/cli/src/framework/spec.ts": "3bb47e5e5edc99fc6422f62f3ad41febb209a3a9",
  "packages/cli/src/commands/commands.ts": "c0e405368c00411378aa8fcab63fb607b8d14e3e",
  "packages/cli/src/commands/handlers/api.ts": "cf00394cb902b88db9016a6c3b9392a1dc4342e2",
  "packages/cli/src/commands/handlers/serve.ts": "8acf73620edbfcdbce680e4d82ed075988a9b585",
  "packages/cli/src/commands/handlers/service/start.ts": "0d6fbaada9fca59087cb9ca2c9837549a0dda0bf",
  "packages/cli/src/commands/handlers/service/password.ts": "6bf49d50d049ba7a26d97069955f0ed551137464",
  "packages/cli/src/commands/handlers/service/stop.ts": "8da9b04cffd5b2e8e893aecab117ff5140950caf",
  "packages/cli/src/commands/handlers/service/status.ts": "d409970e8bcd1b998473ce083d9f1b618ec5de75",
  "packages/cli/src/services/daemon.ts": "c7374a8960ca825418676f7a86b792a3ce2b723b",
  "packages/server/src/routes.ts": "5b37e6caeae0cbd1ef00f4549e7b42d90c78945c",
  "packages/server/src/handlers/session.ts": "7b4886f3c2980d54b845c0b91ee213028caf6705",
  "packages/core/src/session.ts": "ee09320406f19c18347c2904b4ed7cbc46d0b7a3",
  "packages/core/src/session/execution/local.ts": "d874c40832a3571297e78e912c2ae137fb7acc12",
  "packages/core/src/location-services.ts": "aa917b5a6092053b253890ec979c4f34bee9829b",
  "packages/core/src/session/runner/llm.ts": "c12fb0c16eba526d27f5552b07d3952b2d430f73",
  "packages/core/src/session/runner/model.ts": "6292fbc5d89963c7f6d7ba47ccbe8850bf31a3c3",
  "packages/core/src/tool/bash.ts": "8618850dc6a0c215902f278f1338170d2b1d745a",
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
