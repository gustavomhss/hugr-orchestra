// Repo-only projection: raw output is preserved; tracked source documents and verified aliases enter mining.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, posix, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { deserializeSCIP, serializeSCIP } from "@c4312/scip"
import { requireUnchangedDocuments } from "../../../script/atlas-genesis/index-reuse.mjs"

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex")

export function scopeIndexes(directory, rawDirectory, treeText) {
  assert(treeText.length > 0 && treeText.endsWith("\0"), "index-scope: missing Git tree")
  const tracked = new Map(treeText.slice(0, -1).split("\0").map((line) => {
    const separator = line.indexOf("\t")
    const header = line.slice(0, separator).split(" ")
    assert(separator > 0 && header.length === 3 && /^[0-9a-f]{40}$/.test(header[2]), "index-scope: malformed Git tree")
    return [line.slice(separator + 1), header[1] === "blob" && ["100644", "100755", "120000"].includes(header[0])]
  }))
  const roots = JSON.parse(readFileSync(join(directory, "roots.json"), "utf8"))
  assert(roots !== null && typeof roots === "object" && !Array.isArray(roots), "index-scope: invalid roots")
  const files = readdirSync(directory).filter((file) => file.endsWith(".scip")).sort()
  assert(files.length > 0, "index-scope: no dumps")
  const prepared = files.map((file) => {
    const root = roots[file] ?? ""
    assert(typeof root === "string" && !root.includes("\\") && !root.includes("\0") &&
      !posix.isAbsolute(root) && !/^[A-Za-z]:/.test(root) && !root.split("/").includes(".."), "index-scope: invalid root")
    const raw = readFileSync(join(directory, file))
    const index = deserializeSCIP(raw)
    requireUnchangedDocuments([], index.documents)
    const excluded = []
    const documents = index.documents.filter((doc) => {
      const path = posix.join(root, doc.relativePath)
      if (tracked.get(path) === true) return true
      assert(!tracked.has(path), `index-scope: indexed path is not a regular source: ${path}`)
      excluded.push({ path, reason: "not-in-revision-source-tree", documentSha256: digest(JSON.stringify(doc)) })
      return false
    })
    assert(documents.length > 0, `index-scope: no tracked source documents in ${file}`)
    const scoped = Buffer.from(serializeSCIP({ ...index, documents }))
    return { file, raw, scoped, receipt: {
      file, rawSha256: digest(raw), scopedSha256: digest(scoped),
      rawDocuments: index.documents.length, trackedDocuments: documents.length, excluded,
    } }
  })
  mkdirSync(rawDirectory, { recursive: true })
  writeFileSync(join(rawDirectory, "roots.json"), readFileSync(join(directory, "roots.json")), { flag: "wx" })
  // Preserve every original before replacing any dump; a failed preservation never yields a reusable index.
  for (const item of prepared) writeFileSync(join(rawDirectory, item.file), item.raw, { flag: "wx" })
  for (const item of prepared) writeFileSync(join(directory, item.file), item.scoped)
  return { policy: "tracked-source-documents-and-verified-links-v1", dumps: prepared.map((item) => item.receipt) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 6, "usage: genesis-index-scope.mjs <index-dir> <raw-dir> <git-tree.nul> <receipt.json>")
  const [directory, rawDirectory, tree, receipt] = process.argv.slice(2)
  writeFileSync(receipt, JSON.stringify(scopeIndexes(directory, rawDirectory, readFileSync(tree, "utf8"))) + "\n", { flag: "wx" })
}
