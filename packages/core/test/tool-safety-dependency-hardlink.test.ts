import { expect } from "bun:test"
import path from "node:path"
import { chmod, link, mkdir, open, stat, writeFile, type FileHandle } from "node:fs/promises"
import { Effect, Schema } from "effect"
import { LayerNode } from "../src/effect/layer-node"
import { AppProcess } from "../src/process"
import { ResearchProcess } from "../src/research-toolkit/process"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { expectSpawn } from "./fixture/omni-expect"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"
import { jail, sandboxHost } from "./lib/sandbox-host"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node])))
const BASE = "owned dependency bytes before confinement\n"
const CONTROLS = ["SOURCE_ORIGINAL_READ_OK", "SOURCE_SHADOW_READ_OK", "TMPDIR_WRITE_OK", "TMPDIR_LINK_OK", "TMPDIR_CHMOD_OK"]
const Operation = Schema.Union([
  Schema.Struct({ status: Schema.Literal("succeeded") }),
  Schema.Struct({ status: Schema.Literal("denied"), errno: Schema.NonEmptyString }),
])
const AliasOperation = Schema.Union([
  Operation,
  Schema.Struct({ status: Schema.Literal("not-attempted"), reason: Schema.Literal("alias-not-created") }),
])
const Report = Schema.Struct({
  tmpdir: Schema.NonEmptyString,
  controls: Schema.Array(Schema.String),
  attempts: Schema.Array(Schema.Struct({
    source: Schema.Literals(["original", "shadow"]),
    alias: Schema.NonEmptyString,
    link: Operation,
    write: AliasOperation,
    chmod: AliasOperation,
  })),
})

// These are exclusively test-owned inodes. Never point this probe at installed dependencies or user files.
const CHILD = `const fs = require("node:fs");
const path = require("node:path");
const [original, shadow, expected] = process.argv.slice(2);
const controls = [];
function control(label) { controls.push(label); console.log(label); }
for (const [source, label] of [[original, "SOURCE_ORIGINAL_READ_OK"], [shadow, "SOURCE_SHADOW_READ_OK"]]) {
  if (fs.readFileSync(source, "utf8") !== expected) throw new Error("invalid-source-bytes: " + label);
  control(label);
}
if (!process.env.TMPDIR) throw new Error("missing-jail-tmpdir");
const tmpdir = fs.realpathSync(process.env.TMPDIR);
const unrelated = path.join(tmpdir, "unrelated-writable-control");
fs.writeFileSync(unrelated, "scratch control", { flag: "wx", mode: 0o640 });
if (fs.readFileSync(unrelated, "utf8") !== "scratch control") throw new Error("invalid-tmpdir-write");
control("TMPDIR_WRITE_OK");
const unrelatedAlias = path.join(tmpdir, "unrelated-link-control");
fs.linkSync(unrelated, unrelatedAlias);
const unrelatedStat = fs.statSync(unrelated);
const aliasStat = fs.statSync(unrelatedAlias);
if (unrelatedStat.ino !== aliasStat.ino || unrelatedStat.dev !== aliasStat.dev ||
    fs.readFileSync(unrelatedAlias, "utf8") !== "scratch control") throw new Error("invalid-tmpdir-link");
control("TMPDIR_LINK_OK");
fs.chmodSync(unrelatedAlias, 0o600);
if ((fs.statSync(unrelated).mode & 0o7777) !== 0o600) throw new Error("invalid-tmpdir-chmod");
control("TMPDIR_CHMOD_OK");
function attempt(action) {
  try { action(); return { status: "succeeded" }; }
  catch (error) {
    if (!error || typeof error !== "object" || typeof error.code !== "string" || !error.code)
      throw new Error("operation-failed-without-errno");
    return { status: "denied", errno: error.code };
  }
}
const attempts = [["original", original], ["shadow", shadow]].map(([source, file]) => {
  const alias = path.join(tmpdir, "alias-" + source);
  if (fs.existsSync(alias)) throw new Error("alias-already-exists: " + source);
  const linked = attempt(() => fs.linkSync(file, alias));
  if (linked.status === "denied") return { source, alias, link: linked,
    write: { status: "not-attempted", reason: "alias-not-created" },
    chmod: { status: "not-attempted", reason: "alias-not-created" } };
  // Neither action short-circuits the other, even when the first is denied.
  const write = attempt(() => fs.writeFileSync(alias, "MUTATED THROUGH " + source));
  const chmod = attempt(() => fs.chmodSync(alias, 0o000));
  return { source, alias, link: linked, write, chmod };
});
console.log("SHARED_INODE_REPORT " + JSON.stringify({ tmpdir, controls, attempts }));
process.exit(0);
`

