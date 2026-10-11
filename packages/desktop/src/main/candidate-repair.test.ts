import { afterEach, beforeEach, expect, test } from "bun:test"
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { candidateEnvironment, initializeCandidateProfile, type CandidateProfile } from "./candidate-profile"

const saved = { ...process.env }
let base: string
beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "candidate-repair-")))
  for (const key of ["ORCHESTRA_CANDIDATE_PROFILE_ROOT", "XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME"]) {
    delete process.env[key]
  }
})
afterEach(() => {
  Object.keys(process.env).forEach((key) => { if (!(key in saved)) delete process.env[key] })
  Object.assign(process.env, saved)
  rmSync(base, { recursive: true, force: true })
})

function fixture() {
  const appData = join(base, "appData")
  const p = initializeCandidateProfile({ getPath: () => appData, setPath() {}, setName() {}, setAppUserModelId() {} }, true)!
  return { p, appData }
}

test("root leaf symlink cannot hide its identity through canonicalization or adopt an external directory", () => {
  const f = fixture()
  const outside = join(base, "outside-empty")
  const root = join(base, "root-link")
  mkdirSync(outside, { mode: 0o700 })
  symlinkSync(outside, root, "junction")
  check(f, "candidate-profile: root must not be a symlink", "", { ORCHESTRA_CANDIDATE_PROFILE_ROOT: root })
  expect(existsSync(join(outside, ".orchestra-lean-candidate.json"))).toBe(false)
})

for (const path of [
  "desktop/logs/run/main.log", "desktop/orchestra.settings", "session/Default/Local Storage/leveldb/MANIFEST",
  "data/orchestra/auth.json", "state/orchestra/session.sqlite",
]) {
  test(`rejects escaping persistent file link before consumers: ${path}`, () => {
    const f = fixture()
    const outside = join(base, "external-sentinel")
    writeFileSync(outside, "external bytes must survive")
    const link = join(f.p.root, path)
    mkdirSync(dirname(link), { recursive: true, mode: 0o700 })
    symlinkSync(outside, link, "file")
    rmSync(f.p.cache, { recursive: true })
    const marker = readFileSync(join(f.p.root, ".orchestra-lean-candidate.json"), "utf8")
    check(f, "candidate-profile: path escapes owned root")
    expect(readFileSync(outside, "utf8")).toBe("external bytes must survive")
    expect(readFileSync(join(f.p.root, ".orchestra-lean-candidate.json"), "utf8")).toBe(marker)
    expect(existsSync(f.p.cache)).toBe(false)
  })
}

for (const directory of ["home/.claude", "home/.claude-secure-storage", "desktop/logs", "session/Default", "data/orchestra"]) {
  test(`rejects replaced private/nested directory link: ${directory}`, () => {
    const f = fixture()
    const outside = join(base, "external-dir")
    mkdirSync(outside, { mode: 0o700 })
    writeFileSync(join(outside, "sentinel"), "external bytes")
    const link = join(f.p.root, directory)
    rmSync(link, { recursive: true, force: true })
    mkdirSync(dirname(link), { recursive: true, mode: 0o700 })
    symlinkSync(outside, link, "junction")
    check(f, "candidate-profile: path escapes owned root")
    expect(readFileSync(join(outside, "sentinel"), "utf8")).toBe("external bytes")
  })
}

test("allows contained owned file/directory links and cycles without skipping target validation", () => {
  const f = fixture()
  const target = join(f.p.state, "own.log")
  writeFileSync(target, "owned bytes")
  mkdirSync(join(f.p.desktop, "logs"), { mode: 0o700 })
  symlinkSync(target, join(f.p.desktop, "logs", "old.log"), "file")
  const directory = join(f.p.home, "own-config")
  mkdirSync(directory, { mode: 0o700 })
  rmSync(f.p.config, { recursive: true })
  symlinkSync(directory, f.p.config, "junction")
  symlinkSync(f.p.desktop, join(f.p.desktop, "cycle"), "junction")
  check(f)
  expect(readFileSync(target, "utf8")).toBe("owned bytes")
  if (process.platform !== "win32") {
    chmodSync(directory, 0o755)
    check(f, "candidate-profile: unsafe private permissions")
  }
})

test("unsafe empty root is not adopted on POSIX; Windows makes no private ACL claim", () => {
  const f = fixture()
  const root = join(base, "unsafe-empty")
  mkdirSync(root, { mode: 0o755 })
  chmodSync(root, 0o755)
  check(f, process.platform === "win32" ? undefined : "candidate-profile: unsafe private permissions", "", { ORCHESTRA_CANDIDATE_PROFILE_ROOT: root })
  expect(existsSync(join(root, ".orchestra-lean-candidate.json"))).toBe(process.platform === "win32")
})

