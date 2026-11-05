import { expect } from "bun:test"
import { createHash } from "node:crypto"
import path from "node:path"
import { access, lstat, mkdir, readFile, readdir, readlink, realpath, symlink, writeFile } from "node:fs/promises"
import { Effect } from "effect"
import { BackendToolkit } from "../../src/backend-toolkit"
import { LayerNode } from "../../src/effect/layer-node"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ReviewNativeFiles } from "../../src/review-toolkit/native-files"
import { ReviewPackRuff } from "../../src/review-toolkit/packs/ruff"
import { ToolSafetySandbox } from "../../src/tool-safety-sandbox"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))

// Real binary only. The installer runs in CI setup, outside the review; locate never installs.
const fixture = Effect.acquireRelease(Effect.promise(async () => {
  const temp = await tmpdir()
  const root = path.join(temp.path, "review tree [literal]")
  await mkdir(root)
  return { temp, root, install: path.join(temp.path, "toolkit") }
}), (value) => Effect.promise(() => value.temp[Symbol.asyncDispose]()))

async function image(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true })
  return (await Promise.all(entries.map(async (entry) => {
    const relative = path.join(prefix, entry.name)
    const file = path.join(root, relative)
    const stat = await lstat(file)
    const metadata = `${stat.mode}:${stat.ino}:${stat.size}:${stat.mtimeMs}`
    if (entry.isSymbolicLink()) return [`${relative}:${metadata}->${await readlink(file)}`]
    if (entry.isDirectory()) return [`${relative}/:${metadata}`, ...await image(root, relative)]
    return [`${relative}:${metadata}:${(await readFile(file)).toString("base64")}`]
  }))).flat().sort()
}

const exists = (file: string) => access(file).then(() => true, () => false)

