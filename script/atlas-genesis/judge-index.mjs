// Independent judge context from readScip's frozen projection, never a proposer-supplied caller list.
// Deliberately exact-symbol only: no suffix/name guesses or fabricated cross-package resolution.
import { Buffer } from "node:buffer"

const LIMIT = 120000

/** Synchronous. `excerpt` is the injected safe, full-file checkout reader; its refusals must throw.
 * Counts match verify-count.ts's file/unit granularity, including self-references when indexed.
 * unit-exports.ts requires a cross-unit caller for candidate admission, but its bound includes all callers.
 * This evidence reader neither re-admits candidates nor upgrades a lower bound to an exact truth claim. */
export function indexedWitnessEvidence(repo, fact, scip, excerpt) {
  const witness = fact?.witness
  if (witness?.slot !== "dependency" && witness?.slot !== "count") return "(none)"
  if (typeof witness.target !== "string" || witness.target.trim() === "" || /[\u0000-\u001f\u007f]/.test(witness.target))
    refuse("invalid-target")
  if (witness.target.startsWith("local ")) refuse("target-not-global")
  const scope = witness.scope === "." ? "." : repoPath(witness.scope, "invalid-scope")
  if (witness.slot === "count" && (!Number.isSafeInteger(witness.atLeast) || witness.atLeast < 1))
    refuse("invalid-lower-bound")
  if (scip === null || typeof scip !== "object" || !Array.isArray(scip.documents)) refuse("malformed-scip")
  if (typeof excerpt !== "function") refuse("invalid-excerpt-reader")

  const definitions = new Set()
  const references = new Set()
  for (const doc of scip.documents) {
    if (doc === null || typeof doc !== "object" || !Array.isArray(doc.occurrences)) refuse("malformed-scip")
    const file = repoPath(doc.relativePath, "unsafe-scip-path")
    for (const occurrence of doc.occurrences) {
      if (
        occurrence === null ||
        typeof occurrence !== "object" ||
        typeof occurrence.symbol !== "string" ||
        (occurrence.role !== "definition" && occurrence.role !== "reference")
      ) refuse("malformed-scip")
      if (occurrence.symbol !== witness.target) continue
      if (occurrence.role === "definition") definitions.add(file)
      // Mutation target: dropping the reference-role condition must count definition-only files and fail tests.
      if (occurrence.role === "reference" && (scope === "." || file === scope || file.startsWith(`${scope}/`))) references.add(file)
      // Mutation target: removing the segment-safe scope condition must include off-scope files and fail tests.
    }
  }
  if (definitions.size === 0) refuse("missing-target-definition")
  if (references.size === 0) refuse("empty-in-scope-references")
  if (witness.slot === "count" && references.size < witness.atLeast) refuse("below-witnessed-bound")

  const definitionPaths = [...definitions].sort()
  const referencePaths = [...references].sort()
  const entry = fact.grounding?.entries?.[0]
  const subject = entry?.path ?? entry?.anchor?.qualifiedPath?.split(/::|#/)[0]
  const source = subject === undefined ? undefined : repoPath(subject, "invalid-subject-path")
  const referenceExcerpt = references.has(source) ? source : referencePaths[0]
  const parts = []
  const append = (text) => {
    if (typeof text !== "string" || text.length === 0) refuse("invalid-excerpt")
    parts.push(text)
    // Account for separators as well as UTF-8 bytes: oversize evidence is refused, never sliced.
    if (parts.reduce((n, part) => n + part.length + 2, -2) > LIMIT ||
        parts.reduce((n, part) => n + Buffer.byteLength(part, "utf8") + 2, -2) > LIMIT) refuse("evidence-too-large")
  }
  append("SCIP indexed witness evidence (index records, not a judge verdict)")
  append(`Witness slot: ${witness.slot}\nExact target symbol: ${JSON.stringify(witness.target)}\nScope: ${JSON.stringify(scope)}`)
  if (witness.slot === "count") append(`Requested lower bound (distinct files): ${witness.atLeast}`)
  append(`SCIP definition document paths:\n${definitionPaths.map((file) => `- ${JSON.stringify(file)}`).join("\n")}`)
  append(`SCIP in-scope reference document paths (distinct files):\n${referencePaths.map((file) => `- ${JSON.stringify(file)}`).join("\n")}`)
  append(`SCIP indexed distinct referencing file count: ${referencePaths.length}`)
  append("Files/units, not occurrences or functions; the indexed count is not an exact repository-wide count.")
  for (const file of [...new Set([...definitionPaths, referenceExcerpt])]) {
    append(`Checkout source for SCIP ${definitions.has(file) ? "target definition" : "reference document"}: ${JSON.stringify(file)}`)
    append(excerpt(repo, file))
  }
  return parts.join("\n\n")
}

// Reject traversal before normalization so aliases cannot hide a climb. `./` segments share file identity.
function repoPath(value, code) {
  if (typeof value !== "string" || value === "" || value.startsWith("/") || /^[A-Za-z]:/.test(value) ||
      /[\\\u0000-\u001f\u007f]/.test(value)) refuse(code)
  const segments = value.split("/")
  if (segments.some((segment) => segment === "" || segment === ".." || segment === ".git")) refuse(code)
  const normalized = segments.filter((segment) => segment !== ".").join("/")
  if (normalized === "" || /^[A-Za-z]:/.test(normalized)) refuse(code)
  return normalized
}

function refuse(code) {
  const error = new Error(`judge-index: ${code}`)
  error.name = "IndexedWitnessEvidenceError"
  error.code = code
  throw error
}
