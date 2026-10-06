#!/usr/bin/env bun
// Backend toolkit pack scaffold (ruling M6-1). From packages/core:
//   bun script/toolkit-pack.ts add <id> --kind <binary|npm|pip|jar|go-source|cargo-source> --upstream <owner/repo|npm-name|pypi-name>
//     --version <v> [--asset '<target>=<glob>' ...] [--role generator|check] [--input <text>] [--skill <entry-skill> ...]
//   bun script/toolkit-pack.ts bump <id> <version>
// `add` writes packs/<id>.ts, a recipe stub with the card headings, the barrel import and entry. `binary` pins each
// target to the GitHub release asset matching its --asset glob (sha256 from the release API's digest); `npm` reads
// license, bin and dist.integrity from the registry and writes the lock with `npm install --package-lock-only`.
// `bump` moves the version in the pack and its recipe and refills those pins the same way. Every pin it cannot fill
// becomes TODO-PIN, which test/backend-toolkit-packs.test.ts rejects. Both commands regenerate the recipe index.
// Then: check the entry layout against a downloaded sample, finish the recipe, run bun typecheck and the toolkit tests.

import { $ } from "bun"
import { mkdtemp, readFile, rm, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { parseArgs } from "util"
import type { EntrySkill, Pack } from "../src/backend-toolkit/manifest"
import { TARGETS } from "../src/backend-toolkit/target"

const PACKS = path.join(import.meta.dir, "../src/backend-toolkit/packs")
const RECIPES = path.join(
  import.meta.dir,
  "../../backend-specialist/skills/backend-implement/references/recipes/external",
)
const SKILLS: ReadonlyArray<EntrySkill> = [
  "backend-implement",
  "backend-api",
  "backend-data",
  "backend-concurrency",
  "backend-refactor",
  "backend-check",
]

const args = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    kind: { type: "string" },
    upstream: { type: "string" },
    version: { type: "string" },
    asset: { type: "string", multiple: true },
    role: { type: "string" },
    input: { type: "string" },
    skill: { type: "string", multiple: true },
  },
})
const [command, id, bumped] = args.positionals

const valid =
  (command === "add" && args.values.kind && args.values.upstream && args.values.version) ||
  (command === "bump" && bumped)
if (!valid || !id) {
  console.error("usage: see the header of script/toolkit-pack.ts")
  process.exit(1)
}
if (command === "add") await add(id)
if (command === "bump") await bump(id, bumped!)
await writeIndex()

async function add(id: string) {
  const kind = args.values.kind!
  const upstream = args.values.upstream!
  const version = args.values.version!
  const fit = {
    role: args.values.role ?? "generator",
    input: args.values.input ?? "TODO-PIN",
    skills: args.values.skill ?? [],
  }
  const body = await template(id, kind, upstream, version)
  await writeFile(
    path.join(PACKS, `${id}.ts`),
    [
      `import type { Pack } from "../manifest"`,
      ...(kind === "npm" ? [`import lock from "./${id}.package-lock.json"`] : []),
      "",
      `const VERSION = "${version}"`,
      "",
      "export default {",
      `  id: "${id}",`,
      "  version: VERSION,",
      body,
      `  fit: { role: ${JSON.stringify(fit.role)}, input: ${JSON.stringify(fit.input)}, skills: ${JSON.stringify(fit.skills)} },`,
      "} as const satisfies Pack",
      "",
    ].join("\n"),
  )
  await writeFile(path.join(RECIPES, `${id}.md`), recipe(id, version))
  const name = id.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase())
  const barrel = await readFile(path.join(PACKS, "index.ts"), "utf8")
  const imports = [...barrel.matchAll(/^import .*$/gm)].map((match) => match[0])
  await writeFile(
    path.join(PACKS, "index.ts"),
    barrel
      .replace(imports.join("\n"), [...imports, `import ${name} from "./${id}"`].toSorted().join("\n"))
      .replace(/\n}\n*$/, `\n  [${name}.id]: ${name},\n}\n`),
  )
  console.log(`wrote packs/${id}.ts, recipes/external/${id}.md and the barrel entry; fill every TODO-PIN`)
}

