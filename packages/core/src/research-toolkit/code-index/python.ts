export * as CodeIndexPython from "./python"

// The Python half of the indexer run (J2.5). The pack's executable is scip-python, a pyright fork: `index` takes the
// same `--output` as scip-typescript, but names the project and version in every symbol. The version is pinned to a
// constant because the default is the git revision, which would make a dump depend on the worktree's history; the
// shard key already carries the commit's tree hash (J2.2).

/** Arguments after the executable. The project name is the shard's directory, so shards of one repository stay distinct. */
export function args(input: { readonly project: string; readonly output: string }) {
  return [
    "index", "--quiet", "--project-name", input.project === "." ? "root" : input.project.replaceAll("/", "-"),
    "--project-version", "0", "--output", input.output,
  ]
}

/**
 * scip-python gives every module a `<module>/__init__:` symbol, defined at the top of its file and referenced by every
 * import of it. It is the file module, as scip-typescript's `path/` is, and no definition a caller or an outline names.
 */
export function indexable(symbol: string) {
  return !symbol.endsWith("/__init__:")
}
