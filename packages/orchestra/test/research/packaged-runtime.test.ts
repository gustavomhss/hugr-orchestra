import { expect, test } from "bun:test"
import path from "node:path"
import fs from "node:fs/promises"
import { Schema } from "effect"
import { Research } from "@orchestra/schema/research"
import { Seats } from "@/maestro/seats"
import { SeatSkillContent } from "@/maestro/seat-skill-content"
import { ConfigMarkdown } from "@/config/markdown"
import { seatSkillsFiles } from "../../script/seat-skills"
import { tmpdir } from "../fixture/fixture"

const Evidence = Schema.Struct({
  runtime: Schema.Literals(["bun", "node"]),
  sourceRoots: Schema.Array(Schema.Struct({ id: Schema.String, path: Schema.String, available: Schema.Boolean })),
  skillRoot: Schema.String,
  skillFiles: Schema.Record(Schema.String, Schema.String),
  skills: Schema.Array(Schema.Struct({ name: Schema.String, location: Schema.String, content: Schema.String, output: Schema.String })),
  companion: Schema.String,
  source: Research.SourceReceipt,
  received: Research.ArtifactPage,
  retained: Research.ArtifactPage,
  finding: Research.FindingRecord,
  document: Research.DocumentReceipt,
  page: Research.ArtifactPage,
  card: Research.Card,
  calls: Schema.Array(Schema.Struct({ tool: Schema.String, status: Schema.String })),
  report: Schema.Struct({
    schema: Schema.String,
    card: Schema.Struct({ parsed: Schema.Boolean }),
    referencesChecked: Schema.Boolean,
    terminal: Schema.Struct({ reason: Schema.String }),
    discovery: Research.Card,
    documents: Schema.Array(Research.DocumentReceipt),
    corpus: Research.Corpus,
  }),
})