async function bump(id: string, version: string) {
  const file = path.join(PACKS, `${id}.ts`)
  const pack: Pack = (await import(file)).default
  const old = pack.version
  const text = (await readFile(file, "utf8")).replaceAll(`"${old}"`, `"${version}"`)
  const pins = "targets" in pack ? Object.values(pack.targets).map((pin) => pin.artifact) : []
  const filled = await Promise.all(
    pins.map(async (artifact) => ({
      from: artifact.integrity,
      to: await digest(artifact.url.replaceAll(old, version), version),
    })),
  )
  const npm = !("targets" in pack) && pack.install.kind === "npm"
  // A pin this script cannot refresh is cleared, so the old digest can never pass for the new version.
  const next = filled.length
    ? filled.reduce((current, pin) => current.replaceAll(pin.from, pin.to), text)
    : npm
      ? text
      : `// TODO-PIN: refresh every pin for ${version}.\n` +
        text.replace(/"sha(256|512)-[A-Za-z0-9+/=]+"/g, '"sha256-TODO-PIN"')
  await writeFile(file, next)
  if (npm) await lock(id, packageName(pack), version)
  const card = path.join(RECIPES, `${id}.md`)
  if (pack.fit.skills.length)
    await writeFile(card, (await readFile(card, "utf8")).replaceAll(`\`${old}\``, `\`${version}\``))
  console.log(`bumped ${id} ${old} -> ${version}; review the diff and fill any TODO-PIN`)
}

