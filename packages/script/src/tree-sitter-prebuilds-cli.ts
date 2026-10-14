// The command line of tree-sitter-prebuilds.ts, kept out of that module on purpose: the packaged Desktop bundles the
// module into its main entry, where import.meta.main is true, so a main block there ran this command at app start.
import path from "node:path"
import { exportTreeSitter, prepareTreeSitterPrebuilds } from "./tree-sitter-prebuilds"

const [os, arch, ...args] = process.argv.slice(2)
const outAt = args.indexOf("--out")
const out = outAt < 0 ? undefined : args[outAt + 1]
const abi = args.includes("--musl") ? "musl" : undefined
if (!os || !arch || (outAt >= 0 && (!out || out.startsWith("-"))) || args.length !== (outAt < 0 ? 0 : 2) + (abi ? 1 : 0) ||
    args.some((arg, i) => arg !== "--musl" && arg !== "--out" && i !== outAt + 1))
  throw new Error("Usage: tree-sitter-prebuilds-cli.ts <os> <arch> [--out <dir>] [--musl]")
const root = path.resolve(import.meta.dirname, "../../..")
console.log(
  JSON.stringify(out ? exportTreeSitter({ root, os, arch, abi, out }) : prepareTreeSitterPrebuilds({ root, os, arch, abi })),
)
