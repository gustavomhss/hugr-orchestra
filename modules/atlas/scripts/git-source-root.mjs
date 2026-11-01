/** Resolve Atlas placement at a commit; git must return synchronous text and throw on failure. */
export function atlasRevisionSource(revision, git, options = {}) {
  const run = (args) => {
    try {
      const text = git(["--no-replace-objects", ...args])
      if (typeof text !== "string") throw new TypeError("git must return synchronous text")
      return text
    } catch (error) {
      throw sourceError("ATLAS_SOURCE_GIT_FAILED", error instanceof Error ? error.message : String(error), error)
    }
  }
  const resolved = run(["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`]).trim()
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(resolved) || run(["cat-file", "-t", resolved]).trim() !== "commit") {
    throw sourceError("ATLAS_SOURCE_REVISION_NOT_COMMIT", revision)
  }
  const tree = run(["rev-parse", "--verify", `${resolved}^{tree}`]).trim()
  if (run(["cat-file", "-t", tree]).trim() !== "tree") {
    throw sourceError("ATLAS_SOURCE_TREE_INVALID", tree)
  }
  // ROOT MODE: the caller's paths are relative to the repository root (an Own snapshot of the host repository,
  // not of Atlas), so the source is the whole tree. Explicit only: without it Atlas's own placement is resolved
  // below exactly as before.
  if (options.root === true) return { revision: resolved, prefix: "", tree }
  const current = run(["rev-parse", "--show-prefix"]).replace(/\r?\n$/, "").replace(/\/$/, "")
  const rootEntries = run(["ls-tree", "-z", "--full-tree", resolved]).split("\0").filter(Boolean)
  // Only the actual empty projected tree may stand in for the EARS first-import baseline.
  if (rootEntries.length === 0) {
    if (options.allowEmpty === true) return { revision: resolved, prefix: "", tree }
    throw sourceError("ATLAS_SOURCE_PREFIX_MISSING", resolved)
  }
  const matches = [...new Set(["foundation/atlas", "modules/atlas", current].filter(Boolean))].flatMap((prefix) => {
    const entry = run(["--literal-pathspecs", "ls-tree", "-z", "--full-tree", resolved, "--", prefix])
      .split("\0")
      .find((entry) => entry.slice(entry.indexOf("\t") + 1) === prefix)
    if (entry === undefined) return []
    const metadata = entry.slice(0, entry.indexOf("\t")).split(" ")
    if (metadata[1] !== "tree" || run(["cat-file", "-t", metadata[2]]).trim() !== "tree") {
      throw sourceError("ATLAS_SOURCE_PREFIX_NOT_TREE", `${resolved}:${prefix}`)
    }
    return [{ revision: resolved, prefix, tree: metadata[2] }]
  })
  const packageEntry = rootEntries.find((entry) => entry.endsWith("\tpackage.json"))
  const standalone = (current === "" && matches.length === 0) || (
    packageEntry?.startsWith("100") &&
    packageEntry.split(" ")[1] === "blob" &&
    JSON.parse(run(["show", `${resolved}:package.json`]))?.name === "atlas"
  )
  const sources = standalone ? [...matches, { revision: resolved, prefix: "", tree }] : matches
  if (sources.length === 0) throw sourceError("ATLAS_SOURCE_PREFIX_MISSING", resolved)
  if (sources.length > 1) {
    throw sourceError("ATLAS_SOURCE_PREFIX_AMBIGUOUS", `${resolved}: ${sources.map((source) => source.prefix || "<root>").join(", ")}`)
  }
  return sources[0]
}

function sourceError(code, detail, cause) {
  return Object.assign(new Error(`${code}: ${detail}`, { cause }), { code })
}
