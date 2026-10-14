// The command line of tree-sitter-prebuilds.ts, kept out of that module on purpose: the packaged Desktop bundles the
// module into its main entry, where import.meta.main is true, so a main block there ran this command at app start.
import { WorkspacePaths } from "./workspace-paths.ts"
import { exportTreeSitter, prepareTreeSitterPrebuilds } from "./tree-sitter-prebuilds"

const [os, arch, flag, out] = process.argv.slice(2)
if (!os || !arch || (flag !== undefined && (flag !== "--out" || !out)))
  throw new Error("Usage: tree-sitter-prebuilds-cli.ts <os> <arch> [--out <dir>]")
const root = WorkspacePaths.findRoot(import.meta.dirname)
console.log(
  JSON.stringify(out ? exportTreeSitter({ root, os, arch, out }) : prepareTreeSitterPrebuilds({ root, os, arch })),
)
