export namespace ReviewLocalCargoPaths {
  export type Refusal = { readonly status: "not-run" | "acquisition-error"; readonly reason: string }
  export type Manifest = { readonly path: string; readonly value: unknown }

  export function check(manifests: ReadonlyArray<Manifest>, files: ReadonlyArray<string>): Refusal | undefined {
    if (manifests.length === 0) return refusal("not-run", "cargo-manifest-missing")
    const listed = new Set(files)
    const cargo = files.filter((file) => file === "Cargo.toml" || file.endsWith("/Cargo.toml"))
    const state: Counters = { refs: 0, globs: 0 }
    for (const manifest of manifests) {
      const failed = checkManifest(manifest, listed, cargo, state)
      if (failed) return failed
    }
    }
}

type Counters = { refs: number; globs: number }

const REF_CAP = 4096
const GLOB_CAP = 128
const PATH_CAP = 2048
const DEP_KEYS = ["dependencies", "dev-dependencies", "build-dependencies"] as const
const SOURCE_ARRAYS = ["bin", "test", "bench", "example"] as const

function refusal(status: ReviewLocalCargoPaths.Refusal["status"], reason: string): ReviewLocalCargoPaths.Refusal {
  return { status, reason }
}

const invalid = (): ReviewLocalCargoPaths.Refusal => refusal("acquisition-error", "cargo-manifest-invalid")

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const isRefusal = (value: string | ReviewLocalCargoPaths.Refusal): value is ReviewLocalCargoPaths.Refusal => typeof value !== "string"

function spend(state: Counters, kind: "refs" | "globs"): ReviewLocalCargoPaths.Refusal | undefined {
  state[kind] += 1
  const cap = kind === "refs" ? REF_CAP : GLOB_CAP
  if (state[kind] > cap) return refusal("not-run", "cargo-manifest-budget")
}

function lexical(raw: string): ReviewLocalCargoPaths.Refusal | undefined {
  if (raw.includes("\0") || raw.includes("\\") || raw.startsWith("/") || /^[A-Za-z]:/.test(raw)) {
    return refusal("not-run", "cargo-path-outside")
  }
}

function dirname(file: string): string | ReviewLocalCargoPaths.Refusal {
  const outside = lexical(file)
  if (outside) return outside
  if (file.split("/").includes("..")) return refusal("not-run", "cargo-path-outside")
  if (Buffer.byteLength(file) > PATH_CAP) return refusal("not-run", "cargo-manifest-budget")
  const slash = file.lastIndexOf("/")
  if (slash < 0) return ""
  return file.slice(0, slash)
}

function normalize(baseDir: string, raw: string): string | ReviewLocalCargoPaths.Refusal {
  const outside = lexical(raw)
  if (outside) return outside
  if (raw.length === 0) return invalid()
  if (Buffer.byteLength(raw) > PATH_CAP) return refusal("not-run", "cargo-manifest-budget")
  if (/[*?[\]{}!]/.test(raw)) return refusal("not-run", "cargo-path-unsupported")
  const stack = baseDir === "" ? [] : baseDir.split("/")
  for (const part of raw.split("/")) {
    if (part === "" || part === ".") continue
    if (part === "..") {
      if (stack.length === 0) return refusal("not-run", "cargo-path-outside")
      stack.pop()
      continue
    }
    stack.push(part)
  }
  return stack.join("/")
}

function note(raw: string, baseDir: string, state: Counters): string | ReviewLocalCargoPaths.Refusal {
  const spent = spend(state, "refs")
  if (spent) return spent
  return normalize(baseDir, raw)
}

function cargoFile(dir: string): string {
  return dir === "" ? "Cargo.toml" : `${dir}/Cargo.toml`
}

function checkSource(raw: unknown, baseDir: string, listed: Set<string>, state: Counters): ReviewLocalCargoPaths.Refusal | undefined {
  if (typeof raw !== "string") return invalid()
  const resolved = note(raw, baseDir, state)
  if (isRefusal(resolved)) return resolved
  if (!listed.has(resolved)) return refusal("not-run", "cargo-path-missing")
}

