import { expect } from "bun:test"
import fs from "node:fs/promises"
import { isBuiltin } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import ts from "typescript"

export const trees = {
  backend: {
    "backend-implement/SKILL.md": "---\nname: backend-implement\n---\nRead references/deep/contract.md.\n",
    "backend-implement/references/deep/contract.md": "Exact UTF-8: café, 日本語\n",
    "backend-implement/references/empty.md": "",
  },
  archie: {
    "archie-design/SKILL.md": "---\nname: archie-design\n---\nRead references/architecture.md.\n",
    "archie-design/references/architecture.md": "Design contract\r\n",
  },
}

export async function isolated(run: (cache: string) => Promise<void>) {
  const cache = await fs.mkdtemp(path.join(tmpdir(), "orchestra-packaged-skills-"))
  try {
    await run(cache)
  } finally {
    await fs.rm(cache, { recursive: true, force: true })
  }
}

export async function bundle(entry: string, payload: unknown, outfile: string) {
  const packaged = path.resolve(import.meta.dirname, "../../src/packaged-skills.ts")
  const result = await Bun.build({
    entrypoints: [entry],
    target: "bun",
    format: "esm",
    minify: true,
    define: { ORCHESTRA_PACKAGED_SKILLS: JSON.stringify(payload) },
    plugins: [{
      name: "preserve-real-service-identities",
      setup(build) {
        // Bun can retain the original external specifier despite onResolve returning an absolute path.
        // Rewrite only AST module specifiers, sharing the host's real modules without copying implementations.
        build.onLoad({ filter: /\.ts$/ }, async (args) => {
          if (args.path !== entry && args.path !== packaged) return
          const text = await Bun.file(args.path).text()
          const source = ts.createSourceFile(args.path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
          const edits = source.statements.flatMap((statement) => {
            if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return []
            const specifier = statement.moduleSpecifier
            if (!specifier || !ts.isStringLiteral(specifier) || isBuiltin(specifier.text)) return []
            const resolved = Bun.resolveSync(specifier.text, path.dirname(args.path))
            // Keep entry/self namespace exports and packaged-skills inside this build's define boundary.
            if (resolved === entry || resolved === packaged) return []
            return [{
              start: specifier.getStart(source),
              end: specifier.getEnd(),
              value: JSON.stringify(pathToFileURL(resolved).href),
            }]
          })
          return {
            contents: edits.toReversed().reduce(
              (contents, edit) => contents.slice(0, edit.start) + edit.value + contents.slice(edit.end),
              text,
            ),
            loader: "ts",
          }
        })
        build.onResolve({ filter: /.*/ }, (args) => {
          if (args.path === entry) return
          if (isBuiltin(args.path) || args.path.startsWith("file:")) return { path: args.path, external: true }
          const resolved = Bun.resolveSync(args.path, args.resolveDir)
          if (resolved === entry || resolved === packaged) return { path: resolved }
          throw new Error(`External module specifier was not rewritten: ${args.path}`)
        })
      },
    }],
  })
  expect(result.success, JSON.stringify(result.logs)).toBe(true)
  expect(result.outputs).toHaveLength(1)
  await Bun.write(outfile, result.outputs[0])
}

type SnapshotEntry = {
  path: string
  type: "symlink" | "directory" | "file" | "other"
  device: string
  inode: string
  links: string
  mode: string
  bytes?: string
  link?: string
  names?: string[]
}

// Independent filesystem evidence, not a copy of packaged-tree validation. Symlinks are leaves.
export async function snapshot(root: string, relative = "."): Promise<SnapshotEntry[]> {
  const info = await fs.lstat(root, { bigint: true })
  const entry = {
    path: relative,
    device: String(info.dev),
    inode: String(info.ino),
    links: String(info.nlink),
    mode: String(info.mode),
  }
  if (info.isSymbolicLink()) return [{ ...entry, type: "symlink", link: await fs.readlink(root) }]
  if (info.isFile()) return [{ ...entry, type: "file", bytes: (await fs.readFile(root)).toString("base64") }]
  if (!info.isDirectory()) return [{ ...entry, type: "other" }]
  const names = (await fs.readdir(root)).toSorted()
  return [
    { ...entry, type: "directory", names },
    ...(await Promise.all(names.map((name) => snapshot(path.join(root, name), `${relative}/${name}`)))).flat(),
  ]
}
