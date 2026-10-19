export * as CodeIndexResolve from "./resolve"

import path from "path"
import { Effect } from "effect"
import type ts from "typescript"
import { CodeIndexGo } from "./go"
import { CodeIndexRust } from "./rust"
import type { CodeIndex } from "./types"

// Import resolution (J2.7), replacing Arsenal onboard/derive.ts resolveSpecifier, which resolved relative paths only.
// TypeScript's own ts.resolveModuleName does the work under each file's nearest tsconfig chain (extends, paths,
// baseUrl, package exports and imports). Workspace packages resolve through a host that maps
// node_modules/<workspace name> onto the workspace directory, so the root package.json workspaces apply even where
// no install linked them. Python resolves by package roots. No import is dropped: a failure keeps its specifier.

export type Resolution = { readonly kind: (typeof CodeIndex.ImportKind)[number]; readonly to?: string }

const PYTHON_ROOTS = ["pyproject.toml", "setup.cfg", "setup.py"]

/** `root` is the absolute repository (or snapshot) directory; paths in and out are repository-relative POSIX. */
export const make = Effect.fn("CodeIndexResolve.make")(function* (root: string) {
  const { default: typescript } = yield* Effect.promise(() => import("typescript"))
  const workspaces = yield* Effect.promise(() => workspaceDirs(root))
  const host = redirectingHost(typescript, root, workspaces)
  const configs = new Map<string, { options: ts.CompilerOptions; cache: ts.ModuleResolutionCache }>()

  const settings = (file: string) => {
    const config = typescript.findConfigFile(path.dirname(file), host.fileExists)
    const key = config ?? ""
    const cached = configs.get(key)
    if (cached) return cached
    const options = withDefaults(typescript, config ? parseConfig(typescript, host, config) : {})
    const created = { options, cache: typescript.createModuleResolutionCache(root, (name) => name, options) }
    configs.set(key, created)
    return created
  }

  const script = (from: string, specifier: string): Resolution => {
    const file = path.join(root, from)
    const config = settings(file)
    const resolved = typescript.resolveModuleName(specifier, file, config.options, host, config.cache).resolvedModule
    const to = resolved ? inside(root, resolved.resolvedFileName) : undefined
    if (specifier.startsWith(".") || specifier.startsWith("/")) return to ? { kind: "relative", to } : { kind: "unresolved" }
    const workspace = [...workspaces.keys()].some((name) => specifier === name || specifier.startsWith(`${name}/`))
    if (to) return { kind: workspace ? "workspace" : "alias", to }
    if (resolved) return { kind: "package" }
    // A bare specifier the repository claims (a workspace name, a paths pattern, a #subpath import) and that does not
    // resolve is a broken local import, not an external package.
    const claimed = workspace || specifier.startsWith("#") || Object.keys(config.options.paths ?? {}).some((pattern) => matches(pattern, specifier))
    return { kind: claimed ? "unresolved" : "package" }
  }

  const python = (from: string, specifier: string): Resolution => {
    const dots = specifier.match(/^\.*/)![0].length
    const rest = specifier.slice(dots).split(".").filter(Boolean)
    const bases = dots > 0
      ? [path.join(root, path.dirname(from), ...Array<string>(dots - 1).fill(".."))]
      : pythonRoots(root, path.join(root, path.dirname(from)), host.fileExists)
    const to = bases.flatMap((base) => {
      const target = path.join(base, ...rest)
      return [`${target}.py`, `${target}.pyi`, path.join(target, "__init__.py"), path.join(target, "__init__.pyi")]
    }).find((candidate) => host.fileExists(candidate) && inside(root, candidate))
    if (to) return { kind: dots > 0 ? "relative" : "alias", to: inside(root, to) }
    return { kind: dots > 0 ? "unresolved" : "package" }
  }

  const go = CodeIndexGo.resolver(root)
  const rust = CodeIndexRust.resolver(root)

  return {
    resolve(from: string, specifier: string): Resolution {
      if (from.endsWith(".go")) return go(from, specifier)
      if (from.endsWith(".rs")) return rust(from, specifier)
      return /\.pyi?$/.test(from) ? python(from, specifier) : script(from, specifier)
    },
  }
})

