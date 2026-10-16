import { join, resolve } from "node:path"

// Pure receipt relationships only. Raw files/toolchain and installed binary bytes
// are admitted by the caller; import records never decide resolution or liveness.
export function requireCompilerProvenance(receipt: {
  cwd: string; version: string; target: string; entrypoints: readonly string[]; binary: { sha256: string }
  inputs: readonly { key: string; analysisKey: string; path: string; gitBlob: string; analysisBytes: number; compilerBytes: number }[]
  metafile: {
    inputs: Readonly<Record<string, { bytes: number }>>
    outputs: Readonly<Record<string, { entryPoint?: string; inputs: Readonly<Record<string, { bytesInOutput: number }>> }>>
  }
  analysisMetafile: { inputs: Readonly<Record<string, { bytes: number }>> }
}, expected: { root: string; version: string; target: string; manifestSHA256?: string; binarySHA256: string }, bindings: Readonly<Record<string, string>>) {
  if (receipt.version !== expected.version || receipt.target !== expected.target || receipt.entrypoints.length !== 1 || receipt.entrypoints[0] !== "./src/omni-entry.ts")
    throw new Error("PROVIDER_COMPILER_ENTRY_OR_VERSION_MISMATCH")
  if (!expected.manifestSHA256 || receipt.binary.sha256 !== expected.manifestSHA256 || expected.binarySHA256 !== receipt.binary.sha256)
    throw new Error("PROVIDER_COMPILER_BINARY_SHA_MISMATCH")
  const inputs = new Map(receipt.inputs.map((input) => [input.key, input]))
  if (!inputs.size || inputs.size !== receipt.inputs.length || inputs.size !== Object.keys(receipt.metafile.inputs).length ||
      Object.keys(receipt.metafile.inputs).some((key) => !inputs.has(key))) throw new Error("PROVIDER_COMPILER_INPUT_SET_INVALID")
  if (inputs.size !== Object.keys(receipt.analysisMetafile.inputs).length || new Set(receipt.inputs.map((input) => input.analysisKey)).size !== inputs.size ||
      receipt.inputs.some((input) => !receipt.analysisMetafile.inputs[input.analysisKey] ||
        receipt.analysisMetafile.inputs[input.analysisKey].bytes !== input.analysisBytes || receipt.metafile.inputs[input.key].bytes !== input.compilerBytes ||
        input.analysisBytes !== input.compilerBytes)) throw new Error("PROVIDER_COMPILER_ANALYSIS_INPUT_SET_DIFFERENT")
  const byPath = new Map(receipt.inputs.map((input) => [input.path, input]))
  if (byPath.size !== inputs.size) throw new Error("PROVIDER_COMPILER_INPUT_PATH_AMBIGUOUS")
  const outputs = Object.values(receipt.metafile.outputs)
  const pins = Object.entries(bindings).map(([file, blob]) => {
    const input = byPath.get(join(expected.root, file))
    if (!input || input.gitBlob !== blob) throw new Error(`PROVIDER_DISPATCH_SOURCE_PIN_MISMATCH: ${file}`)
    const emittedBytes = Math.max(0, ...outputs.map((output) => output.inputs[input.key]?.bytesInOutput ?? 0))
    if (!(emittedBytes > 0)) throw new Error(`PROVIDER_DISPATCH_SOURCE_NOT_EMITTED: ${file}`)
    return { file, key: input.key, gitBlob: blob, emittedBytes }
  })
  if (!pins.length) throw new Error("PROVIDER_DISPATCH_SOURCE_PINS_EMPTY")
  const entry = byPath.get(join(expected.root, "packages/cli/src/omni-entry.ts"))
  if (!entry || !outputs.some((output) => output.entryPoint && byPath.get(resolve(receipt.cwd, output.entryPoint)) === entry))
    throw new Error("PROVIDER_COMPILER_ACTUAL_ENTRYPOINT_MISSING")
  return { capturedInputs: [...inputs.keys()], pins, entrypoint: entry.key }
}