it.live(process.platform === "win32" ? "Windows refuses Ruff before lookup and invocation" : "pinned Ruff under the real review confinement: report, selection and isolation", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const selected = path.join(f.root, "odd [name] space.py")
    yield* Effect.promise(() => writeFile(selected, "print(missing_name)\n"))
    if (process.platform === "win32") {
      const result = yield* ReviewPackRuff.argv({ executable: "ruff.exe", root: f.root, files: [selected] })
      expect(result.status).toBe("unsupported")
      expect(result).toMatchObject({ status: "unsupported", reason: "windows-api-unqualified" })
      expect(yield* ReviewPackRuff.locate()).toEqual({ absent: "ruff unsupported: windows-api-unqualified" })
      return
    }
    expectSpawn(import.meta.path)
    const executable = yield* BackendToolkit.ensure<string>("ruff").pipe(
      Effect.provideService(BackendToolkit.Root, f.install),
      Effect.provideService(BackendToolkit.Manifest, { [ReviewPackRuff.manifest.id]: ReviewPackRuff.manifest }),
    )
    const state = yield* BackendToolkit.status<string>("ruff").pipe(
      Effect.provideService(BackendToolkit.Root, f.install),
      Effect.provideService(BackendToolkit.Manifest, { [ReviewPackRuff.manifest.id]: ReviewPackRuff.manifest }),
    )
    const installed = state[0]
    if (installed?.status !== "ready") throw new Error(`ruff-install-not-ready: ${JSON.stringify(state)}`)
    expect(installed.status).toBe("ready")
    const notice = yield* Effect.promise(() => readFile(path.join(installed.directory, "notices", "ruff-0.17.3-license.txt")))
    expect(createHash("sha256").update(notice).digest("hex")).toBe("2597d854122b77ddc71971564ca2350a37608575ce324adc5650a2b2051c8f18")

    const other = path.join(f.root, "unselected.py")
    const shadow = path.join(f.root, "shadow.py")
    const clean = path.join(f.root, "clean.py")
    const unicode = path.join(f.root, "unicode.py")
    const syntax = path.join(f.root, "syntax.py")
    const backslash = path.join(f.root, "literal\\name.py")
    const poison = path.join(f.temp.path, "diverted.json")
    yield* Effect.promise(async () => {
      await writeFile(path.join(f.root, "pyproject.toml"), '[tool.ruff.lint]\nignore = ["F821", "F823"]\n')
      await writeFile(selected, "print(missing_name)  # noqa: F821\n")
      await writeFile(other, "print(sibling_missing)\n")
      await writeFile(shadow, "x = 1\ndef foo():\n    x += 1\n")
      await writeFile(clean, "value = 1\n")
      await writeFile(unicode, 'print("é", missing_name)\n')
      await writeFile(syntax, "def broken(:\n")
      await writeFile(backslash, "print(backslash_missing)\n")
      await symlink(other, path.join(f.root, "link.py"))
    })
    const before = yield* Effect.promise(() => image(f.root))
    const dirty = ReviewPackRuff.environment({ ...process.env, RUFF_OUTPUT_FILE: poison, RUFF_OUTPUT_FORMAT: "text",
      RUFF_CACHE_DIR: path.join(f.temp.path, "poison-cache"), PYTHONPATH: path.join(f.temp.path, "poison-python") })
    for (const key of ["RUFF_OUTPUT_FILE", "RUFF_OUTPUT_FORMAT", "RUFF_CACHE_DIR", "PYTHONPATH"]) expect(dirty[key]).toBeUndefined()

    const run = (argv: readonly string[]) => Effect.scoped(Effect.gen(function* () {
      const launch = yield* ToolSafetySandbox.confine({ command: argv[0], args: argv.slice(1), cwd: f.root, env: dirty, write: [] }).pipe(
        Effect.map((value) => ({ value })), Effect.catch((error) => Effect.succeed({ denied: error.reason })),
      )
      if ("denied" in launch) throw new Error(`conformance-missing: ${launch.denied}`)
      return yield* ResearchProcess.run({ command: launch.value.command, args: launch.value.args, cwd: f.root,
        env: Object.fromEntries(Object.entries(launch.value.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
        timeoutMs: 60_000, maxBytes: 4 * 1024 * 1024 })
    }))
    const plan = (files: readonly string[], excluded: readonly string[] = []) =>
      ReviewPackRuff.argv({ executable: executable.executable, root: f.root, files, excluded })
    const files = [selected, shadow, clean, unicode, backslash]
    const filesystem = yield* Effect.promise(async () => {
      const inspect = async (file: string) => {
        const stat = await lstat(file).then((value) => ({ file: value.isFile(), directory: value.isDirectory(), symlink: value.isSymbolicLink() }), (error: NodeJS.ErrnoException) => ({ error: error.code ?? error.message }))
        const physical = await realpath(file).then((value) => value, (error: NodeJS.ErrnoException) => ({ error: error.code ?? error.message }))
        return { path: file, stat, realpath: physical }
      }
      return { root: await inspect(f.root), entries: await readdir(f.root).then((value) => value, (error: NodeJS.ErrnoException) => ({ error: error.code ?? error.message })), files: await Promise.all(files.map(inspect)) }
    })
    const selections = yield* Effect.forEach(files, (file) => ReviewNativeFiles.select({ root: f.root, files: [file], extensions: [".py", ".pyi"] }).pipe(Effect.map((result) => ({ file, result }))))
    const chosen = yield* plan(files)
    if (chosen.status !== "ok") throw new Error(`ruff argv refused: ${JSON.stringify({ chosen, root: f.root, files, executable: executable.executable, filesystem, selections })}`)
    expect(chosen.status).toBe("ok")
    expect(chosen.argv.slice(0, 14)).toEqual([executable.executable, "check", "--isolated", "--no-cache", "--no-fix", "--no-fix-only", "--no-preview", "--ignore-noqa", "--target-version", "py311", "--output-format", "json", "--select", "F821,F823"])
    expect(chosen.argv).toContain("--no-respect-gitignore")
    expect(chosen.argv).toContain("--")
    const result = yield* run(chosen.argv)
    if (result.exitCode !== 1) throw new Error(`ruff native outcome: ${JSON.stringify({ ...result, stdout: result.stdout.data.toString("utf8"), stderr: result.stderr.data.toString("utf8") })}`)
    expect(result.exitCode).toBe(1)
    const native = JSON.parse(result.stdout.data.toString("utf8")) as Array<{ code: string; filename: string; location: { row: number; column: number }; end_location: { row: number; column: number } }>
    expect(native.some((item) => item.code === "F821" && item.filename === selected)).toBe(true)
    expect(native.some((item) => item.code === "F823" && item.filename === shadow)).toBe(true)
    expect(native.some((item) => item.filename === backslash && item.code === "F821")).toBe(true)
    expect(native.some((item) => item.filename === other || item.filename === clean)).toBe(false)
    expect(native.find((item) => item.filename === unicode)).toMatchObject({ code: "F821", location: { row: 1, column: 12 }, end_location: { row: 1, column: 24 } })
    const parsed = ReviewPackRuff.settle(result, f.root)
    if (parsed.status !== "ok") throw new Error(`native report refused: ${JSON.stringify(parsed)}`)
    expect(parsed.status).toBe("ok")
    expect(parsed.results.map((item) => item.rule)).toContain("F821")
    expect(parsed.results.map((item) => item.rule)).toContain("F823")

    const filtered = yield* plan([selected, shadow], ["F821"])
    if (filtered.status !== "ok") throw new Error(`filtered argv refused: ${JSON.stringify({ filtered, root: f.root, files: [selected, shadow], executable: executable.executable })}`)
    expect(filtered.status).toBe("ok")
    const filteredResult = yield* run(filtered.argv)
    if (filteredResult.exitCode !== 1) throw new Error(`ruff filtered outcome: ${JSON.stringify({ ...filteredResult, stdout: filteredResult.stdout.data.toString("utf8"), stderr: filteredResult.stderr.data.toString("utf8") })}`)
    expect(filteredResult.exitCode).toBe(1)
    const filteredNative = JSON.parse(filteredResult.stdout.data.toString("utf8")) as Array<{ code: string }>
    expect(filteredNative.map((item) => item.code)).toContain("F823")
    expect(filteredNative.map((item) => item.code)).not.toContain("F821")
    const filteredParsed = ReviewPackRuff.settle(filteredResult, f.root)
    if (filteredParsed.status !== "ok") throw new Error(`filtered report refused: ${JSON.stringify(filteredParsed)}`)
    expect(filteredParsed.status).toBe("ok")
    const excluded = yield* plan([selected], ["F821", "F823"])
    expect(excluded.status).toBe("not-run")
    if (excluded.status === "not-run") expect(excluded.reason.length).toBeGreaterThan(0)
    expect((yield* plan([selected], ["F999"])).status).not.toBe("ok")
    const empty = yield* plan([], [])
    expect(empty.status).toBe("not-run")
    if (empty.status === "not-run") expect(empty.reason.length).toBeGreaterThan(0)
    expect((yield* plan([path.join(f.temp.path, "escape.py")])).status).not.toBe("ok")
    expect((yield* plan([path.join(f.root, "link.py")])).status).not.toBe("ok")

    const benign = yield* plan([clean])
    if (benign.status !== "ok") throw new Error(`benign argv refused: ${JSON.stringify({ benign, root: f.root, files: [clean], executable: executable.executable })}`)
    expect(benign.status).toBe("ok")
    const cleanResult = yield* run(benign.argv)
    if (cleanResult.exitCode !== 0) throw new Error(`ruff benign outcome: ${JSON.stringify({ ...cleanResult, stdout: cleanResult.stdout.data.toString("utf8"), stderr: cleanResult.stderr.data.toString("utf8") })}`)
    expect(cleanResult.exitCode).toBe(0)
    expect(JSON.parse(cleanResult.stdout.data.toString("utf8"))).toEqual([])
    const cleanParsed = ReviewPackRuff.settle(cleanResult, f.root)
    if (cleanParsed.status !== "ok") throw new Error(`benign report refused: ${JSON.stringify(cleanParsed)}`)
    expect(cleanParsed.status).toBe("ok")

    const badSyntax = yield* plan([syntax])
    if (badSyntax.status !== "ok") throw new Error(`syntax argv refused: ${JSON.stringify({ badSyntax, root: f.root, files: [syntax], executable: executable.executable })}`)
    expect(badSyntax.status).toBe("ok")
    const syntaxResult = yield* run(badSyntax.argv)
    if (syntaxResult.exitCode !== 1) throw new Error(`ruff syntax outcome: ${JSON.stringify({ ...syntaxResult, stdout: syntaxResult.stdout.data.toString("utf8"), stderr: syntaxResult.stderr.data.toString("utf8") })}`)
    // Preserve the native bytes as a test artifact, not as an analyzer-registered proof.
    const raw = path.join(f.temp.path, "syntax-raw.json")
    yield* Effect.promise(() => writeFile(raw, syntaxResult.stdout.data))
    expect(yield* Effect.promise(() => readFile(raw))).toEqual(Buffer.from(syntaxResult.stdout.data))
    expect(JSON.parse(syntaxResult.stdout.data.toString("utf8")).some((item: { code: string }) => item.code === "invalid-syntax")).toBe(true)
    expect(ReviewPackRuff.settle(syntaxResult, f.root).status).toBe("acquisition-error")
    const bad = yield* run([executable.executable, "check", "--not-a-real-ruff-option"])
    expect(bad.exitCode).toBe(2)
    expect(ReviewPackRuff.settle(bad, f.root).status).toBe("acquisition-error")
    expect(yield* Effect.promise(() => image(f.root))).toEqual(before)
    expect(yield* Effect.promise(() => exists(poison))).toBe(false)
    expect(yield* Effect.promise(() => exists(path.join(f.temp.path, "poison-cache")))).toBe(false)
  }), 180_000,
)
