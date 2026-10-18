#!/usr/bin/env bun
// Relinks import specifiers after `git mv` and lists the path pins a move leaves behind (plan 70-C' B1, card L3).
// A move map is `{ "moves": [{ "from": "<old repo path>", "to": "<new repo path>" }] }`.
//
// Every import position (static, re-export, `import type`, `import()`, `require()`, `typeof import()`) is resolved
// first in the pre-move tree, where a moved file still sits at its `from` path, the way
// script/check-module-boundaries.ts resolves: relative paths, registry `aliases` such as `@/`, and workspace package
// `exports`, never node_modules. A specifier inside a moved file that resolves only in the post-move tree is a card's
// own edit and stays as written. A rewritten specifier is:
// - relative, without a TypeScript extension, when importer and target share a package after the move, or when the
//   importer belongs to no package and wrote a relative path (an `@/`-style alias survives only in an unmoved importer);
// - `<package name>/<subpath>` when the target lives in another package: the `exports` key that already names the
//   file, otherwise the path under `src/` (flagged, because `script/explicit-exports.ts --write` must add that key).
//
// Pins are text occurrences, outside import positions, of a moved file's repo path, of its package-relative path inside
// the same package, or of a directory whose every file moves. docs/, specs/, bun.lock, script/moves/,
// test-timings.json and boundary-ledger.json are not scanned: docs and specs are historical records, stale timing keys
// are skipped by test-shard.ts, and `check:boundaries --prune` owns the ledger.
//
// Usage: bun script/move-relink.ts [--root <dir>] --check|--apply <map.json...>  (map paths are relative to the root)
//   --check  prints every rewrite and pin; exits 1 when an affected specifier does not resolve
//   --apply  requires every move to be done, rewrites the specifiers, then prints the remaining pins
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { SOURCE, exportsObject, loadWorkspace, resolveExport, specifiersOf, type Member, type Workspace } from "./module-architecture"

if (import.meta.main) {
  const args = process.argv.slice(2)
  const at = args.indexOf("--root")
  const rest = args.filter((_, index) => at < 0 || (index !== at && index !== at + 1))
  const mode = rest[0]
  const maps = rest.slice(1)
  if ((mode !== "--check" && mode !== "--apply") || maps.length === 0 || (at >= 0 && !args[at + 1])) {
    console.error("usage: move-relink.ts [--root <dir>] --check|--apply <map.json...>")
    process.exit(2)
  }
  const result = relink(at < 0 ? path.resolve(import.meta.dir, "..") : path.resolve(args[at + 1] ?? ""), maps, mode === "--apply")
  result.lines.forEach((line) => console.log(line))
  process.exit(result.code)
}

type Move = { from: string; to: string }
type Rewrite = { file: string; line: number; start: number; end: number; from: string; to: string; exportMissing?: string }

