import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

// The desktop server runs the engine under Node (packages/desktop/src/main/server.ts), so engine sources, and core's
// relay modules, use Node builtins only. This scan catches the direct spellings of a Bun runtime API: a member of the
// Bun global, a `bun:` module, the `bun` module and the import.meta fields only Bun defines. It reads raw text,
// comments included, so prose such as "Bun.Glob" is reported too. A spelling it does not know (a computed property, an
// alias) is not caught here; node.test.ts runs the engine under Node and catches what its smoke paths reach.

const root = path.join(import.meta.dir, "..")
const core = path.join(root, "..", "core", "src")
// The Bun side of the `#sqlite` adapter: Node resolves `#sqlite` to sqlite.node.ts and never loads it.
const EXCEPTION = path.join("src", "authoring", "sqlite.bun.ts")
// `Bun.x`, `Bun?.x` and `Bun[x]`, but not a sentence that ends in "Bun.".
const BUN =
  /\bBun\s*(?:\??\.\s*[A-Za-z_$]|\[)|\bglobalThis\s*\??\.\s*Bun\b|\bbun:|["']bun["']|\bimport\.meta\.(?:dir|path|main|file)\b/g

const hits = (text: string) => [...text.matchAll(BUN)].map((match) => match[0])

test("the scan flags every spelling it claims and no Node spelling", () => {
  const planted = [
    `await Bun.file(x).bytes()`,
    `new Bun.CryptoHasher("sha256")`,
    `new Bun\n  .Glob("*")`,
    `Bun["file"](x)`,
    `Bun?.spawn(argv)`,
    `globalThis.Bun.write(x)`,
    `import { Database } from "bun:sqlite"`,
    `import { $ } from "bun"`,
    `await import('bun')`,
    `path.join(import.meta.dir, "x")`,
    `import.meta.path`,
    `if (import.meta.main) run()`,
    `import.meta.file`,
  ]
  expect(planted.filter((line) => hits(line).length !== 1)).toEqual([])
  const clean = [
    `import { readFile } from "node:fs/promises"`,
    `path.join(import.meta.dirname, "x")`,
    `fileURLToPath(import.meta.url)`,
    `import.meta.filename`,
    `// Bun's matcher, ported; bundled like sqlite.bun.ts`,
    `// the desktop server runs this under Node, not Bun.\n// Next line.`,
    `const Bundle = 1; Bundle.size`,
  ]
  expect(clean.flatMap(hits)).toEqual([])
})

test("engine sources and core's relay modules use no Bun runtime API, except the Bun SQLite adapter", () => {
  const engine = readdirSync(path.join(root, "src"), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => path.join("src", file))
  const relay = readdirSync(core)
    .filter((file) => file.startsWith("relay") && file.endsWith(".ts"))
    .map((file) => path.join("..", "core", "src", file))
  // An empty or partial listing is a broken scan, not a clean tree.
  expect(engine).toEqual(
    expect.arrayContaining([path.join("src", "ledger", "chain.ts"), path.join("src", "hook", "glob.ts")]),
  )
  expect(relay).toEqual(expect.arrayContaining([path.join("..", "core", "src", "relay.ts")]))

  // The exception is exactly the `bun` target of `#sqlite`, and it is not stale.
  const imports = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).imports["#sqlite"]
  expect(imports).toEqual({
    bun: "./src/authoring/sqlite.bun.ts",
    node: "./src/authoring/sqlite.node.ts",
    default: "./src/authoring/sqlite.bun.ts",
  })
  expect(hits(readFileSync(path.join(root, EXCEPTION), "utf8"))).toEqual(["bun:"])

  // Whole files, so a spelling split across lines is still one match.
  const offenders = [...engine, ...relay]
    .filter((file) => file !== EXCEPTION)
    .flatMap((file) => {
      const text = readFileSync(path.join(root, file), "utf8")
      return [...text.matchAll(BUN)].map(
        (match) => `${file}:${text.slice(0, match.index).split("\n").length}: ${match[0]}`,
      )
    })
  expect(offenders).toEqual([])
})