function checkContained(raw: unknown, baseDir: string, state: Counters): ReviewLocalCargoPaths.Refusal | undefined {
  if (typeof raw !== "string") return invalid()
  const resolved = note(raw, baseDir, state)
  if (isRefusal(resolved)) return resolved
}

function inherited(value: unknown): boolean {
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  return keys.length === 1 && keys[0] === "workspace" && value.workspace === true
}

function checkPackagePath(kind: "readme" | "license-file" | "build", value: unknown, baseDir: string, state: Counters): ReviewLocalCargoPaths.Refusal | undefined {
  if ((kind === "build" || kind === "readme") && typeof value === "boolean") return
  if (kind !== "build" && inherited(value)) return
  return checkContained(value, baseDir, state)
}

function checkDepTable(table: unknown, baseDir: string, listed: Set<string>, state: Counters): ReviewLocalCargoPaths.Refusal | undefined {
  if (!isRecord(table)) return invalid()
  for (const name of Object.keys(table)) {
    const entry = table[name]
    if (typeof entry === "string") continue
    if (!isRecord(entry)) return invalid()
    if (!Object.hasOwn(entry, "path")) continue
    if (typeof entry.path !== "string") return invalid()
    const resolved = note(entry.path, baseDir, state)
    if (isRefusal(resolved)) return resolved
    if (!listed.has(cargoFile(resolved))) return refusal("not-run", "cargo-path-missing")
  }
}

function checkTargets(target: unknown, baseDir: string, listed: Set<string>, state: Counters): ReviewLocalCargoPaths.Refusal | undefined {
  if (!isRecord(target)) return invalid()
  for (const cfg of Object.keys(target)) {
    const body = target[cfg]
    if (!isRecord(body)) return invalid()
    for (const key of DEP_KEYS) {
      if (!Object.hasOwn(body, key)) continue
      const failed = checkDepTable(body[key], baseDir, listed, state)
      if (failed) return failed
    }
  }
}

function relativeMember(workspaceDir: string, cargoPath: string): string | undefined {
  const dir = cargoPath === "Cargo.toml" ? "" : cargoPath.slice(0, -"/Cargo.toml".length)
  if (workspaceDir === "") return dir
  if (dir === workspaceDir) return ""
  const prefix = `${workspaceDir}/`
  if (!dir.startsWith(prefix)) return undefined
  return dir.slice(prefix.length)
}

function cleanGlob(pattern: string): string | ReviewLocalCargoPaths.Refusal {
  const parts: string[] = []
  for (const part of pattern.split("/")) {
    if (part === "" || part === ".") continue
    if (part === ".." || part.includes("**") || /[\[\]{}!]/.test(part)) return refusal("not-run", "cargo-path-unsupported")
    parts.push(part)
  }
  if (parts.length === 0) return invalid()
  return parts.join("/")
}

function checkMember(pattern: string, baseDir: string, listed: Set<string>, cargo: ReadonlyArray<string>, state: Counters, requireMatch: boolean): ReviewLocalCargoPaths.Refusal | undefined {
  const spent = spend(state, "refs")
  if (spent) return spent
  if (Buffer.byteLength(pattern) > PATH_CAP) return refusal("not-run", "cargo-manifest-budget")
  const outside = lexical(pattern)
  if (outside) return outside
  if (!/[*?]/.test(pattern)) {
    const resolved = normalize(baseDir, pattern)
    if (isRefusal(resolved)) return resolved
    if (!requireMatch) return undefined
    if (!listed.has(cargoFile(resolved))) return refusal("not-run", "cargo-path-missing")
    return undefined
  }
  const globSpent = spend(state, "globs")
  if (globSpent) return globSpent
  const cleaned = cleanGlob(pattern)
  if (isRefusal(cleaned)) return cleaned
  if (!requireMatch) return undefined
  const glob = new Bun.Glob(cleaned)
  const matched = cargo.some((file) => {
    const relative = relativeMember(baseDir, file)
    return relative !== undefined && relative !== "" && glob.match(relative)
  })
  if (!matched) return refusal("not-run", "cargo-path-missing")
}

