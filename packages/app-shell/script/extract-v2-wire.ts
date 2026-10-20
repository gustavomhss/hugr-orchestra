// Extracts the app-shell v2 wire types into packages/app-shell/src/v2-wire.ts.
//
// Sources (pinned):
//   - packages/sdk/js/src/v2/gen/types.gen.ts            (current SDK v2 type declarations)
//   - packages/app-shell/vendor/opencode-ai-client-1.17.13-v2.tgz
//     (dist/promise/generated/types.d.ts, the legacy wire the compat boundary serves today)
//   - packages/sdk/js/src/v2/gen/maestro-events.gen.ts   (the imports on types.gen.ts lines 1-9)
//
// The root names are the legacy export names. A root resolves to the legacy tarball's
// declaration first (the app now compiles against that shape), then the SDK v2 file, then
// maestro events. Referenced names resolve from the declaring file first, so each source
// file's declarations stay self-consistent; a name the declaring file lacks falls back to
// legacy, then v2, then maestro. `CurrentProject` is the legacy alias of the tarball's
// `ProjectCurrent`. Declarations are copied verbatim.
//
// Provenance guard: the content hash of the emitted block is written to
// packages/app-shell/script/v2-wire.sha256. When a committed hash exists the extractor
// verifies the on-disk v2-wire.ts against it (failing on tampering) and fails when the
// freshly computed hash differs; only an explicit update of the committed hash (after
// review of the wire change) lets regeneration through.

import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const ROOT = path.resolve(import.meta.dir, "../../..")
const V2_GEN = path.join(ROOT, "packages/sdk/js/src/v2/gen/types.gen.ts")
const MAESTRO_GEN = path.join(ROOT, "packages/sdk/js/src/v2/gen/maestro-events.gen.ts")
const TARBALL = path.join(ROOT, "packages/app-shell/vendor/opencode-ai-client-1.17.13-v2.tgz")
const OUT = path.join(ROOT, "packages/app-shell/src/v2-wire.ts")
const HASH_FILE = path.join(ROOT, "packages/app-shell/script/v2-wire.sha256")

// Legacy export names the app-shell compat boundary must keep providing.
const ROOTS = [
  "FileNode",
  "FileContent",
  "Path",
  "Provider",
  "Agent",
  "Event",
  "V2SessionListResponse",
  "AgentListInput",
  "AgentListOutput",
  "CommandListInput",
  "CommandListOutput",
  "ProjectCurrentInput",
  "ProjectCurrentOutput",
  "ReferenceListInput",
  "ReferenceListOutput",
  "Config",
  "ProviderAuthResponse",
  "IntegrationOauthConnectOutput",
  "McpResourceCatalogInput",
  "McpResourceCatalogOutput",
  "McpListInput",
  "McpListOutput",
  "ModelDefaultOutput",
  "ModelListOutput",
  "ProviderListOutput",
  "CurrentProject",
  "SessionPendingMessage",
  "SessionMessageAssistantTool",
  "SessionMessageShell",
  "SessionProcess",
  "SessionActiveOutput",
  "EventSessionError",
  "ProviderListResponse",
  "SessionNotFoundError",
  "SessionMessageToolStateCompleted",
  "SessionCommandInput",
  "SessionCommandOutput",
  "SessionCompactInput",
  "SessionCompactOutput",
  "SessionPromptInput",
  "SessionPromptOutput",
  "SessionShellInput",
  "SessionShellOutput",
  "SessionListInput",
] as const

// Root export names whose declaration carries a different name in its source file.
const ROOT_ALIASES: Record<string, string> = { CurrentProject: "ProjectCurrent" }

const MAESTRO_NAMES = new Set([
  "MaestroWorkResultDecided",
  "SyncEventMaestroWorkResultDecided",
  "EventMaestroWorkResultDecided",
  "MaestroTaskBound",
  "SyncEventMaestroTaskBound",
  "EventMaestroTaskBound",
])

const DECL_LINE = /^export (?:type|interface) ([A-Za-z0-9_$]+)/
const SEPARATOR = /^(?:export|import) /

