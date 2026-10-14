import { expect, test } from "bun:test"
import { join, resolve } from "node:path"
import { requireCompilerProvenance } from "../distribution-provider-compiler-edge"

const root = resolve(import.meta.dirname, "recorded-checkout")
const file = "packages/cli/src/omni-entry.ts"
const expected = { root, version: "1.18.27", target: "linux-x64-baseline", manifestSHA256: "binary-sha", binarySHA256: "binary-sha" }
const bindings = { [file]: "reviewed-blob" }
const fixture = () => ({
  cwd: join(root, "packages/cli"), version: expected.version, target: expected.target, entrypoints: ["./src/omni-entry.ts"],
  binary: { sha256: expected.binarySHA256 },
  inputs: [{ key: "src/omni-entry.ts", analysisKey: "src/omni-entry.ts", path: join(root, file), gitBlob: "reviewed-blob", analysisBytes: 10, compilerBytes: 10 }],
  metafile: { inputs: { "src/omni-entry.ts": { bytes: 10, imports: [{ path: "effect/Effect", kind: "import-statement" }] } },
    outputs: { "./entry.js": { entryPoint: "src/omni-entry.ts", inputs: { "src/omni-entry.ts": { bytesInOutput: 5 } } } } },
  analysisMetafile: { inputs: { "src/omni-entry.ts": { bytes: 10 } } },
})

test("provenance admits emitted reviewed bytes without interpreting import records", () => {
  expect(requireCompilerProvenance(fixture(), expected, bindings)).toEqual({
    capturedInputs: ["src/omni-entry.ts"], entrypoint: "src/omni-entry.ts",
    pins: [{ file, key: "src/omni-entry.ts", gitBlob: "reviewed-blob", emittedBytes: 5 }],
  })
})

test("provenance refuses missing capture, divergent analysis and empty golden pins", () => {
  expect(() => requireCompilerProvenance({ ...fixture(), inputs: [] }, expected, bindings)).toThrow("PROVIDER_COMPILER_INPUT_SET_INVALID")
  expect(() => requireCompilerProvenance({ ...fixture(), analysisMetafile: { inputs: {} } }, expected, bindings)).toThrow("PROVIDER_COMPILER_ANALYSIS_INPUT_SET_DIFFERENT")
  const receipt = fixture()
  receipt.inputs[0].analysisBytes = 11
  expect(() => requireCompilerProvenance(receipt, expected, bindings)).toThrow("PROVIDER_COMPILER_ANALYSIS_INPUT_SET_DIFFERENT")
  expect(() => requireCompilerProvenance(fixture(), expected, {})).toThrow("PROVIDER_DISPATCH_SOURCE_PINS_EMPTY")
})

test("duplicate capture keys and canonical paths are refused", () => {
  const receipt = fixture()
  receipt.inputs.push({ ...receipt.inputs[0] })
  expect(() => requireCompilerProvenance(receipt, expected, bindings)).toThrow("PROVIDER_COMPILER_INPUT_SET_INVALID")
  const key = "src/duplicate.ts"
  receipt.inputs[1] = { ...receipt.inputs[0], key, analysisKey: key }
  expect(() => requireCompilerProvenance({ ...receipt,
    metafile: { ...receipt.metafile, inputs: { ...receipt.metafile.inputs, [key]: receipt.metafile.inputs["src/omni-entry.ts"] } },
    analysisMetafile: { inputs: { ...receipt.analysisMetafile.inputs, [key]: { bytes: 10 } } },
  }, expected, bindings)).toThrow("PROVIDER_COMPILER_INPUT_PATH_AMBIGUOUS")
})

test("reviewed hashes and actual emission cannot be replaced by matching filenames", () => {
  expect(() => requireCompilerProvenance(fixture(), expected, { [file]: "wrong-blob" })).toThrow(`PROVIDER_DISPATCH_SOURCE_PIN_MISMATCH: ${file}`)
  const receipt = fixture()
  receipt.metafile.outputs["./entry.js"].inputs["src/omni-entry.ts"].bytesInOutput = 0
  expect(() => requireCompilerProvenance(receipt, expected, bindings)).toThrow(`PROVIDER_DISPATCH_SOURCE_NOT_EMITTED: ${file}`)
})

test("actual compiler entry and receipt/manifest/binary identity must all agree", () => {
  const receipt = fixture()
  receipt.metafile.outputs["./entry.js"].entryPoint = "src/other.ts"
  expect(() => requireCompilerProvenance(receipt, expected, bindings)).toThrow("PROVIDER_COMPILER_ACTUAL_ENTRYPOINT_MISSING")
  expect(() => requireCompilerProvenance({ ...fixture(), entrypoints: [] }, expected, bindings)).toThrow("PROVIDER_COMPILER_ENTRY_OR_VERSION_MISMATCH")
  expect(() => requireCompilerProvenance(fixture(), { ...expected, binarySHA256: "wrong-sha" }, bindings)).toThrow("PROVIDER_COMPILER_BINARY_SHA_MISMATCH")
  expect(() => requireCompilerProvenance(fixture(), { ...expected, manifestSHA256: "wrong-sha" }, bindings)).toThrow("PROVIDER_COMPILER_BINARY_SHA_MISMATCH")
})
