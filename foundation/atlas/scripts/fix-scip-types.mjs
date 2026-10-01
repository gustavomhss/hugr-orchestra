// Postinstall shim — @c4312/scip packaging fix (orchestrator toolchain, NOT part of any WP).
//
// `@c4312/scip@0.1.0` ships its raw `index.ts` (ESM syntax, CommonJS-flagged) beside a proper `index.d.ts`
// but omits the `"types"`/`"exports"` fields from its on-disk package.json. Under the repo's NodeNext +
// `verbatimModuleSyntax`, tsc's fallback resolution then tries `.ts` before `.d.ts` and pulls that source
// into the build, erroring (TS1295/1484/1287). Adding the fields (idempotently, at install time) redirects
// tsc to the shipped `index.d.ts` (which `skipLibCheck` then skips). Remove this shim + the postinstall hook
// if @c4312/scip fixes its published packaging.
import { readFileSync, writeFileSync, existsSync } from "node:fs"

const pkgPath = new URL("../node_modules/@c4312/scip/package.json", import.meta.url)
try {
  if (!existsSync(pkgPath)) process.exit(0) // dep not installed (e.g. --omit=dev) — nothing to do
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
  if (pkg.types && pkg.exports) process.exit(0) // already patched — idempotent
  pkg.types = "./index.d.ts"
  pkg.exports = { ".": { types: "./index.d.ts", default: "./index.js" } }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n")
  console.log("[fix-scip-types] added types/exports to @c4312/scip (upstream packaging shim)")
} catch (err) {
  console.warn("[fix-scip-types] skipped:", err.message) // never fail the install
}