function declarations(text: string): Map<string, string> {
  const lines = text.split("\n")
  const map = new Map<string, string>()
  for (let i = 0; i < lines.length; ) {
    const line = lines[i]
    const match = DECL_LINE.exec(line)
    if (match === null) {
      i += 1
      continue
    }
    let start = i
    while (start > 0 && /^\/\*\*|^\s*\*|^\s*\*\/$/.test(lines[start - 1])) start -= 1
    const name = match[1]
    let j = i + 1
    while (j < lines.length && !SEPARATOR.test(lines[j])) j += 1
    const text2 = lines.slice(start, j).join("\n")
    const previous = map.get(name)
    if (previous !== undefined && previous !== text2) throw new Error(`DUPLICATE_DECLARATION ${name}`)
    map.set(name, text2)
    i = j
  }
  return map
}

function genericParams(firstLine: string): Set<string> {
  const match = DECL_LINE.exec(firstLine)
  if (match === null || firstLine.length === match[0].length) return new Set()
  const rest = firstLine.slice(match[0].length)
  if (!rest.startsWith("<")) return new Set()
  const close = rest.indexOf(">")
  if (close < 0) throw new Error(`UNCLOSED_GENERICS ${firstLine}`)
  return new Set(
    rest
      .slice(1, close)
      .split(",")
      .map((part) => part.trim().split(/\s/)[0])
      .filter((part): part is string => /^[A-Za-z0-9_$]+$/.test(part)),
  )
}

function referencedNames(decl: string): Set<string> {
  const params = genericParams(decl.split("\n")[0] ?? "")
  const bare = decl.replaceAll(/"[^"]*"|'[^']*'|`[^`]*`/g, " ")
  const names = new Set<string>()
  for (const word of bare.matchAll(/\b[A-Z][A-Za-z0-9_$]*\b/g)) {
    if (!params.has(word[0])) names.add(word[0])
  }
  return names
}

class Resolver {
  readonly byName = new Map<string, string>()
  private readonly declared = new Map<string, "v2" | "legacy" | "maestro">()
  private readonly claimers = new Map<string, "v2" | "legacy" | "maestro">()

  constructor(
    private readonly v2: Map<string, string>,
    private readonly legacy: Map<string, string>,
    private readonly maestro: Map<string, string>,
  ) {
    for (const [name] of v2) this.declared.set(name, "v2")
    for (const [name] of legacy) this.declared.set(name, "legacy")
    for (const [name] of maestro) this.declared.set(name, "maestro")
  }

  declare(name: string, source: "v2" | "legacy" | "maestro") {
    const owner = this.claimers.get(name)
    if (owner !== undefined) return owner === source
    this.claimers.set(name, source)
    const text = this.textOf(name, source)
    this.byName.set(name, text)
    return true
  }

  resolve(name: string, from: "v2" | "legacy" | "maestro"): "v2" | "legacy" | "maestro" {
    const order: ("v2" | "legacy" | "maestro")[] =
      from === "legacy" ? ["legacy", "v2", "maestro"] : from === "maestro" ? ["maestro", "v2", "legacy"] : ["v2", "legacy", "maestro"]
    for (const source of order) {
      if (this.declared.has(name) && source === "maestro" && !MAESTRO_NAMES.has(name)) continue
      if (this.textOf(name, source) !== undefined) return source
    }
    throw new Error(`UNRESOLVED_REFERENCE ${name} from ${from}`)
  }

  private textOf(name: string, source: "v2" | "legacy" | "maestro"): string | undefined {
    if (source === "v2") return this.v2.get(name)
    if (source === "legacy") return this.legacy.get(name)
    return this.maestro.get(name)
  }
}

function extractVendor(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "v2-wire-vendor-"))
  const result = Bun.spawnSync(["tar", "-xzf", TARBALL, "-C", dir])
  if (result.exitCode !== 0) throw new Error(`TARBALL_EXTRACT_FAILED: ${result.stderr.toString().trim()}`)
  return readFileSync(path.join(dir, "package/dist/promise/generated/types.d.ts"), "utf8")
}