test.each(["bun", "node"] as const)("%s whole native registry captures/publishes/reopens/decodes with authored source unavailable", async (target) => {
  const deadline = performance.now() + 110000
  await using tmp = await tmpdir()
  const packageRoot = path.resolve(import.meta.dir, "../..")
  // Keep relocation inside the fixture: Seats.skillSource walks four parents from the packaged module.
  const outdir = path.join(tmp.path, "install/packages/orchestra/dist/node")
  await fs.mkdir(outdir, { recursive: true })
  const bundle = path.join(outdir, target === "bun" ? `packaged-proof${process.platform === "win32" ? ".exe" : ""}` : "packaged-proof.mjs")
  const defines = {
    ORCHESTRA_COMPILED: "true",
    ORCHESTRA_MODELS_DEV: await Bun.file(path.join(packageRoot, "test/tool/fixtures/models-api.json")).text(),
    ORCHESTRA_VERSION: '"local"',
    ORCHESTRA_CHANNEL: '"local"',
  }
  const config = {
    target,
    format: "esm",
    tsconfig: path.join(packageRoot, "tsconfig.json"),
    files: { ...await seatSkillsFiles(), "orchestra-web-ui.gen.ts": "" },
    entrypoints: [path.join(import.meta.dir, "fixtures/packaged-proof.ts"), ...(target === "bun" ? ["orchestra-seat-skills.gen.ts"] : [])],
    define: target === "node" ? defines : {
      ...defines,
      FFF_LIBC: '"gnu"',
      ORCHESTRA_LIBC: JSON.stringify(process.platform === "linux" ? "glibc" : ""),
      ...(process.platform === "linux" ? { "process.env.OPENTUI_LIBC": '"glibc"' } : {}),
    },
    external: target === "node" ? ["@lydell/node-pty", "jsonc-parser"] : ["node-gyp"],
    ...(target === "node" ? {
      outdir,
      naming: "[name].mjs",
      // Same shim as packages/desktop/electron.vite.config.ts, without a fake Bun runtime.
      banner: `import __cjs_mod__ from 'node:module';
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require = __cjs_mod__.createRequire(import.meta.url);`,
    } : {
      conditions: ["bun", "node"],
      minify: true,
      splitting: true,
      compile: {
        autoloadBunfig: false,
        autoloadDotenv: false,
        autoloadTsconfig: true,
        autoloadPackageJson: true,
        outfile: bundle,
        execArgv: ["--user-agent=orchestra/local", "--use-system-ca", "--"],
      },
    }),
  }
  // Match production's Solid transform in the executable lane; isolate virtual-file resolver state per build.
  const builder = path.join(tmp.path, "build.ts")
  await Bun.write(builder, `${target === "bun" ? `import { createSolidTransformPlugin } from ${JSON.stringify(Bun.resolveSync("@opentui/solid/bun-plugin", packageRoot))};` : ""}
const result = await Bun.build({ ...${JSON.stringify(config)}${target === "bun" ? ", plugins: [createSolidTransformPlugin()]" : ""} });
if (!result.success) throw new Error(result.logs.join("\\n"));`)
  // Build/proof caps total 105s; the shared deadline reserves cleanup time even when setup is slow.
  await subprocess(`Whole native ${target} proof build`, Math.min(60000, Math.floor(deadline - performance.now())), [process.execPath, builder], { cwd: packageRoot })
  expect((await fs.stat(bundle)).isFile()).toBe(true)

  if (target === "node") {
    // Production externalizes these packages. Copy packages, never symlink the workspace node_modules/source tree.
    await fs.mkdir(path.join(outdir, "node_modules/@lydell"), { recursive: true })
    const pty = await fs.realpath(Bun.resolveSync("@lydell/node-pty", path.resolve(packageRoot, "../core")))
    await Promise.all([
      ["jsonc-parser", packageRoot],
      ["@lydell/node-pty", path.resolve(packageRoot, "../core")],
      [`@lydell/node-pty-${process.platform}-${process.arch}`, path.dirname(pty)],
    ].map(async ([name, from]) => {
      // node-pty deliberately does not export package.json; its loader also requires the platform package eagerly.
      const root = await packageDirectory(name, path.dirname(await fs.realpath(Bun.resolveSync(name, from))))
      await fs.cp(root, path.join(outdir, "node_modules", name), { recursive: true, dereference: true })
    }))
  }

  const project = path.join(tmp.path, "project")
  const home = path.join(tmp.path, "home")
  await Promise.all([project, home].map((root) => fs.mkdir(root)))
  await Bun.write(path.join(project, "orchestra.json"), JSON.stringify({ plugin: [], mcp: {}, lsp: false, formatter: false }))
  const node = target === "node" ? Bun.which("node") : undefined
  if (target === "node" && !node) throw new Error("node is not on PATH; packaged research proof cannot run")
  const output = await subprocess(`Whole native ${target} proof`, Math.min(45000, Math.floor(deadline - performance.now())), target === "bun" ? [bundle, project] : [node ?? "node", bundle, project], {
    cwd: project,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ["PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR"].includes(key.toUpperCase()))),
      HOME: home, USERPROFILE: home, APPDATA: path.join(home, "AppData/Roaming"), LOCALAPPDATA: path.join(home, "AppData/Local"),
      XDG_CACHE_HOME: path.join(tmp.path, "cache"), XDG_DATA_HOME: path.join(tmp.path, "data"), XDG_CONFIG_HOME: path.join(tmp.path, "config"),
      XDG_STATE_HOME: path.join(tmp.path, "state"), ORCHESTRA_DB: path.join(tmp.path, "native.db"), ORCHESTRA_INHERIT_CREDENTIALS: "0",
      ORCHESTRA_TEST_HOME: home, ORCHESTRA_TEST_MANAGED_CONFIG_DIR: path.join(tmp.path, "managed"),
      ORCHESTRA_CONFIG_CONTENT: "{}", ORCHESTRA_CLIENT: "cli", ORCHESTRA_PURE: "true",
      ORCHESTRA_DISABLE_DEFAULT_PLUGINS: "true", ORCHESTRA_DISABLE_EXTERNAL_SKILLS: "true", ORCHESTRA_DISABLE_MODELS_FETCH: "true",
      ORCHESTRA_DISABLE_AUTOUPDATE: "true", ORCHESTRA_DISABLE_LSP_DOWNLOAD: "true", ORCHESTRA_DISABLE_EMBEDDED_WEB_UI: "true",
      ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "true",
    },
  })
  const marker = output.stdout.split(/\r?\n/).filter((line) => line.startsWith("PACKAGED_RESEARCH="))
  expect(marker).toHaveLength(1)
  const evidence = Schema.decodeUnknownSync(Schema.fromJsonString(Evidence))(marker[0].slice("PACKAGED_RESEARCH=".length))
  expect(evidence.runtime).toBe(target)
  expect(evidence.sourceRoots.map((root) => root.id).sort()).toEqual(Object.values(Seats.all).filter((seat) => seat.skills.length > 0).map((seat) => seat.id).sort())
  evidence.sourceRoots.forEach((root) => {
    expect(root.available).toBe(false)
    expect(root.path).not.toBe(Seats.skillSource(root.id))
    if (target === "node") expect(path.relative(tmp.path, root.path).startsWith(`install${path.sep}`)).toBe(true)
  })
  expect(path.relative(tmp.path, evidence.skillRoot).startsWith(`cache${path.sep}`)).toBe(true)
  expect(evidence.skillFiles).toEqual(await SeatSkillContent.read("jimmy", Seats.skillSource("jimmy"), Seats.all.jimmy.skills))
  expect(evidence.skills.map((skill) => skill.name).sort()).toEqual([...Seats.all.jimmy.skills].sort())
  await Promise.all(evidence.skills.map(async (skill) => {
    expect(skill.location).toBe(path.join(evidence.skillRoot, skill.name, "SKILL.md"))
    expect(skill.content).toBe((await ConfigMarkdown.parse(path.join(Seats.skillSource("jimmy"), skill.name, "SKILL.md"))).content)
    expect(skill.output).toContain(`<skill_content name="${skill.name}">`)
    expect(skill.output).toContain(skill.content.trim())
  }))
  expect(evidence.companion).toBe(evidence.skillFiles["jimmy-discovery/methods/understand.md"].replace(/\n$/, ""))
  expect(evidence.source).toMatchObject({ complete: true, ref: { representation: "text" }, transformation: "read-line-projection-v1" })
  expect(evidence.received.text).toBe("Version 1 only.\nDisabled rejects operation.\n")
  expect(evidence.received.receipt).toMatchObject({ ref: evidence.source.derivedFrom, complete: true })
  expect(evidence.retained.text).toBe("Version 1 only.\nDisabled rejects operation.")
  expect(evidence.retained.receipt).toEqual(evidence.source)
  expect(evidence.finding).toMatchObject({ kind: "finding", nature: "extraction", conditions: ["version 1", "enabled"] })
  expect(evidence.finding.evidence).toEqual([evidence.card.evidenceRefs[0]])
  expect(evidence.finding.contrary).toEqual([evidence.card.evidenceRefs[1]])
  expect(evidence.document.findingRefs).toEqual(evidence.card.findingRefs)
  expect(evidence.document.citations).toEqual({ supported: evidence.card.evidenceRefs[0], disabled: evidence.card.evidenceRefs[1] })
  expect(evidence.page).toMatchObject({ representation: "markdown", complete: true, receipt: evidence.document, ref: evidence.document.artifact })
  expect(evidence.page.text).toBe("Version 1 is supported [source](research:supported); disabled rejects operation [exception](research:disabled).\n")
  expect(evidence.report).toMatchObject({ schema: "discovery-work-result-v1", card: { parsed: true }, referencesChecked: true, terminal: { reason: "ended" }, discovery: evidence.card })
  expect(evidence.report.documents).toEqual([evidence.document])
  expect(evidence.report.corpus.documents).toEqual([evidence.document])
  expect(evidence.calls.map((call) => call.tool)).toEqual(["skill", "skill", "read", "read", "research_view", "research_view", "research_record", "research_view", "research_record", "research_view"])
  expect(evidence.calls.every((call) => call.status === "completed")).toBe(true)
}, 120000)

