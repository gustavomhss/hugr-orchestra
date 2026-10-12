import path from "node:path"
import { exportTreeSitter, prepareTreeSitterPrebuilds } from "./tree-sitter-prebuilds"

// Keep CLI execution outside the helper imported by the packaged Electron main process.
const [os, arch, flag, out] = process.argv.slice(2)
if (!os || !arch || (flag !== undefined && (flag !== "--out" || !out)))
  throw new Error("Usage: tree-sitter-export.ts <os> <arch> [--out <dir>]")
const root = path.resolve(import.meta.dirname, "../../..")
console.log(JSON.stringify(out ? exportTreeSitter({ root, os, arch, out }) : prepareTreeSitterPrebuilds({ root, os, arch })))
