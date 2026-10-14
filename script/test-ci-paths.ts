// isFile answers relative to directory. Explicit files retain Bun's ordered-file semantics.
export function testPathsAt(directory: string, args: string[], isFile: (relative: string) => boolean, legacyName?: string): string[] {
  const dir = directory.replaceAll("\\", "/")
  if (/[\x00-\x1f\x7f:]/.test(dir) || dir.split("/").some((part) => !part || part === "." || part === ".."))
    throw new Error(`test-ci invalid directory: ${directory}`)
  const prefixes = [`${dir}/`, ...(legacyName === undefined ? [] : [`packages/${legacyName}/`])]
  return args.map((arg) => {
    const normalized = arg.replaceAll("\\", "/")
    if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || normalized.startsWith("-")) return arg
    const relative = normalized.startsWith("./") ? normalized.slice(2) : normalized
    const prefix = prefixes.find((prefix) => relative.startsWith(prefix))
    const file = prefix === undefined ? normalized : relative.slice(prefix.length)
    if (file.startsWith("./") || isFile(file)) return `./${file.replace(/^\.\//, "")}`
    // Preserve filters verbatim, except for a literal repository directory prefix.
    if (prefix === undefined) return arg
    return arg.slice((arg.startsWith("./") || arg.startsWith(".\\") ? 2 : 0) + prefix.length)
  })
}
