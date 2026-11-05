// Conservative index reuse: only reviewed, non-indexed maintenance paths may differ from the source run.
// The workflow must first prove git diff succeeded against an immutable ancestor; an empty diff is valid.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { posix, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const files = new Set([
  ".github/workflows/atlas-genesis.yml",
  ".orchestra/skills/atlas-maintenance/SKILL.md",
  "docs/guides/atlas-genesis.md",
])

export function requireReusableChanges(paths) {
  assert(Array.isArray(paths) && paths.every((path) => typeof path === "string" && path.length > 0 &&
    !path.includes("\0") && !path.startsWith("/") &&
    path.split("/").every((part) => part !== "" && part !== "." && part !== "..")),
  "index-reuse: invalid change list")
  const blocked = paths.filter((path) => !files.has(path) &&
    !path.startsWith("modules/atlas/") && !path.startsWith("script/atlas-genesis/"))
  assert.equal(blocked.length, 0, `index-reuse: indexed or unreviewed paths changed: ${JSON.stringify(blocked)}`)
}

export function requireUnchangedDocuments(paths, documents) {
  requireReusableChanges(paths)
  assert(Array.isArray(documents) && documents.length > 0 && documents.every((doc) =>
    typeof doc?.relativePath === "string" && doc.relativePath.length > 0), "index-reuse: missing indexed document list")
  const indexed = new Set(documents.map((doc) => {
    const path = posix.normalize(doc.relativePath)
    assert(!doc.relativePath.includes("\\") && !doc.relativePath.includes("\0") &&
      !/^[A-Za-z]:/.test(path) && !posix.isAbsolute(path) && path !== "." && path !== ".." &&
      !path.startsWith("../"), "index-reuse: invalid indexed document identity")
    return path
  }))
  assert(paths.every((path) => !indexed.has(path)), "index-reuse: an indexed document changed inside the maintenance scope")
}

/** Fresh dumps must name tracked source bytes from the declared revision, not generated/untracked copies. */
export function requireIndexedSourceBytes(documents, tree, readSource) {
  requireUnchangedDocuments([], documents)
  assert(typeof tree === "string" && tree.length > 0 && tree.endsWith("\0"), "index-source: missing Git tree")
  const entries = new Map(tree.slice(0, -1).split("\0").map((record) => {
    const separator = record.indexOf("\t")
    const header = record.slice(0, separator).split(" ")
    assert(separator > 0 && header.length === 3 && /^[0-9a-f]{40}$/.test(header[2]), "index-source: malformed Git tree")
    return [record.slice(separator + 1), { mode: header[0], type: header[1], hash: header[2] }]
  }))
  for (const doc of documents) {
    const path = posix.normalize(doc.relativePath)
    const entry = entries.get(path)
    assert(entry?.type === "blob" && ["100644", "100755"].includes(entry.mode), `index-source: document is not tracked source: ${path}`)
    const bytes = readSource(path)
    const actual = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
    assert.equal(actual, entry.hash, `index-source: document bytes differ from revision: ${path}`)
  }
}

function readChanges(file) {
  const text = readFileSync(file, "utf8")
  assert(text.length === 0 || text.endsWith("\0"), "index-reuse: expected NUL-terminated git paths")
  return text.split("\0").filter((path) => path.length > 0)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 5, "usage: index-reuse.mjs <git-changes.nul> <source-sha> <receipt.json>")
  const [input, sourceRevision, output] = process.argv.slice(2)
  if (input === "documents" || input === "checkout") {
    const { readScip } = await import("../../modules/atlas/packages/adapter-io/dist/src/index.js")
    const documents = readScip(resolve(".atlas/index.scip")).documents
    if (input === "documents") requireUnchangedDocuments(readChanges(sourceRevision), documents)
    if (input === "checkout") requireIndexedSourceBytes(documents, readFileSync(sourceRevision, "utf8"), (path) => readFileSync(resolve(path)))
    const receipt = JSON.parse(readFileSync(output, "utf8"))
    writeFileSync(output, JSON.stringify({ ...receipt, indexedDocuments: documents.length }) + "\n")
    console.log("index-reuse: actual restored documents are nonempty and unchanged")
  } else {
    assert(/^[a-f0-9]{40}$/.test(sourceRevision), "index-reuse: source revision must be immutable")
    const paths = readChanges(input)
    requireReusableChanges(paths)
    writeFileSync(output, JSON.stringify({ sourceRevision, policy: "non-indexed-maintenance-only-v1", changedPaths: paths.length }) + "\n")
    console.log("index-reuse: source tree changes are confined to reviewed non-indexed maintenance paths")
  }
}