async function subprocess(label: string, timeout: number, cmd: string[], options: { cwd: string; env?: Record<string, string | undefined> }) {
  if (timeout <= 0) throw new Error(`${label} cannot start: per-runtime subprocess budget exhausted`)
  const child = Bun.spawn(cmd, { ...options, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout, killSignal: "SIGKILL" })
  const readers = [child.stdout.getReader(), child.stderr.getReader()]
  const captured = [{ text: "" }, { text: "" }]
  const read = async (reader: ReadableStreamDefaultReader<Uint8Array>, output: { text: string }) => {
    const decoder = new TextDecoder()
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        output.text += decoder.decode()
        return output.text
      }
      output.text += decoder.decode(chunk.value, { stream: true })
    }
  }
  const pending = [read(readers[0], captured[0]), read(readers[1], captured[1]), child.exited.then((exit) => {
    if (exit !== 0) throw new Error(`${label} failed (${exit}):\n${captured[0].text}\n${captured[1].text}`)
    return exit
  })] as const
  // Bun's timeout bounds process exit. This deadline also bounds EOF if a descendant inherited a pipe.
  const deadline = Promise.withResolvers<never>()
  const timer = setTimeout(() => deadline.reject(new Error(`${label} timed out after ${timeout}ms:\n${captured[0].text}\n${captured[1].text}`)), timeout)
  try {
    const [stdout, stderr] = await Promise.race([Promise.all(pending), deadline.promise])
    return { stdout, stderr }
  } finally {
    clearTimeout(timer)
    try {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
    } finally {
      // Reader cancellation releases inherited pipes; await every reader and the child before tmpdir disposal.
      await Promise.allSettled([child.exited, ...readers.map((reader) => reader.cancel()), ...pending])
      readers.forEach((reader) => reader.releaseLock())
    }
  }
}

async function packageDirectory(name: string, directory: string): Promise<string> {
  const manifest = await fs.readFile(path.join(directory, "package.json"), "utf8").then(
    (text) => Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ name: Schema.optional(Schema.String) })))(text),
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    },
  )
  if (manifest?.name === name) return directory
  if (path.dirname(directory) === directory) throw new Error(`Cannot acquire installed external package: ${name}`)
  return packageDirectory(name, path.dirname(directory))
}