export function relink(root: string, mapFiles: string[], apply: boolean) {
  const moves = readMoves(root, mapFiles)
  const workspace = loadWorkspace(root)
  const listed = new Set(workspace.files)
  moves.forEach((move) => {
    if (listed.has(move.from) && listed.has(move.to)) throw new Error(`MOVE_BOTH_EXIST:${move.from}`)
    if (!listed.has(move.from) && !listed.has(move.to)) throw new Error(`MOVE_SOURCE_MISSING:${move.from}`)
  })
  const pending = moves.filter((move) => listed.has(move.from))
  if (apply && pending.length > 0) throw new Error(`MOVE_NOT_APPLIED:${pending.map((move) => move.from).join(",")}`)
  const toOf = new Map(moves.map((move) => [move.from, move.to]))
  const fromOf = new Map(moves.map((move) => [move.to, move.from]))
  const oldPath = (file: string) => fromOf.get(file) ?? file
  const newPath = (file: string) => toOf.get(file) ?? file
  const oldFiles = new Set(workspace.files.map(oldPath))
  const newFiles = new Set([...oldFiles].map(newPath))
  const rewrites: Rewrite[] = []
  const unresolved: string[] = []
  const spans = new Map<string, [number, number][]>()
  // A specifier that reaches a moved file names its stem, or its directory for an index file, or is a bare "." or "..".
  const tokens = [...new Set(moves.map((move) => path.posix.basename(move.from).startsWith("index.") ? path.posix.basename(path.posix.dirname(move.from)) : path.posix.basename(move.from).replace(/\.[^.]+$/, "")))]
  workspace.files
    .filter((file) => SOURCE.test(file) && !/(^|\/)node_modules\//.test(file))
    .forEach((file) => {
      const importer = oldPath(file)
      const moved = importer !== file || toOf.has(file)
      const text = readFileSync(path.join(root, file), "utf8")
      if (!moved && !tokens.some((token) => text.includes(token)) && !/["'`]\.{1,2}(?:\/\.\.)*\/?["'`]/.test(text)) return
      const found = specifiersOf(file, text).found
      spans.set(file, found.map((item) => [item.start, item.end]))
      found.forEach((item) => {
        const line = lineOf(text, item.start)
        const old = resolve(workspace, oldFiles, importer, item.specifier)
        const packaged = !item.specifier.startsWith(".") && !aliasOf(workspace.memberOf(importer), item.specifier)
        if (!old && moved && !packaged && !resolve(workspace, newFiles, newPath(importer), item.specifier))
          return unresolved.push(`UNRESOLVED ${file}:${line} ${item.specifier}`)
        if (!old || (!moved && !toOf.has(old.path))) return
        // A package specifier from a moved file to a file that stays in another package is still valid as written.
        if (!toOf.has(old.path) && packaged && workspace.memberOf(newPath(importer)) !== workspace.memberOf(old.path)) return
        const next = render(workspace, { original: item.specifier, packaged, moved }, newPath(importer), newPath(old.path), old.how)
        if (!next || next.specifier === item.specifier) return
        const check = next.exportMissing ? undefined : resolve(workspace, newFiles, newPath(importer), next.specifier)
        if (!next.exportMissing && check?.path !== newPath(old.path))
          return unresolved.push(`MISMATCH ${file}:${line} ${item.specifier} -> ${next.specifier}`)
        rewrites.push({ file, line, start: item.start, end: item.end, from: item.specifier, to: next.specifier, exportMissing: next.exportMissing })
      })
    })
  const pins = findPins(root, workspace, moves, oldFiles, spans)
  const lines = [
    ...unresolved,
    ...rewrites.map((item) => `REWRITE ${item.file}:${item.line} ${item.from} -> ${item.to}${item.exportMissing ? ` [needs export key in ${item.exportMissing}]` : ""}`),
    ...pins.map((pin) => `PIN ${pin}`),
  ]
  if (apply && unresolved.length === 0) write(root, rewrites)
  const summary =
    `move-relink: ${moves.length} moves, ${rewrites.length} rewrites (${rewrites.filter((item) => item.exportMissing).length} need export keys), ` +
    `${pins.length} pins, ${unresolved.length} unresolved${apply ? (unresolved.length === 0 ? ", written" : ", nothing written") : ""}`
  return { code: unresolved.length > 0 ? 1 : 0, lines: [...lines, summary], rewrites, pins, unresolved }
}

function readMoves(root: string, mapFiles: string[]) {
  const moves = mapFiles.flatMap((file) => {
    const value: unknown = JSON.parse(readFileSync(path.resolve(root, file), "utf8"))
    const list = value && typeof value === "object" && "moves" in value && Array.isArray(value.moves) ? (value.moves as unknown[]) : undefined
    if (!list) throw new Error(`MOVE_MAP_INVALID:${file}`)
    return list.map((item) => {
      const move = item as Partial<Move>
      if (typeof move.from !== "string" || typeof move.to !== "string" || !move.from || !move.to || move.from === move.to)
        throw new Error(`MOVE_MAP_INVALID:${file}`)
      return { from: normalize(move.from), to: normalize(move.to) }
    })
  })
  if (moves.length === 0) throw new Error("MOVE_MAP_EMPTY")
  const duplicate = [...moves.map((move) => move.from), ...moves.map((move) => move.to)].find((item, index, all) => all.indexOf(item) !== index)
  if (duplicate) throw new Error(`MOVE_MAP_DUPLICATE:${duplicate}`)
  return moves
}

function normalize(file: string) {
  return path.posix.normalize(file.replaceAll("\\", "/")).replace(/^\.\//, "")
}

function aliasOf(member: Member | undefined, specifier: string) {
  return Object.entries(member?.spec.aliases ?? {}).find(([prefix]) => specifier.startsWith(prefix))
}

/** Resolves like check-module-boundaries `resolveEdge`, against `files`; `how` records the specifier's spelling. */
function resolve(workspace: Workspace, files: Set<string>, file: string, specifier: string) {
  const stem = (target: string) => {
    const source = target.replace(/\.([cm]?)js(x?)$/, ".$1ts$2")
    const candidates = [
      [target, "exact"], [`${target}.ts`, "ext"], [`${target}.tsx`, "ext"], [`${target}/index.ts`, "index"],
      [`${target}/index.tsx`, "index"], [source, "js"], [source.replace(/\.ts$/, ".tsx"), "js"],
    ] as const
    const hit = candidates.find(([candidate]) => files.has(candidate))
    return hit ? { path: hit[0], how: hit[1] } : undefined
  }
  if (specifier.startsWith(".")) return stem(path.posix.join(path.posix.dirname(file), specifier))
  const member = workspace.memberOf(file)
  const alias = aliasOf(member, specifier)
  if (member && alias) return stem(`${member.path}/${alias[1]}${specifier.slice(alias[0].length)}`)
  const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : (specifier.split("/")[0] ?? specifier)
  const to = workspace.members.find((item) => item.name === name)
  if (!to) return undefined
  const subpath = specifier === name ? "." : `./${specifier.slice(name.length + 1)}`
  if (to.manifest.exports === undefined) return stem(path.posix.join(to.path, subpath === "." ? (to.manifest.main ?? "index.js") : subpath))
  const hit = resolveExport(to.manifest.exports, subpath)
  const found = hit ? stem(path.posix.join(to.path, hit.target)) : undefined
  // The extension belongs to the `exports` target, not to the specifier.
  return found && { path: found.path, how: /\/index\.tsx?$/.test(found.path) ? "index" : "ext" }
}

function render(workspace: Workspace, item: { original: string; packaged: boolean; moved: boolean }, importer: string, target: string, how: string) {
  const from = workspace.memberOf(importer)
  const to = workspace.memberOf(target)
  if (to && (from ? from !== to : item.packaged)) return packageSpecifier(to, target)
  if (item.packaged && !from) return undefined
  const body = spelled(target, how)
  const alias = item.moved ? undefined : aliasOf(from, item.original)
  const root = alias && from ? `${from.path}/${alias[1]}` : undefined
  if (alias && root && body.startsWith(root)) return { specifier: `${alias[0]}${body.slice(root.length)}`, exportMissing: undefined }
  const relative = path.posix.relative(path.posix.dirname(importer), body)
  return { specifier: relative.startsWith(".") ? relative : `./${relative}`, exportMissing: undefined }
}

/** Keeps the original spelling: an explicit extension stays, `.js` for a `.ts` source stays, a directory stays a directory. */
function spelled(target: string, how: string) {
  if (how === "exact") return target
  if (how === "js") return target.replace(/\.([cm]?)ts(x?)$/, ".$1js$2")
  if (how === "index" && /\/index\.tsx?$/.test(target)) return path.posix.dirname(target)
  return target.replace(/\.tsx?$/, "")
}

function packageSpecifier(member: Member, target: string) {
  const key = Object.keys(exportsObject(member.manifest.exports))
    .filter((candidate) => !candidate.includes("*"))
    .find((candidate) => {
      const hit = resolveExport(member.manifest.exports, candidate)
      return hit !== undefined && path.posix.join(member.path, hit.target) === target
    })
  if (key) return { specifier: key === "." ? member.name : `${member.name}/${key.slice(2)}`, exportMissing: undefined }
  const subpath = path.posix
    .relative(member.path, target)
    .replace(/^src\//, "")
    .replace(/\.tsx?$/, "")
    .replace(/(^|\/)index$/, "")
  const hit = resolveExport(member.manifest.exports, subpath ? `./${subpath}` : ".")
  const reached = hit !== undefined && [hit.target, `${hit.target}.ts`, `${hit.target}.tsx`].some((item) => path.posix.join(member.path, item) === target)
  return { specifier: subpath ? `${member.name}/${subpath}` : member.name, exportMissing: reached ? undefined : member.name }
}

function findPins(root: string, workspace: Workspace, moves: Move[], oldFiles: Set<string>, spans: Map<string, [number, number][]>) {
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const moved = new Set(moves.map((move) => move.from))
  const dirs = [...new Set(moves.flatMap((move) => move.from.split("/").slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join("/"))))]
    .filter((dir) => [...oldFiles].every((file) => !file.startsWith(`${dir}/`) || moved.has(file)))
  const needles = [
    ...moves.flatMap((move) => {
      const stem = move.from.replace(/\.[^./]+$/, "")
      const ext = escape(move.from.slice(stem.length))
      const member = workspace.memberOf(move.from)
      const local = member ? stem.slice(member.path.length + 1) : undefined
      return [
        { literal: stem, pattern: new RegExp(`(?<![\\w-])${escape(stem)}(?:${ext})?(?![\\w.-])`, "g"), scope: undefined },
        ...(member && local ? [{ literal: local, pattern: new RegExp(`(?<![\\w-])${escape(local)}(?:${ext})?(?![\\w.-])`, "g"), scope: member.path }] : []),
      ]
    }),
    ...dirs.flatMap((dir) => {
      const member = workspace.memberOf(dir)
      const local = member && dir.startsWith(`${member.path}/`) ? dir.slice(member.path.length + 1) : undefined
      return [
        { literal: dir, pattern: new RegExp(`(?<![\\w-])${escape(dir)}(?![\\w.-])`, "g"), scope: undefined },
        ...(member && local ? [{ literal: local, pattern: new RegExp(`(?<![\\w-])${escape(local)}(?![\\w.-])`, "g"), scope: member.path }] : []),
      ]
    }),
  ]
  return workspace.files
    .filter((file) => !/(^|\/)(node_modules|docs|specs)\//.test(file) && !/(^|\/)(bun\.lock|test-timings\.json|boundary-ledger\.json)$/.test(file) && !file.startsWith("script/moves/"))
    .flatMap((file) => {
      const bytes = readFileSync(path.join(root, file))
      if (bytes.length > 4_000_000 || bytes.subarray(0, 8000).includes(0)) return []
      const text = bytes.toString("utf8")
      const imports = spans.get(file) ?? []
      const hits = needles
        .filter((needle) => (!needle.scope || file.startsWith(`${needle.scope}/`)) && text.includes(needle.literal))
        .flatMap((needle) => [...text.matchAll(needle.pattern)].map((match) => [match.index, match.index + match[0].length] as const))
        .filter(([start, end]) => !imports.some(([from, to]) => start < to && end > from))
        .sort((a, b) => a[0] - b[0] || b[1] - a[1])
        .filter(([start, end], index, all) => !all.slice(0, index).some(([from, to]) => from <= start && to >= end))
      return hits.map(([start, end]) => `${file}:${lineOf(text, start)} ${text.slice(start, end)}`)
    })
}

function write(root: string, rewrites: Rewrite[]) {
  const files = [...new Set(rewrites.map((item) => item.file))]
  files.forEach((file) => {
    const text = rewrites
      .filter((item) => item.file === file)
      .sort((a, b) => b.start - a.start)
      .reduce((current, item) => current.slice(0, item.start) + item.to + current.slice(item.end), readFileSync(path.join(root, file), "utf8"))
    writeFileSync(path.join(root, file), text)
  })
}

function lineOf(text: string, offset: number) {
  return text.slice(0, offset).split("\n").length
}