for (const [path, mode, error] of [
  ["", 0o755, "unsafe private permissions"], ["desktop", 0o750, "unsafe private permissions"],
  ["home/.claude-secure-storage", 0o755, "unsafe private permissions"],
  ["desktop/logs", 0o777, "writable persistent state"], ["desktop/orchestra.settings", 0o666, "writable persistent state"],
] as const) {
  test(`POSIX permission enforcement; Windows does not claim ACL validation: ${path || "root"}`, () => {
    const f = fixture()
    const selected = join(f.p.root, path)
    if (path.endsWith("settings")) writeFileSync(selected, "owned settings")
    else mkdirSync(selected, { recursive: true, mode: 0o700 })
    chmodSync(selected, mode)
    rmSync(f.p.cache, { recursive: true })
    check(f, process.platform === "win32" ? undefined : `candidate-profile: ${error}`)
    expect(existsSync(f.p.cache)).toBe(process.platform === "win32")
  })
}

test("effective UID protects root and nested ownership on POSIX, without a Windows UID/ACL claim", () => {
  const f = fixture()
  const nested = join(f.p.desktop, "settings")
  writeFileSync(nested, "owned settings")
  for (const selected of [f.p.root, nested]) {
    check(f, process.platform === "win32" ? undefined : "candidate-profile: path not owned by effective uid", `
      const original = fs.lstatSync;
      fs.lstatSync = (...args) => {
        const info = original(...args);
        if (args[0] === ${JSON.stringify(selected)} && info) Object.defineProperty(info, "uid", { value: info.uid + 1 });
        return info;
      };
      syncBuiltinESMExports();
    `)
  }
})

test("owned Claude roots cannot query default credentials: synthetic lookup recorder only", () => {
  const f = fixture()
  const env = candidateEnvironment(f.p, { ...process.env, CLAUDE_CONFIG_DIR: "/host/config", CLAUDE_SECURESTORAGE_CONFIG_DIR: "" })
  run(resolve(import.meta.dir, "../../../orchestra"), `
    import assert from "node:assert/strict";
    const env = ${JSON.stringify(env)};
    const build = await Bun.build({ entrypoints: ["./src/claude-code/sdk.ts"], target: "node",
      plugins: [{ name: "synthetic-model-boundary", setup(build) {
        build.onResolve({ filter: /^@anthropic-ai\\/claude-agent-sdk$/ }, () => ({ path: "query", namespace: "synthetic" }));
        build.onLoad({ filter: /.*/, namespace: "synthetic" }, () => ({ loader: "js",
          contents: 'export const query = () => { throw Error("forbidden model query") }' }));
      } }] });
    assert.equal(build.success, true, build.logs.join("\\n"));
    await Bun.write(${JSON.stringify(join(env.TMPDIR, "sdk-recorder.mjs"))}, build.outputs[0]);
    const node = Bun.spawnSync(["node", "--input-type=module", "--eval", ${JSON.stringify(`
      import assert from "node:assert/strict"; import cp from "node:child_process";
      import { syncBuiltinESMExports } from "node:module"; import { pathToFileURL } from "node:url"; import { join } from "node:path";
      const lookups = []; let spawns = 0;
      Object.defineProperty(process, "platform", { value: "darwin" });
      cp.spawn = () => { throw Error("forbidden process") };
      cp.spawnSync = (command, args) => { assert.equal(command, "security");
        lookups.push(args[args.indexOf("-s") + 1]); return { status: 44, stdout: "" } };
      syncBuiltinESMExports();
      const sdk = await import(pathToFileURL(${JSON.stringify(join(env.TMPDIR, "sdk-recorder.mjs"))}).href);
      const lookup = async (env) => {
        const life = sdk.processLifetime({ env, spawnClaudeCodeProcess: () => { spawns++; throw Error("forbidden Claude spawn") } });
        assert.throws(() => life.options.spawnClaudeCodeProcess({ command: "unused", args: [], env: life.options.env,
          signal: new AbortController().signal }), /Claude Code machine login unavailable/);
        await life.join();
      };
      const env = ${JSON.stringify(env)};
      await lookup({ HOME: env.HOME }); assert.deepEqual(lookups, ["Claude Code-credentials"]);
      lookups.length = 0; await lookup(env); assert.equal(lookups.length, 1);
      assert.match(lookups[0], /^Claude Code-credentials-[0-9a-f]{8}$/);
      assert.notEqual(lookups[0], "Claude Code-credentials");
      assert.equal(sdk.credentialStorage(env, env.HOME).file, join(env.CLAUDE_SECURESTORAGE_CONFIG_DIR, ".credentials.json"));
      assert.equal(spawns, 0);
    `)}], { env, stdout: "pipe", stderr: "pipe" });
    assert.equal(node.exitCode, 0, node.stderr.toString());
  `, env)
  expect(env.CLAUDE_CONFIG_DIR).toBe(join(f.p.home, ".claude"))
  expect(env.CLAUDE_SECURESTORAGE_CONFIG_DIR).toBe(join(f.p.home, ".claude-secure-storage"))
  expect(existsSync(env.CLAUDE_CONFIG_DIR)).toBe(true)
  expect(existsSync(env.CLAUDE_SECURESTORAGE_CONFIG_DIR)).toBe(true)
})

