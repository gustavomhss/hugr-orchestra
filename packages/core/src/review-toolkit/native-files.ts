export * as ReviewNativeFiles from "./native-files"

import { constants } from "node:fs"
import { access, lstat, realpath } from "node:fs/promises"
import { posix, win32 } from "node:path"
import { Effect } from "effect"
import { Probe } from "../research-toolkit/probe/types"

// Physical preflight for a native scanner. Not an atomic seal: another same-uid process can replace a
// file after this check and before the scanner opens it. Paths are literal arguments, never a shell or a glob.

export function flavor(root: string) {
  return /^[A-Za-z]:[\\/]/.test(root) || root.startsWith("\\\\") || root.startsWith("//") ? win32 : posix
}

// Flavor from the root spelling, then that flavor's separators. A posix backslash is a filename character.
export function containedPath(root: string, value: string) {
  if (!root || !value || value.includes("\0") || root.includes("\0")) return undefined
  if (/^[A-Za-z]:(?![\\/])/.test(value) || /^[A-Za-z]:(?![\\/])/.test(root)) return undefined
  const path = flavor(root)
  if (parts(value, path).includes("..") || parts(root, path).includes("..")) return undefined
  if (!path.isAbsolute(root)) return undefined
  const resolvedRoot = path.resolve(root)
  const resolvedFile = path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value)
  const relative = path.relative(resolvedRoot, resolvedFile)
  if (!relative || path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) return undefined
  return path === win32 ? relative.replaceAll("\\", "/") : relative
}

export const select = (input: {
  readonly root: string
  readonly files: ReadonlyArray<string>
  readonly extensions: ReadonlyArray<string>
}) => Effect.promise(async () => {
  try {
    return await selectFiles(input)
  } catch (error) {
    return refuse("not-run", named(error, "fs-error"))
  }
})

async function selectFiles(input: {
  readonly root: string
  readonly files: ReadonlyArray<string>
  readonly extensions: ReadonlyArray<string>
}) {
  const lexical = refuseLexical(input)
  if (lexical) return lexical
  const root = await canonicalRoot(input.root)
  if (root.status !== "ok") return root
  const path = flavor(input.root)
  const projected = unique(input.files.flatMap((file) => {
    const relative = containedPath(input.root, file)
    return relative ? [project(root.canonical, relative, path)] : []
  }))
  if (input.files.some((file) => !containedPath(input.root, file))) return refuse("not-run", "path-outside")
  // Guard precedence: projected canonical arguments can exceed the bound before any candidate is stated.
  if (argvBytes(projected) > Probe.Limits.outputBytes) return refuse("not-run", "argv-bound")
  const chosen: string[] = []
  for (const file of input.files) {
    const relative = containedPath(input.root, file)
    if (!relative) return refuse("not-run", "path-outside")
    const physical = await selected(root.canonical, relative, path)
    if (typeof physical !== "string") return physical
    chosen.push(physical)
  }
  const files = unique(chosen)
  // Bound the walked canonical arguments actually returned. Leaf realpath is not part of that name.
  if (argvBytes(files) > Probe.Limits.outputBytes) return refuse("not-run", "argv-bound")
  return { status: "ok" as const, files }
}

function refuseLexical(input: {
  readonly root: string
  readonly files: ReadonlyArray<string>
  readonly extensions: ReadonlyArray<string>
}) {
  if (input.files.length === 0) return refuse("not-run", "no-input")
  if (unverified(input.root) || input.files.some(unverified)) return refuse("unsupported", "glob-literal-unverified")
  if (flavor(input.root) !== nativeFlavor()) return refuse("unsupported", "nonnative-root")
  if (input.root.includes("\0") || input.files.some((file) => file.includes("\0"))) return refuse("not-run", "nul")
  const path = flavor(input.root)
  for (const file of input.files) {
    if (path.sep === "\\" ? /[\\/]$/.test(file) : file.endsWith("/")) return refuse("not-run", "directory")
    if (parts(file, path).includes("..") || parts(input.root, path).includes("..") || !containedPath(input.root, file))
      return refuse("not-run", "path-outside")
    if (!input.extensions.some((extension) => path.basename(file).endsWith(extension))) return refuse("not-run", "wrong-extension")
  }
  // Cheap spelling guard. The returned canonical arguments are bounded again after projection and realpath.
  if (argvBytes(input.files) > Probe.Limits.outputBytes) return refuse("not-run", "argv-bound")
  return undefined
}

function nativeFlavor() {
  return process.platform === "win32" ? win32 : posix
}

function unverified(value: string) {
  const head = value.slice(0, 4).replaceAll("/", "\\")
  return head === "\\\\?\\" || head === "\\\\.\\"
}

function parts(value: string, path: typeof posix) {
  return value.split(path === win32 ? /[\\/]/ : /\//)
}

async function canonicalRoot(root: string) {
  const canonical = await realpath(root).catch((error: NodeJS.ErrnoException) => error)
  if (canonical instanceof Error) return refuse("not-run", named(canonical, "root-missing"))
  const info = await lstat(canonical).catch((error: NodeJS.ErrnoException) => error)
  if (info instanceof Error) return refuse("not-run", named(info, "root-missing"))
  if (!info.isDirectory()) return refuse("not-run", "root-not-directory")
  return { status: "ok" as const, canonical }
}

async function selected(root: string, relative: string, path: typeof posix) {
  let cursor = root
  let info: Awaited<ReturnType<typeof lstat>> | undefined
  for (const segment of relative.split("/")) {
    if (!segment || segment === ".") continue
    cursor = path.join(cursor, segment)
    const stat = await lstat(cursor).catch((error: NodeJS.ErrnoException) => error)
    if (stat instanceof Error) return refuse("not-run", named(stat, "missing"))
    if (stat.isSymbolicLink()) return refuse("unsupported", "symlink")
    info = stat
  }
  if (!info) return refuse("not-run", "missing")
  if (info.isDirectory()) return refuse("not-run", "directory")
  if (!info.isFile()) return refuse("not-run", "not-file")
  // The walk already rejected every symlink, so this cursor is canonical by components. Leaf realpath
  // reinterprets a POSIX backslash as a separator and reports ENOENT for a regular file that lstat sees.
  if (!inside(root, cursor)) return refuse("not-run", "path-outside")
  const opened = await readable(cursor)
  if (opened) return refuse("not-run", opened)
  return cursor
}

function inside(root: string, file: string) {
  const path = nativeFlavor()
  const relative = path.relative(root, file)
  return relative.length > 0 && !path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`)
}

function named(error: unknown, missing: string) {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined
  if (code === "ENOENT") return missing
  if (code === "EACCES" || code === "EPERM") return "unreadable"
  return `fs-${code ?? "error"}`
}

async function readable(file: string) {
  const opened = await access(file, constants.R_OK).then(() => undefined, (error: NodeJS.ErrnoException) => error)
  if (!opened) return undefined
  return named(opened, "missing")
}

function project(root: string, relative: string, path: typeof posix) {
  let cursor = root
  for (const segment of relative.split("/")) {
    if (!segment || segment === ".") continue
    cursor = path.join(cursor, segment)
  }
  return cursor
}

function argvBytes(files: ReadonlyArray<string>) {
  return files.reduce((sum, file) => sum + Buffer.byteLength(file) + 1, 0)
}

function unique(files: ReadonlyArray<string>) {
  return [...new Set(files)].sort(order)
}

function refuse(status: "not-run" | "unsupported", reason: string) {
  return { status, reason }
}

function order(left: string, right: string) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