function closure(roots: readonly string[], resolver: Resolver): Map<string, string> {
  const queue: { name: string; source: "v2" | "legacy" | "maestro" }[] = []
  for (const root of roots) {
    const alias = ROOT_ALIASES[root] ?? root
    const source = resolver.resolve(alias, "legacy")
    queue.push({ name: alias, source })
  }
  for (let i = 0; i < queue.length; i += 1) {
    const { name, source } = queue[i]
    if (!resolver.declare(name, source)) continue
    for (const reference of referencedNames(resolver.byName.get(name)!)) {
      if (!resolver.declared.has(reference)) continue
      if (resolver.byName.has(reference)) continue
      queue.push({ name: reference, source: resolver.resolve(reference, source) })
    }
  }
  return resolver.byName
}

function buildBlock(decls: Map<string, string>): string {
  const header = [
    "// Generated by packages/app-shell/script/extract-v2-wire.ts; do not edit.",
    "//",
    "// Verbatim declarations for the app-shell legacy-type contract, exported under the",
    "// legacy wire names. Sources: packages/sdk/js/src/v2/gen/types.gen.ts,",
    "// the vendored opencode-ai-client-1.17.13-v2 tarball",
    "// (dist/promise/generated/types.d.ts) and packages/sdk/js/src/v2/gen/maestro-events.gen.ts.",
    "// A root name resolves to the legacy tarball's declaration first, then the SDK v2 file,",
    "// then maestro events; referenced names stay in their declaring file first. `CurrentProject`",
    "// aliases the tarball's `ProjectCurrent`. Content hash lives in script/v2-wire.sha256.",
    "",
  ].join("\n")
  const sorted = [...decls.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const aliases = Object.entries(ROOT_ALIASES).map(([exportName, sourceName]) => `export type ${exportName} = ${sourceName}`)
  const block = [header, ...sorted.map(([, text]) => text), ...aliases, ""].join("\n")
  const present = new Set([...decls.keys(), ...Object.keys(ROOT_ALIASES)])
  for (const root of rootsMissing(present)) throw new Error(`ROOT_MISSING ${root}`)
  return block
}

function rootsMissing(present: Set<string>): string[] {
  return ROOTS.filter((root) => !present.has(root))
}

function main() {
  const v2Text = readFileSync(V2_GEN, "utf8")
  const maestroText = readFileSync(MAESTRO_GEN, "utf8")
  const legacyText = extractVendor()
  const resolver = new Resolver(declarations(v2Text), declarations(legacyText), declarations(maestroText))
  const block = buildBlock(closure(ROOTS, resolver))
  const hash = createHash("sha256").update(block).digest("hex")
  const committed = existsSync(HASH_FILE) ? readFileSync(HASH_FILE, "utf8").trim() : undefined

  if (committed === undefined) {
    writeFileSync(OUT, block)
    writeFileSync(HASH_FILE, `${hash}\n`)
    console.log(`v2-wire: ${resolver.byName.size} declarations, roots ${ROOTS.length}, sha256 ${hash}`)
    console.log("v2-wire: no committed hash; wrote the initial provenance hash")
    return
  }

  const onDisk = createHash("sha256").update(readFileSync(OUT, "utf8")).digest("hex")
  if (onDisk !== committed) {
    console.error(`WIRE_HASH_MISMATCH: on-disk v2-wire.ts hashes to ${onDisk}, committed hash is ${committed}. ` +
      `The generated file was tampered with or is stale; the provenance guard refuses to rewrite it.`)
    process.exit(1)
  }

  if (hash !== committed) {
    console.error(`WIRE_HASH_MISMATCH: computed ${hash}, committed ${committed}. The pinned wire sources changed; ` +
      `the extraction is provenance-guarded. Review the diff, then commit a new packages/app-shell/script/v2-wire.sha256.`)
    process.exit(1)
  }

  console.log(`v2-wire: ${resolver.byName.size} declarations, roots ${ROOTS.length}, sha256 ${hash}`)
  console.log("v2-wire: hash matches the committed provenance hash")
}

main()