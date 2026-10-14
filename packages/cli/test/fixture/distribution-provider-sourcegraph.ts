import { Schema } from "effect"
import ts from "typescript"
import { builtinModules } from "node:module"
import { lstat, readFile, realpath } from "node:fs/promises"
import { basename, extname, join, relative, resolve, sep } from "node:path"
import { cli, sha256, target } from "./distribution-native"
import type { Built } from "./distribution-native"

const Edge = Schema.Struct({ path: Schema.String, kind: Schema.String, original: Schema.optional(Schema.String), external: Schema.optional(Schema.Boolean) })
const Receipt = Schema.Struct({
  schema: Schema.Literal("orchestra-compile-evidence-v1"), bun: Schema.Literal("1.3.14"), cwd: Schema.String,
  version: Schema.String, target: Schema.String, entrypoints: Schema.Array(Schema.String),
  binary: Schema.Struct({ path: Schema.String, sha256: Schema.String }),
  inputs: Schema.Array(Schema.Struct({ key: Schema.String, path: Schema.String, sha256: Schema.String, gitBlob: Schema.String, bytes: Schema.Number })),
  metafile: Schema.Struct({
    inputs: Schema.Record(Schema.String, Schema.Struct({ bytes: Schema.Number, imports: Schema.Array(Edge), format: Schema.optional(Schema.String) })),
    outputs: Schema.Record(Schema.String, Schema.Struct({ bytes: Schema.Number, inputs: Schema.Record(Schema.String,
      Schema.Struct({ bytesInOutput: Schema.Number })), imports: Schema.Array(Edge), exports: Schema.Array(Schema.String), entryPoint: Schema.optional(Schema.String) })),
  }),
})

// Reviewed routing/composition bytes at 0001b09c39. Content hashes, not a syntax
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
  "packages/server/src/routes.ts": "6eee926608c8a2e25c43587dec09e4f274167ba8",
  "packages/server/src/handlers/session.ts": "5fc8bf39cf04a3cffea5f349b818de70971ebac2",
  "packages/core/src/session.ts": "ee09320406f19c18347c2904b4ed7cbc46d0b7a3",
  "packages/core/src/session/execution/local.ts": "d874c40832a3571297e78e912c2ae137fb7acc12",
  "packages/core/src/location-services.ts": "aa917b5a6092053b253890ec979c4f34bee9829b",
  "packages/core/src/session/runner/llm.ts": "c12fb0c16eba526d27f5552b07d3952b2d430f73",
  "packages/core/src/session/runner/model.ts": "fcc56b6d0368e1e6e0392466a00e13b14f3ba961",
  "packages/core/src/tool/bash.ts": "8618850dc6a0c215902f278f1338170d2b1d745a",
}
const dynamicLedger = {
  "packages/core/src/config/plugin/external.ts": {
    gitBlob: "a9141f532da7b11bc4c68574e6a0513af18ec6f3", expressions: ["entrypoint"],
    reason: "External plugin admission loader; isolated proof Location has plugins:[] and no plugin directories.",
  },
}
const unselectedDispatch = [
  "./commands/handlers/default", "./commands/handlers/debug/agents", "./commands/handlers/debug/symbols",
  "./commands/handlers/migrate", "./commands/handlers/service/restart",
]

