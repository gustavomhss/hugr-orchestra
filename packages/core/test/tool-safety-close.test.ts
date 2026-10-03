import { expect, test } from "bun:test"
import path from "path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetyGit } from "../src/tool-safety-git"
import { ToolSafetyProfile } from "../src/tool-safety-profile"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { testEffect } from "./lib/effect"
import { tmpdir } from "./fixture/tmpdir"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([FSUtil.node, AppProcess.node, ToolSafety.node])))
const fixture = Effect.acquireRelease(Effect.promise(() => tmpdir()), (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()))

it.live("Git -C staging refuses managed data without changing index; source-only stage leaves untracked directory intact", () =>
  Effect.gen(function* () {
    const tmp = yield* fixture
    const fs = yield* FSUtil.Service
    const processes = yield* AppProcess.Service
    const safety = yield* ToolSafety.Service
    const git = (args: string[]) => processes.run(ChildProcess.make("git", ["-C", tmp.path, ...args])).pipe(
      Effect.flatMap((result) => result.exitCode === 0 ? Effect.succeed(result.stdout.toString()) : Effect.fail(new Error("fixture git failed"))),
    )
    yield* git(["init"])
    yield* fs.writeFileString(path.join(tmp.path, "source.ts"), "export const value = 1\n")
    yield* git(["add", "source.ts"])
    yield* git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "fixture"])
    yield* fs.makeDirectory(path.join(tmp.path, ".techlead"))
    yield* fs.writeFileString(path.join(tmp.path, ".techlead", "audit.json"), "private state")
    yield* fs.makeDirectory(path.join(tmp.path, "untracked"))
    yield* fs.writeFileString(path.join(tmp.path, "untracked", "keep"), "keep")
    yield* fs.writeFileString(path.join(tmp.path, "source.ts"), "export const value = 2\n")
    const baseline = yield* git(["diff", "--cached", "--name-only", "-z"])
    const check = (command: string) => ToolSafetyGit.before({ command, directory: tmp.path, projectDirectory: tmp.path })
    const execute = (command: string) => safety.run({ tool: "bash", args: { command }, sessionID: "session", callID: "call",
      directory: tmp.path, projectID: "project", projectDirectory: tmp.path,
    }, processes.run(ChildProcess.make("/bin/sh", ["-c", command], { cwd: tmp.path })), () => Effect.void)
    const denied = yield* Effect.flip(execute(`git -C '${tmp.path}' add -A`))
    if (!(denied instanceof ToolSafety.Denied)) throw new Error("fixture stage was not held by native safety")
    expect(denied.reason).toBe("git-hygiene-managed-or-protected-data")
    expect(yield* git(["diff", "--cached", "--name-only", "-z"])).toBe(baseline)
    yield* execute(`git -C '${tmp.path}' add source.ts`)
    expect(yield* git(["diff", "--cached", "--name-only", "-z"])).toBe("source.ts\0")
    expect(yield* fs.readFileString(path.join(tmp.path, "untracked", "keep"))).toBe("keep")
    yield* git(["add", "-f", ".techlead/audit.json"])
    expect((yield* Effect.flip(check("git commit -m source"))).reason).toBe("git-hygiene-managed-or-protected-data")
    expect((yield* Effect.flip(check("git -C missing add ."))).reason).toBe("git-hygiene-cwd-acquisition")
    expect((yield* Effect.flip(check("git -c core.hooksPath=/dev/null add ."))).reason).toBe("git-hygiene-global-option-unbound")
  }),
)

it.live("bounded D profile loader refreshes mtime/version and cannot grant roots or configuration edit authority", () =>
  Effect.gen(function* () {
    const project = yield* fixture
    const data = yield* fixture
    const fs = yield* FSUtil.Service
    const file = path.join(data.path, "project", "profile", "preferences.json")
    yield* fs.makeDirectory(path.dirname(file), { recursive: true })
    const preferences = { scrutiny: "strict", askBefore: ["push"], neverTouch: ["secrets/**"], riskTolerance: "low", waiverAuthority: "human-only" }
    yield* fs.writeFileString(file, JSON.stringify(preferences))
    const load = ToolSafetyProfile.makeLoader(fs, { directory: project.path, stateDirectory: data.path, projectID: "project" }, { writeRoots: [project.path] })
    expect((yield* load())?.neverTouch).toEqual(["secrets/**"])
    expect((yield* load())?.writeRoots).toEqual([project.path])
    expect((yield* load())?.requireSandbox).toBe(true)
    yield* fs.writeFileString(file, JSON.stringify({ ...preferences, neverTouch: ["secrets/**", "protected/**"] }))
    expect((yield* load())?.neverTouch).toEqual(["secrets/**", "protected/**"])
    const safety = yield* ToolSafety.Service
    const write = safety.before({ tool: "write", args: { filePath: "protected/file" }, sessionID: "session", callID: "call",
      directory: project.path, projectID: "project" }).pipe(Effect.provideService(ToolSafety.RuntimeProfile, yield* load()))
    expect((yield* Effect.flip(write)).reason).toBe("project-never-touch")
    yield* fs.writeFileString(file, JSON.stringify({ ...preferences, permissions: [{ effect: "allow" }] }))
    expect((yield* Effect.flip(load())).reason).toBe("profile-invalid")
    yield* fs.writeFileString(file, "x".repeat(512 * 1024 + 1))
    expect((yield* Effect.flip(load())).reason).toBe("profile-not-file-or-overflow")
  }),
)