test("compiled false/undefined cannot bypass machine policy; compiled true still requires valid child profile", () => {
  const f = fixture()
  run(resolve(import.meta.dir, "../../../orchestra"), `
    import { mock } from "bun:test"; import assert from "node:assert/strict";
    import fs from "node:fs"; import { join, resolve } from "node:path";
    let policyReads = 0;
    Object.defineProperty(process, "platform", { value: "darwin" });
    mock.module("fs", () => ({ ...fs, existsSync: (p) => p.includes("Managed Preferences") || fs.existsSync(p) }));
    const boundary = resolve("./src/util/process.ts");
    mock.module(boundary, () => ({ Process: { run: async () => {
      policyReads++; return { code: 0, stdout: Buffer.from('{"machine":true}') };
    } } }));
    const env = ${JSON.stringify(candidateEnvironment(f.p))};
    await Bun.write(join(env.TMPDIR, "tsconfig.json"), JSON.stringify({ compilerOptions: { paths: { "@/*": [resolve("./src/*")] } } }));
    for (const mode of [false, undefined, true]) {
      Object.assign(process.env, env); process.env.ORCHESTRA_CANDIDATE_BUILD = "true";
      const build = await Bun.build({ entrypoints: ["./src/config/managed.ts"], target: "bun",
        define: mode === undefined ? {} : { ORCHESTRA_CANDIDATE_BUILD: JSON.stringify(mode) },
        plugins: [{ name: "synthetic-policy-boundary", setup(build) {
          build.onResolve({ filter: /^@\\/util\\/process$/ }, () => ({ path: boundary, external: true }));
        } }] });
      assert.equal(build.success, true, build.logs.join("\\n"));
      const file = join(env.TMPDIR, "managed-" + mode + ".mjs");
      await Bun.write(file, build.outputs[0]); const m = await import(file);
      const before = policyReads;
      if (mode !== true) {
        assert.equal((await m.readManagedPreferences()).text, '{"machine":true}');
        assert.equal(policyReads, before + 1);
        process.env.ORCHESTRA_CANDIDATE_PROFILE_ROOT = "relative";
        assert.equal((await m.readManagedPreferences()).text, '{"machine":true}');
        continue;
      }
      assert.equal(await m.readManagedPreferences(), undefined); assert.equal(policyReads, before);
      delete process.env.ORCHESTRA_LEAN_CANDIDATE;
      await assert.rejects(m.readManagedPreferences(), /candidate environment required/);
      process.env.ORCHESTRA_LEAN_CANDIDATE = "1";
      process.env.ORCHESTRA_CANDIDATE_PROFILE_ROOT = "relative";
      await assert.rejects(m.readManagedPreferences(), /absolute root required/);
      process.env.ORCHESTRA_CANDIDATE_PROFILE_ROOT = env.ORCHESTRA_CANDIDATE_PROFILE_ROOT;
      process.env.HOME = "/foreign";
      await assert.rejects(m.readManagedPreferences(), /invalid owned profile/);
      process.env.HOME = env.HOME;
      const marker = join(env.ORCHESTRA_CANDIDATE_PROFILE_ROOT, ".orchestra-lean-candidate.json");
      const ownership = await Bun.file(marker).text();
      await Bun.write(marker, "forged foreign marker");
      await assert.rejects(m.readManagedPreferences(), /invalid owned profile/);
      fs.unlinkSync(marker);
      await assert.rejects(m.readManagedPreferences(), /invalid owned profile/);
      await Bun.write(marker, ownership);
      assert.equal(policyReads, before);
    }
  `, candidateEnvironment(f.p))
})

function check(
  f: { p: CandidateProfile; appData: string }, error?: string, before = "", overrides: NodeJS.ProcessEnv = {},
) {
  run(import.meta.dir, `
    import assert from "node:assert/strict"; import fs from "node:fs"; import { syncBuiltinESMExports } from "node:module";
    ${before}
    const { initializeCandidateProfile } = await import("./candidate-profile.ts");
    const calls = [];
    const app = { getPath: () => ${JSON.stringify(f.appData)}, setPath: (...x) => calls.push(x),
      setName: (...x) => calls.push(x), setAppUserModelId: (...x) => calls.push(x) };
    ${error ? `assert.throws(() => initializeCandidateProfile(app, true), { message: ${JSON.stringify(error)} }); assert.deepEqual(calls, []);`
      : `assert.equal(initializeCandidateProfile(app, true).root, process.env.ORCHESTRA_CANDIDATE_PROFILE_ROOT);`}
  `, { ...candidateEnvironment(f.p), ...overrides }, "node")
}

function run(cwd: string, script: string, env: NodeJS.ProcessEnv, executable = process.execPath) {
  const result = Bun.spawnSync([executable, ...(executable === "node" ? ["--input-type=module"] : []), "--eval", script], {
    cwd, env, stdout: "pipe", stderr: "pipe",
  })
  expect({ exit: result.exitCode, error: result.stderr.toString() }).toEqual({ exit: 0, error: "" })
}