async function workspaceDirs(root: string) {
  const manifest = await Bun.file(path.join(root, "package.json")).json().catch(() => undefined)
  const declared: unknown = Array.isArray(manifest?.workspaces) ? manifest.workspaces : manifest?.workspaces?.packages
  const patterns = Array.isArray(declared) ? declared.filter((item): item is string => typeof item === "string") : []
  const found = await Promise.all(patterns.map(async (pattern) => {
    const manifests = await Array.fromAsync(new Bun.Glob(`${pattern.replace(/\/$/, "")}/package.json`).scan({ cwd: root, onlyFiles: true }))
    return Promise.all(manifests.map(async (file) => {
      const name = await Bun.file(path.join(root, file)).json().then((item) => item?.name, () => undefined)
      return typeof name === "string" ? [[name, path.join(root, path.dirname(file))] as const] : []
    }))
  }))
  return new Map(found.flat(2))
}

function redirectingHost(typescript: typeof ts, root: string, workspaces: Map<string, string>) {
  const redirect = (file: string) => {
    const normalized = file.replaceAll("\\", "/")
    const at = normalized.lastIndexOf("/node_modules/")
    if (at === -1) return file
    const rest = normalized.slice(at + "/node_modules/".length).split("/")
    const length = rest[0]?.startsWith("@") ? 2 : 1
    const target = workspaces.get(rest.slice(0, length).join("/"))
    return target ? path.join(target, ...rest.slice(length)) : file
  }
  const scopes = new Set([...workspaces.keys()].flatMap((name) => (name.startsWith("@") ? [name.split("/")[0]] : [])))
  const linkParent = (dir: string) => {
    const normalized = dir.replaceAll("\\", "/").replace(/\/$/, "")
    if (workspaces.size > 0 && normalized.endsWith("/node_modules")) return true
    const at = normalized.lastIndexOf("/node_modules/")
    return at !== -1 && scopes.has(normalized.slice(at + "/node_modules/".length))
  }
  const sys = typescript.sys
  return {
    useCaseSensitiveFileNames: sys.useCaseSensitiveFileNames,
    fileExists: (file: string) => sys.fileExists(redirect(file)),
    readFile: (file: string) => sys.readFile(redirect(file)),
    // TypeScript probes node_modules (and node_modules/@scope) before descending; uninstalled ones must still exist.
    directoryExists: (dir: string) => sys.directoryExists(redirect(dir)) || linkParent(dir),
    realpath: (file: string) => (sys.realpath ? sys.realpath(redirect(file)) : redirect(file)),
    getCurrentDirectory: () => root,
    getDirectories: (dir: string) => sys.getDirectories(redirect(dir)),
    // Resolution needs compiler options only; enumerating every project's include set would walk the whole tree.
    readDirectory: () => [],
  }
}

function parseConfig(typescript: typeof ts, host: ts.ParseConfigHost, config: string) {
  const read = typescript.readConfigFile(config, host.readFile)
  if (read.error) return {}
  return typescript.parseJsonConfigFileContent(read.config, host, path.dirname(config), undefined, config).options
}

// A file with no tsconfig, or one whose extends chain is missing, still resolves the way the repository's bundler does.
function withDefaults(typescript: typeof ts, options: ts.CompilerOptions): ts.CompilerOptions {
  const moduleResolution = options.moduleResolution ?? typescript.ModuleResolutionKind.Bundler
  return {
    ...options,
    moduleResolution,
    module: options.module ?? (moduleResolution === typescript.ModuleResolutionKind.Bundler ? typescript.ModuleKind.ESNext : undefined),
    allowJs: options.allowJs ?? true,
    resolveJsonModule: options.resolveJsonModule ?? true,
  }
}

function inside(root: string, file: string) {
  const relative = path.relative(root, file).replaceAll("\\", "/")
  if (relative.startsWith("../") || relative === ".." || path.isAbsolute(relative) || relative.split("/").includes("node_modules")) return undefined
  return relative
}

function matches(pattern: string, specifier: string) {
  const star = pattern.indexOf("*")
  if (star === -1) return pattern === specifier
  return specifier.startsWith(pattern.slice(0, star)) && specifier.endsWith(pattern.slice(star + 1))
}

// The nearest ancestor holding a Python project file is the project root (else the repository root); its `src/`
// layout is tried before the root itself.
function pythonRoots(root: string, dir: string, exists: (file: string) => boolean): string[] {
  const project = PYTHON_ROOTS.some((name) => exists(path.join(dir, name)))
  if (project || path.relative(root, dir) === "" || path.relative(root, dir).startsWith("..")) {
    const base = project ? dir : root
    return [path.join(base, "src"), base]
  }
  return pythonRoots(root, path.dirname(dir), exists)
}