// Windows has no supported Bun jail. Missing jails on Linux/macOS are failures, never conformance passes or fallbacks.
it.live.skipIf(process.platform === "win32")("confine denies shared-inode alias writes and chmod (Windows unsupported)", () =>
  Effect.gen(function* () {
    if (!jail) return yield* Effect.die(new Error(`shared-inode-conformance-jail-unavailable: ${JSON.stringify(sandboxHost)}`))
    expectSpawn(import.meta.path)
    expect(process.versions.bun, "shared-inode probe requires actual Bun").toBeDefined()
    const directory = yield* Effect.acquireRelease(Effect.promise(tmpdir), (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()))
    const cwd = path.join(directory.path, "shadow")
    const original = path.join(directory.path, "original-dependency", "file")
    const shadow = path.join(cwd, "shadow-dependency", "file")
    const script = path.join(directory.path, "shared-inode-child.cjs")
    yield* Effect.promise(async () => {
      await mkdir(path.dirname(original), { recursive: true })
      await mkdir(path.dirname(shadow), { recursive: true })
      await writeFile(original, BASE)
      await chmod(original, 0o640)
      await link(original, shadow)
      await writeFile(script, CHILD)
    })
    // Restored only after both oracles: this finalizer cannot turn an observed mutation into a pass.
    yield* Effect.addFinalizer(() => Effect.promise(() => chmod(original, 0o640)))
    const handles = yield* Effect.forEach([original, shadow], (file) => Effect.acquireRelease(
      Effect.promise(async () => ({ file, handle: await open(file, "r") })),
      (entry) => Effect.promise(() => entry.handle.close()),
    ))
    const before = yield* Effect.promise(() => image(handles))
    expect(before.map((entry) => entry.bytes)).toEqual([BASE, BASE])
    expect(before.map((entry) => entry.mode)).toEqual([0o640, 0o640])
    expect(before[0].inode, "fixture must use an actual shared inode").toBe(before[1].inode)
    expect(before[0].device).toBe(before[1].device)

    console.log(`shared-inode test source sha256: ${new Bun.CryptoHasher("sha256").update(yield* Effect.promise(() => Bun.file(import.meta.path).bytes())).digest("hex")}`)
    const confined = yield* Effect.scoped(Effect.gen(function* () {
      const launch = yield* ToolSafetySandbox.confine({
        command: process.execPath, args: ["--no-env-file", "--config=/dev/null", script, original, shadow, BASE],
        cwd, env: ResearchProcess.environment(), write: [],
      })
      const outcome = yield* ResearchProcess.run({
        command: launch.command, args: launch.args, cwd,
        env: Object.fromEntries(Object.entries(launch.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
        timeoutMs: 30_000, maxBytes: 16_384,
      })
      return { outcome, scratch: launch.env.TMPDIR, beforeCleanup: yield* Effect.promise(() => image(handles)) }
    }))
    const afterCleanup = yield* Effect.promise(() => image(handles))
    const stdout = confined.outcome.stdout.data.toString("utf8")
    const diagnostics = `${stdout}\n${confined.outcome.stderr.data.toString("utf8")}`
    console.log(`shared-inode conformance (${process.platform}, ${jail}):\n${diagnostics}`)
    expect(confined.outcome.failure, diagnostics).toBeUndefined()
    expect(confined.outcome.timedOut, diagnostics).toBe(false)
    expect(confined.outcome.overflow, diagnostics).toBe(false)
    expect(confined.outcome.memoryExceeded, diagnostics).toBe(false)
    expect(confined.outcome.stdout.truncated, diagnostics).toBe(false)
    expect(confined.outcome.stderr.truncated, diagnostics).toBe(false)
    expect(confined.outcome.exitCode, diagnostics).toBe(0)
    const reports = stdout.split(/\r?\n/).filter((line) => line.startsWith("SHARED_INODE_REPORT "))
    expect(reports.length, diagnostics).toBe(1)
    const report = Schema.decodeUnknownSync(Report)(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(reports[0].slice("SHARED_INODE_REPORT ".length)))
    expect(report.controls, diagnostics).toEqual(CONTROLS)
    CONTROLS.forEach((control) => expect(stdout, diagnostics).toContain(`${control}\n`))
    expect(report.tmpdir, "child must use the actual jail TMPDIR").toBe(confined.scratch)
    expect(report.attempts.map((attempt) => attempt.source), diagnostics).toEqual(["original", "shadow"])
    expect(confined.beforeCleanup, `shared inode changed before jail cleanup: ${diagnostics}`).toEqual(before)
    expect(afterCleanup, `shared inode changed after jail cleanup: ${diagnostics}`).toEqual(before)
    report.attempts.forEach((attempt) => {
      expect(attempt.alias).toBe(path.join(report.tmpdir, `alias-${attempt.source}`))
      if (attempt.link.status === "denied") {
        expect(attempt.write).toEqual({ status: "not-attempted", reason: "alias-not-created" })
        expect(attempt.chmod).toEqual({ status: "not-attempted", reason: "alias-not-created" })
        return
      }
      expect(attempt.write.status, `alias-write-not-denied: ${diagnostics}`).toBe("denied")
      expect(attempt.chmod.status, `alias-chmod-not-denied: ${diagnostics}`).toBe("denied")
    })
  }), 120_000,
)

async function image(handles: ReadonlyArray<{ file: string; handle: FileHandle }>) {
  return Promise.all(handles.map(async (entry) => {
    const info = await stat(entry.file)
    // Positional reads through pre-opened handles still observe mutation after an alias chmods the inode to 0000.
    const read = await entry.handle.read(Buffer.alloc(info.size), 0, info.size, 0)
    return { bytes: read.buffer.subarray(0, read.bytesRead).toString("utf8"), mode: info.mode & 0o7777, inode: info.ino, device: info.dev }
  }))
}