// Bun's own --compile metafile decides dependency resolution. AST below ONLY
// inventories nonliteral import() sites against the closed reviewed ledger; it
// never resolves imports or claims coverage of arbitrary runtime library code.
export async function requireV2SourceGraph(built: Built, evidence: string) {
  const root = await realpath(resolve(cli, "../.."))
  const results = []
  for (const payload of built.payloads) {
    const file = join(cli, "dist", `compile-evidence-${target}-${payload.version}.json`)
    const info = await lstat(file)
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error("PROVIDER_COMPILER_RECEIPT_NOT_REGULAR")
    const bytes = await readFile(file)
    await Bun.write(join(evidence, `compile-evidence-${payload.version}.json`), bytes)
    const receipt = Schema.decodeUnknownSync(Schema.UnknownFromJsonString.pipe(Schema.decodeTo(Receipt)))(bytes.toString("utf8"))
    if (receipt.version !== payload.version || receipt.target !== target || receipt.entrypoints.join() !== "./src/omni-entry.ts")
      throw new Error("PROVIDER_COMPILER_ENTRY_OR_VERSION_MISMATCH")
    const binary = payload.manifest.files.find((entry) => entry.path === "bin/orchestra")
    if (!binary || binary.sha256 !== receipt.binary.sha256 || sha256(await readFile(join(payload.payload, "bin/orchestra"))) !== receipt.binary.sha256)
      throw new Error("PROVIDER_COMPILER_BINARY_SHA_MISMATCH")
    const inputs = new Map(receipt.inputs.map((input) => [input.key, input]))
    if (!inputs.size || inputs.size !== receipt.inputs.length || inputs.size !== Object.keys(receipt.metafile.inputs).length ||
        Object.keys(receipt.metafile.inputs).some((key) => !inputs.has(key))) throw new Error("PROVIDER_COMPILER_INPUT_SET_INVALID")
    for (const input of inputs.values()) {
      const source = await readFile(input.path)
      const blob = new Bun.CryptoHasher("sha1").update(`blob ${source.byteLength}\0`).update(source).digest("hex")
      if (await realpath(input.path) !== input.path || sha256(source) !== input.sha256 || blob !== input.gitBlob || source.byteLength !== input.bytes)
        throw new Error(`PROVIDER_COMPILER_SOURCE_SHA_MISMATCH: ${input.key}`)
    }
    const byPath = new Map(receipt.inputs.map((input) => [input.path, input.key]))
    for (const [file, blob] of Object.entries(bindings)) {
      const input = receipt.inputs.find((input) => input.path === join(root, file))
      if (!input || input.gitBlob !== blob) throw new Error(`PROVIDER_DISPATCH_SOURCE_PIN_MISMATCH: ${file}`)
      if (!Object.values(receipt.metafile.outputs).some((output) => (output.inputs[input.key]?.bytesInOutput ?? 0) > 0))
        throw new Error(`PROVIDER_DISPATCH_SOURCE_NOT_EMITTED: ${file}`)
    }
    if (!Object.values(receipt.metafile.outputs).some((output) => output.entryPoint &&
        byPath.get(resolve(receipt.cwd, output.entryPoint)) === byPath.get(join(root, "packages/cli/src/omni-entry.ts"))))
      throw new Error("PROVIDER_COMPILER_ACTUAL_ENTRYPOINT_MISSING")
    const selected = new Set<string>()
    const external: Array<{ from: string; edge: typeof Edge.Type; reason: string }> = []
    const dynamic: Array<{ path: string; expression: string; reason: string }> = []
    const assets: string[] = []
    const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`), "bun", "bun:ffi", "bun:sqlite", "bun:jsc", "bun:bundle"])
    const walk = (key: string) => {
      if (selected.has(key)) return
      const input = inputs.get(key)
      const meta = receipt.metafile.inputs[key]
      if (!input || !meta) throw new Error(`PROVIDER_COMPILER_EDGE_INPUT_MISSING: ${key}`)
      if (input.path.startsWith(join(root, "packages/orchestra/src") + sep)) throw new Error(`PROVIDER_SELECTED_PATH_LEGACY_EDGE: ${input.path}`)
      selected.add(key)
      for (const edge of meta.imports) {
        if (input.path === join(root, "packages/cli/src/index.ts") && edge.kind === "dynamic-import" &&
            edge.original && unselectedDispatch.includes(edge.original)) {
          external.push({ from: key, edge, reason: "Unselected lazy CLI branch in source-pinned real dispatch" })
          continue
        }
        const direct = inputs.has(edge.path) ? edge.path : byPath.get(resolve(receipt.cwd, edge.path))
        if (direct) { walk(direct); continue }
        // Bun 1.3.14 --compile splitting marks a resolved dynamic chunk external.
        // Use its compiler output entryPoint, never resolve the source specifier.
        const chunks = Object.entries(receipt.metafile.outputs).filter(([name, output]) =>
          output.entryPoint && basename(name) === basename(edge.path))
        if (edge.kind === "dynamic-import" && chunks.length === 1) {
          const entry = chunks[0][1].entryPoint
          const destination = entry && (inputs.has(entry) ? entry : byPath.get(resolve(receipt.cwd, entry)))
          if (!destination) throw new Error(`PROVIDER_COMPILER_CHUNK_ENTRY_MISSING: ${edge.path}`)
          walk(destination)
          continue
        }
        if (edge.external && builtins.has(edge.path)) { external.push({ from: key, edge, reason: "Bun/Node builtin module" }); continue }
        if (edge.external && edge.path === "node-gyp") { external.push({ from: key, edge, reason: "Explicit build external; proof loads installed addon, never builds addons" }); continue }
        throw new Error(`PROVIDER_COMPILER_EDGE_UNCLASSIFIED: ${key} -> ${edge.kind}:${edge.path}`)
      }
    }
    // Frozen actual index/runtime pins bind these roots to real public dispatch.
    // Unused TUI branch may legitimately contain legacy code in the full bundle.
    for (const path of ["packages/cli/src/omni-entry.ts", "packages/cli/src/index.ts",
      "packages/cli/src/commands/handlers/api.ts", "packages/cli/src/commands/handlers/serve.ts",
      "packages/cli/src/commands/handlers/service/start.ts", "packages/cli/src/commands/handlers/service/password.ts",
      "packages/cli/src/commands/handlers/service/stop.ts", "packages/cli/src/commands/handlers/service/status.ts"]) {
      const key = byPath.get(join(root, path))
      if (!key) throw new Error(`PROVIDER_COMPILER_SELECTED_ROOT_MISSING: ${path}`)
      walk(key)
    }
    for (const key of selected) {
      const input = inputs.get(key)
      if (!input || !input.path.startsWith(root + sep) || input.path.includes(`${sep}node_modules${sep}`)) continue
      const format = receipt.metafile.inputs[key].format
      if (format === "json" || format === "css" || format === undefined &&
          [".node", ".wasm", ".so", ".dll", ".dylib", ".txt", ".md", ".svg", ".png", ".ttf"].includes(extname(input.path))) {
        assets.push(key)
        continue
      }
      if (format !== "esm" && format !== "cjs") throw new Error(`PROVIDER_COMPILER_FORMAT_UNCLASSIFIED: ${key}:${format}`)
      const source = ts.createSourceFile(input.path, await Bun.file(input.path).text(), ts.ScriptTarget.Latest, true)
      const expressions: string[] = []
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const argument = node.arguments[0]
          if (!argument || !(ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) expressions.push(argument?.getText(source) ?? "<missing>")
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
      if (!expressions.length) continue
      const path = relative(root, input.path)
      const ledger = Object.entries(dynamicLedger).find(([name]) => name === path)?.[1]
      if (!ledger || ledger.gitBlob !== input.gitBlob || expressions.join() !== ledger.expressions.join())
        throw new Error(`PROVIDER_DYNAMIC_IMPORT_UNCLASSIFIED: ${path}: ${expressions.join()}`)
      dynamic.push(...expressions.map((expression) => ({ path, expression, reason: ledger.reason })))
    }
    await Bun.write(join(evidence, `compiler-selected-path-${payload.version}.json`), JSON.stringify({
      version: payload.version, binarySHA256: receipt.binary.sha256, receiptSHA256: sha256(bytes), selected: [...selected], external, dynamic, assets,
      bindings, unselectedDispatch, scope: "Compiler entry/api/service/serve closure with declared lazy-branch exclusions; live public Session V2 proof required",
    }, null, 2))
    results.push({ version: payload.version, binarySHA256: receipt.binary.sha256, receiptSHA256: sha256(bytes) })
  }
  if (results.length !== 2) throw new Error("PROVIDER_COMPILER_TWO_BUILD_RECEIPTS_REQUIRED")
  return results
}

export type CompilerReceipts = Awaited<ReturnType<typeof requireV2SourceGraph>>
