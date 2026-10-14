import { readFile, realpath, stat } from "node:fs/promises"

// Input is pacman-conf's complete, resolved serialization, never raw Include
// syntax. Preserve every other byte so pacman remains the configuration parser.
export function enforcedPacmanConfig(resolved: string) {
  if (!resolved.endsWith("\n")) throw new Error("AUR_PACMAN_RESOLVED_CONFIG_INCOMPLETE")
  let section = ""
  const options = new Set<string>()
  const repositories = new Set<string>()
  const servers = new Set<string>()
  const lines = resolved.split("\n").map((line) => {
    const text = line.trim()
    if (!text) return line
    const header = /^\[([a-zA-Z0-9_-]+)\]$/.exec(text)
    if (header) {
      if (header[1] === "options") {
        if (section) throw new Error("AUR_PACMAN_RESOLVED_CONFIG_SECTION_INVALID")
        section = header[1]
        return line
      }
      if (!section || repositories.has(header[1])) throw new Error("AUR_PACMAN_RESOLVED_CONFIG_SECTION_INVALID")
      repositories.add(header[1])
      section = header[1]
      return line
    }
    const directive = /^([a-zA-Z][a-zA-Z0-9]*)(?:\s*=\s*.*)?$/.exec(text)
    if (!section || !directive) throw new Error("AUR_PACMAN_RESOLVED_CONFIG_DIRECTIVE_INVALID")
    const key = directive[1]
    if (key === "Include") throw new Error("AUR_PACMAN_RESOLVED_CONFIG_INCLUDE_UNRESOLVED")
    if (key === "DisableSandbox" || key === "DisableSandboxSyscalls")
      throw new Error("AUR_PACMAN_SANDBOX_DISABLE_FORBIDDEN")
    if (key === "DisableSandboxFilesystem") {
      if (section !== "options" || text !== key) throw new Error("AUR_PACMAN_FILESYSTEM_DISABLE_DIRECTIVE_INVALID")
      return undefined
    }
    if (section === "options") options.add(key)
    if (section !== "options" && key === "Server") servers.add(section)
    return line
  })
  if (!options.has("DownloadUser") || !options.has("SigLevel") || repositories.size === 0 ||
      [...repositories].some((repository) => !servers.has(repository)))
    throw new Error("AUR_PACMAN_RESOLVED_CONFIG_INCOMPLETE")
  return lines.filter((line) => line !== undefined).join("\n")
}

export function pacmanConfigQuery(input: { status: string; stderr: string; resolved: string }) {
  if (input.status !== "0\n") throw new Error("AUR_PACMAN_CONFIG_QUERY_FAILED")
  if (input.stderr !== "") throw new Error("AUR_PACMAN_CONFIG_QUERY_DIAGNOSTIC")
  return input.resolved
}

export async function prepareBootstrapConfig(directory: string) {
  if (!(await readFile(`${directory}/bootstrap-pacman-original.conf`, "utf8")).trim())
    throw new Error("AUR_PACMAN_ORIGINAL_CONFIG_EMPTY")
  await Bun.write(`${directory}/bootstrap-pacman.conf`, enforcedPacmanConfig(await configQuery(directory, "original")))
}

export async function verifyBootstrapConfig(directory: string) {
  const expected = enforcedPacmanConfig(await configQuery(directory, "original"))
  if (await readFile(`${directory}/bootstrap-pacman.conf`, "utf8") !== expected)
    throw new Error("AUR_PACMAN_OWNED_CONFIG_CHANGED")
  const resolved = await configQuery(directory, "enforced")
  if (enforcedPacmanConfig(resolved) !== resolved)
    throw new Error("AUR_PACMAN_ENFORCED_CONFIG_ROUNDTRIP_MISMATCH")
  const canonical = await Promise.all([configDirectories(expected), configDirectories(resolved)])
  if (canonical[0] !== canonical[1])
    throw new Error("AUR_PACMAN_ENFORCED_CONFIG_ROUNDTRIP_MISMATCH")
}

async function configDirectories(config: string) {
  let section = ""
  return (await Promise.all(config.split("\n").map(async (line) => {
    if (line.trim().startsWith("[")) section = line.trim()
    // pacman-conf trims these two directory defaults on re-reading. Only their
    // option values use OS physical identity; every other byte stays significant.
    const field = section === "[options]" ? /^(\s*(?:DBPath|GPGDir)\s*=\s*)(.*)$/.exec(line) : null
    if (!field) return line
    const directory = await realpath(field[2])
    if (!(await stat(directory)).isDirectory()) throw new Error("AUR_PACMAN_CONFIG_PATH_NOT_DIRECTORY")
    return `${field[1]}${directory}`
  }))).join("\n")
}

async function configQuery(directory: string, stage: string) {
  return pacmanConfigQuery({
    status: await readFile(`${directory}/bootstrap-config-${stage}.status`, "utf8"),
    stderr: await readFile(`${directory}/bootstrap-config-${stage}.stderr`, "utf8"),
    resolved: await readFile(`${directory}/bootstrap-config-${stage}.txt`, "utf8"),
  })
}
