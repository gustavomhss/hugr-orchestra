export * as AtlasParser from "./atlas-parser"

/** Test setup only: return the physical installed web-tree-sitter@0.23.2 directory, never another version. */
export async function directory(_root: string): Promise<string> {
  throw new Error("Pinned parser resolver scaffold is not implemented")
}
