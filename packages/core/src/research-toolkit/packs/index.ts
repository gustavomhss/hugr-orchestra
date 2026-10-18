import scipTypescript from "./scip-typescript"
import typescript from "./typescript"

// One import and one entry per pack, keyed by its own id (J6.4). scip-python, scip-go and rust-analyzer join with X5/X6.
// The TypeScript tree-sitter grammar and `@c4312/scip` are not packs: they are core dependencies (J6.5).
export const PACKS = {
  [scipTypescript.id]: scipTypescript,
  [typescript.id]: typescript,
}