it.live("tool-child inheritance strips credential names/values without mutating provider environment", () =>
  Effect.gen(function* () {
    const tmp = yield* fixture
    const processes = yield* AppProcess.Service
    expect(yield* ToolSafetySandbox.available("node")).not.toBeNull()
    const inherited = { PATH: process.env.PATH, FIXTURE_SECRET_TOKEN: "fixture-private", SAFE: "ordinary" }
    const command = yield* ToolSafetySandbox.wrap(ChildProcess.make(process.execPath, ["-e",
      "process.stdout.write(JSON.stringify({secret:process.env.FIXTURE_SECRET_TOKEN,safe:process.env.SAFE}))"],
    { cwd: tmp.path, env: inherited, extendEnv: true }))
    const result = yield* processes.run(command)
    expect(JSON.parse(result.stdout.toString())).toEqual({ safe: "ordinary" })
    expect(inherited.FIXTURE_SECRET_TOKEN).toBe("fixture-private")
    const script = `
      const { Effect } = await import(${JSON.stringify(import.meta.resolve("effect"))});
      const { ChildProcess } = await import(${JSON.stringify(import.meta.resolve("effect/unstable/process"))});
      const { AppNodeBuilder } = await import(${JSON.stringify(new URL("../src/effect/app-node-builder.ts", import.meta.url).href)});
      const { LayerNode } = await import(${JSON.stringify(new URL("../src/effect/layer-node.ts", import.meta.url).href)});
      const { FSUtil } = await import(${JSON.stringify(new URL("../src/fs-util.ts", import.meta.url).href)});
      const { AppProcess } = await import(${JSON.stringify(new URL("../src/process.ts", import.meta.url).href)});
      const { ToolSafetySandbox } = await import(${JSON.stringify(new URL("../src/tool-safety-sandbox.ts", import.meta.url).href)});
      const result = await Effect.gen(function* () {
        const processes = yield* AppProcess.Service;
        const command = yield* ToolSafetySandbox.wrap(ChildProcess.make(process.execPath, ["-e", "process.stdout.write(JSON.stringify({secret:!!process.env.FIXTURE_SECRET_TOKEN,safe:process.env.SAFE}))"], {extendEnv:true}));
        return yield* processes.run(command);
      }).pipe(Effect.scoped, Effect.provide(AppNodeBuilder.build(LayerNode.group([FSUtil.node, AppProcess.node]))), Effect.runPromise);
      process.stdout.write(JSON.stringify({child:JSON.parse(result.stdout.toString()),providerParentPreserved:!!process.env.FIXTURE_SECRET_TOKEN}));
    `
    const parent = yield* processes.run(ChildProcess.make(process.execPath, ["-e", script], { env: inherited, extendEnv: false }))
    expect(parent.exitCode).toBe(0)
    expect(JSON.parse(parent.stdout.toString())).toEqual({ child: { secret: false, safe: "ordinary" }, providerParentPreserved: true })
    expect(command._tag === "StandardCommand" && command.options.extendEnv).toBe(false)
  }),
)

const binary = await Effect.runPromise(ToolSafetySandbox.available())
test.skipIf(!binary || !["darwin", "linux"].includes(process.platform))("LIVE srt confines real descendant writes (SKIP when binary/platform unavailable)", async () => {
  await Effect.gen(function* () {
    const project = yield* fixture
    const outside = yield* fixture
    const fs = yield* FSUtil.Service
    const processes = yield* AppProcess.Service
    const command = yield* ToolSafetySandbox.wrap(ChildProcess.make("/bin/sh", ["-c",
      `touch '${project.path}/allowed'; /bin/sh -c "touch '${outside.path}/denied'"`], { cwd: project.path })).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true, writeRoots: [project.path] }),
      Effect.provideService(ToolSafety.NativeContext, { directory: project.path }),
    )
    const result = yield* processes.run(command)
    expect(yield* fs.exists(path.join(project.path, "allowed"))).toBe(true)
    expect(yield* fs.exists(path.join(outside.path, "denied"))).toBe(false)
    expect(result.exitCode).not.toBe(0)
  }).pipe(Effect.scoped, Effect.provide(AppNodeBuilder.build(LayerNode.group([FSUtil.node, AppProcess.node]))), Effect.runPromise)
})

if (!binary) it.live("required real sandbox absence is a named HOLD, not an unsandboxed fallback", () =>
  Effect.gen(function* () {
    const tmp = yield* fixture
    const outcome = yield* Effect.flip(ToolSafetySandbox.wrap(ChildProcess.make("/bin/sh", ["-c", "touch denied"], { cwd: tmp.path })).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true }),
    ))
    expect(outcome.reason).toBe("required-process-sandbox-unavailable")
    const fs = yield* FSUtil.Service
    expect(yield* fs.exists(path.join(tmp.path, "denied"))).toBe(false)
  }),
)