async function template(id: string, kind: string, upstream: string, version: string) {
  const at = (text: string) => text.replaceAll(version, "${VERSION}")
  if (kind === "binary") {
    const release = await github(upstream, version)
    const globs = new Map((args.values.asset ?? []).map((pair) => pair.split("=", 2) as [string, string]))
    const repo = (await fetch(`https://api.github.com/repos/${upstream}`, { headers: auth() }).then((response) =>
      response.json(),
    )) as { license?: { spdx_id?: string } }
    const targets = TARGETS.map((target) => {
      const glob = globs.get(target)
      const asset = glob ? release.assets.find((item) => new Bun.Glob(glob).match(item.name)) : undefined
      const exe = target === "win32-x64" ? `${id}.exe` : id
      const format = asset?.name.endsWith(".zip")
        ? "zip"
        : /\.(tar\.gz|tgz)$/.test(asset?.name ?? "")
          ? "tar.gz"
          : "raw"
      return [
        `    "${target}": {`,
        "      artifact: {",
        `        url: \`${asset ? at(asset.browser_download_url) : "https://github.com/TODO-PIN"}\`,`,
        `        integrity: "${asset?.digest ? sri(asset.digest) : "sha256-TODO-PIN"}",`,
        `        format: "${format}",`,
        `        entries: [{ from: "${format === "raw" ? (asset?.name ?? exe) : exe}", to: "${exe}", executable: true }],`,
        "      },",
        `      executable: "${exe}",`,
        "    },",
      ].join("\n")
    })
    return [
      `  license: "${repo.license?.spdx_id ?? "TODO-PIN"}",`,
      `  upstream: "${upstream}",`,
      "  // Asset digests from the GitHub release API; check each entry layout against a downloaded sample.",
      "  targets: {",
      ...targets,
      "  },",
    ].join("\n")
  }
  if (kind === "npm") {
    const meta = (await fetch(`https://registry.npmjs.org/${upstream}/${version}`).then((response) =>
      response.json(),
    )) as NpmVersion
    const bin = typeof meta.bin === "string" ? meta.bin : Object.values(meta.bin ?? {})[0]
    await lock(id, upstream, version)
    return [
      `  license: "${meta.license ?? "TODO-PIN"}",`,
      `  upstream: "${meta.repository?.url?.match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1] ?? "TODO-PIN"}",`,
      '  runtime: "node",',
      "  install: {",
      '    kind: "npm",',
      `    packageJson: JSON.stringify({ name: "backend-toolkit-${id}", private: true, dependencies: { "${upstream}": VERSION } }, null, 2) + "\\n",`,
      '    lock: JSON.stringify(lock, null, 2) + "\\n",',
      "  },",
      `  launch: ["{install}/node_modules/${upstream}/${String(bin ?? "TODO-PIN").replace(/^\.\//, "")}"],`,
    ].join("\n")
  }
  const install = {
    pip: [
      '  runtime: "python",',
      `  install: { kind: "pip", requirements: \`${upstream}==\${VERSION} --hash=sha256:TODO-PIN\\n\` },`,
      '  launch: ["-m", "TODO-PIN"],',
      '  env: { PYTHONPATH: "{install}", PYTHONSAFEPATH: "1", PYTHONNOUSERSITE: "1" },',
    ],
    jar: [
      '  runtime: "java",',
      "  install: {",
      '    kind: "jar",',
      `    artifact: { url: \`https://repo1.maven.org/maven2/TODO-PIN/\${VERSION}/${id}-\${VERSION}.jar\`, integrity: "sha256-TODO-PIN", format: "raw", entries: [{ from: \`${id}-\${VERSION}.jar\`, to: "${id}.jar" }] },`,
      "  },",
      `  launch: ["-jar", "{install}/${id}.jar"],`,
    ],
    "go-source": [
      '  runtime: "go",',
      "  install: {",
      '    kind: "source",',
      `    artifact: { url: \`https://proxy.golang.org/github.com/${upstream.toLowerCase()}/@v/v\${VERSION}.zip\`, integrity: "sha256-TODO-PIN", format: "zip", entries: [{ from: "TODO-PIN", to: "src/TODO-PIN" }] },`,
      `    build: "go",`,
      '    path: "./cmd/TODO-PIN",',
      `    binary: "${id}",`,
      "  },",
      "  launch: [],",
    ],
    "cargo-source": [
      '  runtime: "rust",',
      "  install: {",
      '    kind: "source",',
      `    artifact: { url: \`https://static.crates.io/crates/${id}/${id}-\${VERSION}.crate\`, integrity: "sha256-TODO-PIN", format: "tar.gz", entries: [{ from: "TODO-PIN", to: "src/TODO-PIN" }] },`,
      `    build: "cargo",`,
      '    path: ".",',
      `    binary: "${id}",`,
      "  },",
      "  launch: [],",
    ],
  }[kind]
  if (!install) throw new Error(`unknown kind ${kind}`)
  return ['  license: "TODO-PIN",', `  upstream: "${kind === "pip" ? "TODO-PIN" : upstream}",`, ...install].join("\n")
}

