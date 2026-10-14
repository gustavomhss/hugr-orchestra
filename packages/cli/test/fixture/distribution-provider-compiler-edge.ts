import { dirname, isAbsolute, resolve, sep } from "node:path"

// Bun 1.3.14 injects this internal helper for dynamic CommonJS require(). It is
// absent from captured file inputs and is NOT an external runtime module.
// https://github.com/oven-sh/bun/blob/bun-v1.3.14/src/bundler/bundle_v2.zig#L2971-L2976
export function compilerRuntimeEdge(edge: { path: string; kind: string; original?: string; external?: boolean }) {
  return edge.path === "bun:wrap" && edge.kind === "import-statement" && edge.original === undefined && edge.external !== true
}

// Compiler-record bookkeeping only: no basename search, extension guessing,
// package resolution or receipt.cwd fallback for a relative source edge.
export function compilerInputEdge(importer: string, path: string, captured: ReadonlyMap<string, readonly string[]>) {
  const canonical = isAbsolute(path) ? resolve(path) : resolve(dirname(importer), path)
  const keys = captured.get(canonical)
  if (!keys) return undefined
  if (keys.length !== 1) throw new Error("PROVIDER_COMPILER_EDGE_PATH_AMBIGUOUS")
  return keys[0]
}

export async function calibrateCompilerEdge(input: { path: string; key: string }, edge: string, captured: ReadonlyMap<string, readonly string[]>) {
  const accepted = compilerInputEdge(input.path, edge, captured)
  if (accepted !== input.key) throw new Error("PROVIDER_COMPILER_SELF_EDGE_CONTROL_NOT_ACCEPTED")
  const decoys = [...captured].filter(([path]) => path.endsWith(`${sep}omni.ts`) && path !== input.path)
  if (!decoys.length) throw new Error("PROVIDER_COMPILER_SAME_BASENAME_CONTROL_MISSING")
  const cases = [
    { name: "same-basename-only", edge, captured: new Map(decoys), expected: "PROVIDER_COMPILER_EDGE_NOT_CAPTURED" },
    { name: "wrong-parent", edge: "./__unrecorded-parent__/omni.ts", captured, expected: "PROVIDER_COMPILER_EDGE_NOT_CAPTURED" },
    { name: "unrecorded-edge", edge: "./__unrecorded-compiler-edge__.ts", captured, expected: "PROVIDER_COMPILER_EDGE_NOT_CAPTURED" },
    { name: "ambiguous-canonical-input", edge, captured: new Map([...captured, [input.path, [input.key, `duplicate:${input.key}`]]]),
      expected: "PROVIDER_COMPILER_EDGE_PATH_AMBIGUOUS" },
  ]
  const rejected = await Promise.all(cases.map(async (control) => {
    const observed = await Promise.resolve().then(() => {
      if (compilerInputEdge(input.path, control.edge, control.captured) === undefined) throw new Error("PROVIDER_COMPILER_EDGE_NOT_CAPTURED")
      throw new Error("PROVIDER_COMPILER_EDGE_MUTATION_ACCEPTED")
    }).then(() => { throw new Error("PROVIDER_COMPILER_EDGE_CONTROL_VACUOUS") }, (error: unknown) => {
      if (!(error instanceof Error) || error.message !== control.expected) throw error
      return error.message
    })
    return { name: control.name, edge: control.edge, observed }
  }))
  if (compilerInputEdge(input.path, edge, captured) !== accepted) throw new Error("PROVIDER_COMPILER_EDGE_CONTROL_NOT_RESTORED")
  return { boundary: "copied compiler edge/input-index oracle only", importer: input, edge, accepted, decoys: decoys.map(([path]) => path), rejected, restored: accepted }
}
