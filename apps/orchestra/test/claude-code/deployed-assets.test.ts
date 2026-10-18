import { expect, test } from "bun:test"
import path from "node:path"
import fs from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { Effect, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Omni } from "@orchestra/core/omni"
import { Flag } from "@orchestra/core/flag/flag"
import { ClaudeCodeExecutable } from "@/claude-code/executable"
import { PlaybookContent } from "@/maestro/playbook-content"
import { seatSkillsFiles } from "../../script/seat-skills"
import { resolveClaudeCodeResource, stageClaudeCodeResource } from "../../script/claude-code-resources"
import { tmpdir } from "../fixture/fixture"
import { expectSpawn } from "../../../../packages/core/test/fixture/omni-expect"

test.each(["bun", "node"] as const)(
  "%s deployed fixture resolves the pinned executable and publishes every embedded playbook",
  async (target) => {
    await using tmp = await tmpdir()
    await using builder = await tmpdir()
    const packageRoot = path.resolve(import.meta.dir, "../..")
    const outfile = path.join(
      tmp.path,
      target === "bun" ? `proof${process.platform === "win32" ? ".exe" : ""}` : "proof.mjs",
    )
    // A fresh compiler avoids reusing the test process's loaded/transformed module sources. Pin both workspace
    // root and alias config: a lone nested fixture entry must not choose its own directory as candidateRoot.
    await Bun.write(path.join(builder.path, "config.json"), JSON.stringify({
      target,
      format: "esm",
      root: path.resolve(packageRoot, "../.."),
      tsconfig: path.join(packageRoot, "tsconfig.json"),
      conditions: target === "bun" ? ["bun", "node"] : ["node"],
      entrypoints: [path.join(import.meta.dir, "fixtures/deployed-assets.ts")],
      ...(target === "bun"
        ? { compile: { outfile, autoloadDotenv: false, autoloadBunfig: false } }
        : { outdir: tmp.path, naming: { entry: "proof.mjs" },
            banner: 'import __cjs_mod__ from "node:module";\nconst require = __cjs_mod__.createRequire(import.meta.url);\nconst __filename = import.meta.filename;\nconst __dirname = import.meta.dirname;' }),
      files: { ...(await seatSkillsFiles()), "orchestra-web-ui.gen.ts": "" },
      external: target === "node" ? ["@lydell/node-pty", "jsonc-parser"] : ["node-gyp"],
      define: {
        ORCHESTRA_COMPILED: "true",
        ORCHESTRA_CLAUDE_NODE: String(target === "node"),
        ORCHESTRA_VERSION: JSON.stringify("deployed-proof"),
        ...(process.platform === "linux" ? { ORCHESTRA_LIBC: JSON.stringify(ClaudeCodeExecutable.nativeLibc()) } : {}),
      },
    }))
    await Bun.write(path.join(builder.path, "build.ts"), `
      import { createSolidTransformPlugin } from ${JSON.stringify(pathToFileURL(Bun.resolveSync("@opentui/solid/bun-plugin", packageRoot)).href)};
      const config = await Bun.file(process.argv[2]).json();
      const built = await Bun.build({ ...config, plugins: [createSolidTransformPlugin(), ...(config.target === "node" ? [{
        name: "node-import-meta-dir",
        setup(build) {
          build.onLoad({ filter: /[\\\\/]packages[\\\\/](orchestra|core)[\\\\/]src[\\\\/].*\\.ts$/ }, async (args) => {
            const text = await Bun.file(args.path).text();
            if (!/\\bimport\\.meta\\.dir\\b(?!name)/.test(text)) return;
            return { contents: text.replace(/\\bimport\\.meta\\.dir\\b(?!name)/g, "import.meta.dirname"), loader: "ts" };
          });
        },
      }] : [])] });
      if (!built.success) throw new Error("Deployed proof fixture build failed: " + built.logs.join("\\n"));
    `)
    const native = Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER !== "off"
    if (native) expectSpawn(import.meta.path)
    const compilerSpawns = Omni.snapshot().spawns
    const built = await run(ChildProcess.make(process.execPath, [path.join(builder.path, "build.ts"), path.join(builder.path, "config.json")], { cwd: packageRoot }))
    if (native) expect(Omni.snapshot().spawns).toBeGreaterThan(compilerSpawns)
    if (!native) expect(Omni.snapshot().spawns).toBe(compilerSpawns)
    if (built.exit !== 0) throw new Error(`Deployed proof fixture build failed (${target}): ${built.stderr}`)
    expect(await Bun.file(outfile).exists()).toBe(true)
    if (target === "node") {
      const pty = await fs.realpath(Bun.resolveSync("@lydell/node-pty", path.resolve(packageRoot, "../../packages/core")))
      await Promise.all([
        ["jsonc-parser", packageRoot], ["@lydell/node-pty", path.resolve(packageRoot, "../../packages/core")],
        [`@lydell/node-pty-${process.platform}-${process.arch}`, path.dirname(pty)],
      ].map(async ([name, from]) => {
        const root = await packageDirectory(name, path.dirname(await fs.realpath(Bun.resolveSync(name, from))))
        await fs.cp(root, path.join(tmp.path, "node_modules", name), { recursive: true, dereference: true })
      }))
    }
    const resources = path.join(tmp.path, "claude-code")
    const resource = resolveClaudeCodeResource({
      root: packageRoot,
      os: process.platform,
      arch: process.arch,
      abi: process.platform === "linux" ? ClaudeCodeExecutable.nativeLibc() : undefined,
    })
    stageClaudeCodeResource(resource, resources)
    expect(await fs.readFile(path.join(resources, resource.file))).toEqual(await fs.readFile(resource.source))
    const authored = await PlaybookContent.read(path.resolve(import.meta.dir, "../../playbooks"))
    const home = path.join(tmp.path, "home")
    await fs.mkdir(home)
    const command = (executable: string, args: string[]) => ChildProcess.make(executable, args, {
      cwd: tmp.path,
      extendEnv: false,
      env: {
        PATH: process.env.PATH ?? "",
        SystemRoot: process.env.SystemRoot ?? "",
        HOME: home,
        USERPROFILE: home,
        XDG_CACHE_HOME: path.join(home, "cache"),
        XDG_DATA_HOME: path.join(home, "data"),
        XDG_CONFIG_HOME: path.join(home, "config"),
        XDG_STATE_HOME: path.join(home, "state"),
      },
      stdout: "pipe",
      stderr: "pipe",
    })
    const deployedSpawns = Omni.snapshot().spawns
    const proof = await run(command(target === "bun" ? outfile : "node", target === "bun" ? [] : [outfile]))
    if (native) expect(Omni.snapshot().spawns).toBeGreaterThan(deployedSpawns)
    if (!native) expect(Omni.snapshot().spawns).toBe(deployedSpawns)
    if (proof.exit !== 0) throw new Error(`Deployed asset proof failed (${target}): ${proof.stderr}`)
    const evidence = JSON.parse(proof.stdout) as { executable: string; files: Record<string, string> }
    expect(evidence.executable).toBe(
      await fs.realpath(path.join(resources, process.platform === "win32" ? "claude.exe" : "claude")),
    )
    expect(evidence.files).toEqual(authored)
    expect(Object.keys(evidence.files).toSorted()).toEqual(PlaybookContent.files)
    const versionSpawns = Omni.snapshot().spawns
    const version = await run(command(evidence.executable, ["--version"]))
    if (native) expect(Omni.snapshot().spawns).toBeGreaterThan(versionSpawns)
    if (!native) expect(Omni.snapshot().spawns).toBe(versionSpawns)
    expect(version.exit).toBe(0)
    expect(version.stdout.trim()).toBe(`${ClaudeCodeExecutable.CODE_VERSION} (Claude Code)`)
  },
  120000,
)

function run(command: ChildProcess.Command) {
  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const child = yield* spawner.spawn(command)
    const [stdout, stderr, exit] = yield* Effect.all([
      child.stdout.pipe(Stream.decodeText(), Stream.runFold(() => "", (text, chunk) => text + chunk)),
      child.stderr.pipe(Stream.decodeText(), Stream.runFold(() => "", (text, chunk) => text + chunk)),
      child.exitCode,
    ], { concurrency: "unbounded" })
    return { stdout, stderr, exit: Number(exit) }
  })).pipe(Effect.provide(AppNodeBuilder.build(CrossSpawnSpawner.node))))
}

async function packageDirectory(name: string, directory: string): Promise<string> {
  if (await Bun.file(path.join(directory, "package.json")).exists() &&
    (await Bun.file(path.join(directory, "package.json")).json()).name === name) return directory
  if (path.dirname(directory) === directory) throw new Error(`Cannot stage deployed fixture package: ${name}`)
  return packageDirectory(name, path.dirname(directory))
}
