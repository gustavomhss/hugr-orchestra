import scipPython from "./scip-python"
import scipTypescript from "./scip-typescript"
import typescript from "./typescript"

// One import and one entry per pack, keyed by its own id (J6.4). scip-go and rust-analyzer join with X6.
// The TypeScript tree-sitter grammar and `@c4312/scip` are not packs: they are core dependencies (J6.5).
export const PACKS = {
  [scipPython.id]: scipPython,
  [scipTypescript.id]: scipTypescript,
  [typescript.id]: typescript,
}
