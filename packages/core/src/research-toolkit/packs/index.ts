import rustAnalyzer from "./rust-analyzer"
import scipGo from "./scip-go"
import scipPython from "./scip-python"
import scipTypescript from "./scip-typescript"
import typescript from "./typescript"

// One import and one entry per pack, keyed by its own id (J6.4).
// The tree-sitter grammars and `@c4312/scip` are not packs: they are core dependencies (J6.5).
export const PACKS = {
  [rustAnalyzer.id]: rustAnalyzer,
  [scipGo.id]: scipGo,
  [scipPython.id]: scipPython,
  [scipTypescript.id]: scipTypescript,
  [typescript.id]: typescript,
}