/** The SRI digest of one pinned download, from its GitHub release or the npm registry; TODO-PIN for any other host. */
async function digest(url: string, version: string) {
  const parsed = new URL(url)
  const release = parsed.pathname.match(/^\/([^/]+\/[^/]+)\/releases\/download\/[^/]+\/(.+)$/)
  if (parsed.hostname === "github.com" && release) {
    const asset = (await github(release[1], version)).assets.find(
      (item) => item.name === decodeURIComponent(release[2]),
    )
    return asset?.digest ? sri(asset.digest) : "sha256-TODO-PIN"
  }
  const tarball = parsed.pathname.match(/^\/((?:@[^/]+\/)?[^/]+)\/-\//)
  if (parsed.hostname === "registry.npmjs.org" && tarball) {
    const meta = (await fetch(`https://registry.npmjs.org/${tarball[1]}/${version}`).then((response) =>
      response.json(),
    )) as NpmVersion
    return meta.dist?.integrity ?? "sha256-TODO-PIN"
  }
  return "sha256-TODO-PIN"
}

async function github(repo: string, version: string) {
  const tagged = await fetch(`https://api.github.com/repos/${repo}/releases/tags/v${version}`, { headers: auth() })
  if (tagged.ok) return (await tagged.json()) as Release
  const bare = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${version}`, { headers: auth() })
  if (bare.ok) return (await bare.json()) as Release
  return { assets: [] } satisfies Release
}

/** The engine's lock, written by npm from the exact package.json the pack installs. */
async function lock(id: string, name: string, version: string) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "toolkit-pack-"))
  const manifest = JSON.stringify(
    { name: `backend-toolkit-${id}`, private: true, dependencies: { [name]: version } },
    null,
    2,
  )
  await writeFile(path.join(dir, "package.json"), manifest + "\n")
  const result = await $`npm install --package-lock-only --ignore-scripts --no-audit --no-fund`
    .cwd(dir)
    .nothrow()
    .quiet()
  const text =
    result.exitCode === 0
      ? await readFile(path.join(dir, "package-lock.json"), "utf8")
      : '{ "TODO-PIN": "npm failed" }\n'
  await writeFile(path.join(PACKS, `${id}.package-lock.json`), text)
  await rm(dir, { recursive: true, force: true })
}

function packageName(pack: Pack) {
  if ("targets" in pack || pack.install.kind !== "npm") return pack.id
  return Object.keys(JSON.parse(pack.install.packageJson).dependencies)[0]
}

function recipe(id: string, version: string) {
  return [
    `# ${id}`,
    "",
    "## Applicability",
    "",
    `TODO-PIN: when the packet assigns this engine's artifacts. The engine is ${id} \`${version}\`, provided by the host and run only as \`"$BACKEND_TOOLKIT_BIN/${id}"\`.`,
    "",
    "## Non-trigger",
    "",
    "- TODO-PIN",
    "",
    "## Inputs",
    "",
    "- TODO-PIN",
    "",
    "## Steps",
    "",
    "1. TODO-PIN:",
    "   ```sh",
    `   "$BACKEND_TOOLKIT_BIN/${id}" <args>`,
    "   ```",
    "",
    "## Tools and outputs",
    "",
    "- The host fetches the engine on first use; the seat's shell has no network. Never install, download or substitute it.",
    "- When the shell output reports `toolkit-not-ready:...` or `unsupported-target:...`, stop and return a `tool` blocker whose code is that text verbatim.",
    "",
    "## Limits and checks",
    "",
    "- TODO-PIN",
    "",
  ].join("\n")
}

/** The recipe index: one line per pack with a recipe, under each entry skill it serves. */
async function writeIndex() {
  const { ENGINES } = await import(path.join(PACKS, "index.ts"))
  const packs: ReadonlyArray<Pack> = Object.values(ENGINES)
  const groups = SKILLS.flatMap((skill) => {
    const members = packs.filter((pack) => pack.fit.skills.includes(skill)).toSorted((a, b) => a.id.localeCompare(b.id))
    if (!members.length) return []
    return [
      "",
      `### ${skill}`,
      "",
      ...members.map((pack) => `- [${pack.id}](${pack.id}.md): ${pack.fit.role}; input: ${pack.fit.input}.`),
    ]
  })
  await writeFile(
    path.join(RECIPES, "index.md"),
    [
      "# Toolkit engine recipes",
      "",
      "<!-- Generated by packages/core/script/toolkit-pack.ts from the toolkit packs. Do not edit. -->",
      "",
      "## Applicability",
      "",
      "Read one recipe only when the packet assigns that engine's artifacts. Engines are grouped by the entry skill whose work they serve.",
      "",
      "## Tools and outputs",
      ...groups,
      "",
    ].join("\n"),
  )
}

function sri(digest: string) {
  const [algorithm, hex] = digest.split(":")
  return `${algorithm}-${Buffer.from(hex, "hex").toString("base64")}`
}

function auth(): Record<string, string> {
  return process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}
}

type Release = { assets: Array<{ name: string; digest?: string; browser_download_url: string }> }
type NpmVersion = {
  license?: string
  bin?: string | Record<string, string>
  repository?: { url?: string }
  dist?: { integrity?: string }
}