function checkMemberList(value: unknown, baseDir: string, listed: Set<string>, cargo: ReadonlyArray<string>, state: Counters, requireMatch: boolean): ReviewLocalCargoPaths.Refusal | undefined {
  if (!Array.isArray(value)) return invalid()
  for (const entry of value) {
    if (typeof entry !== "string") return invalid()
    const failed = checkMember(entry, baseDir, listed, cargo, state, requireMatch)
    if (failed) return failed
  }
}

function checkManifest(manifest: ReviewLocalCargoPaths.Manifest, listed: Set<string>, cargo: ReadonlyArray<string>, state: Counters): ReviewLocalCargoPaths.Refusal | undefined {
  if (typeof manifest.path !== "string" || !isRecord(manifest.value)) return invalid()
  const baseDir = dirname(manifest.path)
  if (isRefusal(baseDir)) return baseDir
  const root = manifest.value
  const hasPackage = Object.hasOwn(root, "package")
  const hasWorkspace = Object.hasOwn(root, "workspace")
  if (!hasPackage && !hasWorkspace) return invalid()
  if (hasPackage) {
    if (!isRecord(root.package)) return invalid()
    if (Object.hasOwn(root.package, "workspace")) {
      if (typeof root.package.workspace !== "string") return invalid()
      const resolved = note(root.package.workspace, baseDir, state)
      if (isRefusal(resolved)) return resolved
      if (!listed.has(cargoFile(resolved))) return refusal("not-run", "cargo-path-missing")
    }
    for (const key of ["readme", "license-file", "build"] as const) {
      if (!Object.hasOwn(root.package, key)) continue
      const failed = checkPackagePath(key, root.package[key], baseDir, state)
      if (failed) return failed
    }
  }
  if (Object.hasOwn(root, "lib")) {
    if (!isRecord(root.lib)) return invalid()
    if (Object.hasOwn(root.lib, "path")) {
      const failed = checkSource(root.lib.path, baseDir, listed, state)
      if (failed) return failed
    }
  }
  for (const key of SOURCE_ARRAYS) {
    if (!Object.hasOwn(root, key)) continue
    if (!Array.isArray(root[key])) return invalid()
    for (const entry of root[key]) {
      if (!isRecord(entry)) return invalid()
      if (!Object.hasOwn(entry, "path")) continue
      const failed = checkSource(entry.path, baseDir, listed, state)
      if (failed) return failed
    }
  }
  for (const key of DEP_KEYS) {
    if (!Object.hasOwn(root, key)) continue
    const failed = checkDepTable(root[key], baseDir, listed, state)
    if (failed) return failed
  }
  if (Object.hasOwn(root, "target")) {
    const failed = checkTargets(root.target, baseDir, listed, state)
    if (failed) return failed
  }
  if (Object.hasOwn(root, "patch")) {
    if (!isRecord(root.patch)) return invalid()
    for (const table of Object.values(root.patch)) {
      const failed = checkDepTable(table, baseDir, listed, state)
      if (failed) return failed
    }
  }
  if (Object.hasOwn(root, "replace")) {
    const failed = checkDepTable(root.replace, baseDir, listed, state)
    if (failed) return failed
  }
  if (!hasWorkspace) return undefined
  if (!isRecord(root.workspace)) return invalid()
  if (Object.hasOwn(root.workspace, "package")) {
    if (!isRecord(root.workspace.package)) return invalid()
    for (const key of ["readme", "license-file"] as const) {
      if (!Object.hasOwn(root.workspace.package, key)) continue
      if (key === "readme" && typeof root.workspace.package[key] === "boolean") continue
      const failed = checkContained(root.workspace.package[key], baseDir, state)
      if (failed) return failed
    }
  }
  if (Object.hasOwn(root.workspace, "dependencies")) {
    const failed = checkDepTable(root.workspace.dependencies, baseDir, listed, state)
    if (failed) return failed
  }
  if (Object.hasOwn(root.workspace, "members")) {
    const failed = checkMemberList(root.workspace.members, baseDir, listed, cargo, state, true)
    if (failed) return failed
  }
  if (Object.hasOwn(root.workspace, "default-members")) {
    const failed = checkMemberList(root.workspace["default-members"], baseDir, listed, cargo, state, true)
    if (failed) return failed
  }
  if (Object.hasOwn(root.workspace, "exclude")) return checkMemberList(root.workspace.exclude, baseDir, listed, cargo, state, false)
}
