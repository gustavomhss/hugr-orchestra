import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir, userInfo } from "node:os"
import { join, resolve } from "node:path"
import { candidateEnvironment, initializeCandidateProfile, type CandidateProfile } from "./candidate-profile"

const saved = { ...process.env }
let base: string
beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "candidate-isolation-")))
  for (const key of ["ORCHESTRA_CANDIDATE_PROFILE_ROOT", "ORCHESTRA_LEAN_CANDIDATE",
    "XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME"]) delete process.env[key]
})
afterEach(() => {
  Object.keys(process.env).forEach((key) => { if (!(key in saved)) delete process.env[key] })
  Object.assign(process.env, saved)
  rmSync(base, { recursive: true, force: true })
})

function fixture() {
  const calls: unknown[] = []
  const paths: Record<string, string> = { appData: join(base, "appData") }
  const app: Parameters<typeof initializeCandidateProfile>[0] = {
    getPath: (name) => paths[name],
    setPath: (name, value) => { paths[name] = value; calls.push([name, value]) },
    setName: (name) => { calls.push(["name", name]) },
    setAppUserModelId: (id) => { calls.push(["id", id]) },
  }
  return { app, calls, paths }
}

test("normal build ignores candidate environment and does not touch app or files", () => {
  const f = fixture()
  process.env.ORCHESTRA_LEAN_CANDIDATE = "1"
  process.env.ORCHESTRA_CANDIDATE_PROFILE_ROOT = "relative/invalid"
  const env = { ...process.env }
  expect(initializeCandidateProfile(f.app, false)).toBeUndefined()
  expect(process.env).toEqual(env)
  expect(f.calls).toEqual([])
  expect(readdirSync(base)).toEqual([])
})

test("candidate defaults to own absolute profile and isolated Electron paths", () => {
  const f = fixture()
  const p = initializeCandidateProfile(f.app, true)!
  expect(p.root).toBe(join(base, "appData", "ai.hugr.orchestra.lean.candidate"))
  expect(p.name).toBe("HuGR Lean Candidate")
  for (const key of ["desktop", "session", "home", "data", "config", "cache", "state", "tmp", "managed"] as const) {
    expect(p[key]).toBe(join(p.root, key))
    expect(existsSync(p[key])).toBe(true)
  }
  expect(p.db).toBe(join(p.root, "db", "orchestra.sqlite"))
  expect(f.calls.slice(0, 2)).toEqual([["name", p.name], ["id", p.appId]])
  expect(f.paths.userData).toBe(p.desktop)
  expect(f.paths.sessionData).toBe(p.session)
  expect(f.paths.temp).toBe(p.tmp)
  expect(f.paths.documents).toBe(join(p.home, "Documents"))
  expect(f.paths.downloads).toBe(join(p.home, "Downloads"))
  expect(process.env.ORCHESTRA_SIDECAR_V2).toBe("0")
})

test("rejects relative, home, production/dev/beta and symlink-alias roots before writes", () => {
  const f = fixture()
  for (const root of ["relative", userInfo().homedir, f.paths.appData,
    ...["ai.hugr.orchestra", "ai.hugr.orchestra.dev", "ai.hugr.orchestra.beta",
      "HuGR Orchestra", "HuGR Orchestra Dev", "HuGR Orchestra Beta"].map((id) => join(f.paths.appData, id, "child"))]) {
    process.env.ORCHESTRA_CANDIDATE_PROFILE_ROOT = root
    expect(() => initializeCandidateProfile(f.app, true)).toThrow(root === "relative" ? "root must be absolute" : "protected root")
  }
  const prod = join(f.paths.appData, "ai.hugr.orchestra")
  mkdirSync(prod, { recursive: true })
  writeFileSync(join(prod, "sentinel"), "keep production bytes")
  symlinkSync(prod, join(base, "alias"), "junction")
  process.env.ORCHESTRA_CANDIDATE_PROFILE_ROOT = join(base, "alias", "child")
  expect(() => initializeCandidateProfile(f.app, true)).toThrow("protected root")
  expect(readFileSync(join(prod, "sentinel"), "utf8")).toBe("keep production bytes")
  expect(readdirSync(prod)).toEqual(["sentinel"])
  expect(f.calls).toEqual([])
})

test("preserves nonempty unowned partial roots instead of adopting or deleting them", () => {
  const root = join(base, "unknown")
  mkdirSync(join(root, "desktop"), { recursive: true, mode: 0o700 })
  writeFileSync(join(root, "desktop", "orchestra.settings"), "unknown bytes")
  process.env.ORCHESTRA_CANDIDATE_PROFILE_ROOT = root
  expect(() => initializeCandidateProfile(fixture().app, true)).toThrow("nonempty unowned root")
  expect(readdirSync(root)).toEqual(["desktop"])
  expect(readFileSync(join(root, "desktop", "orchestra.settings"), "utf8")).toBe("unknown bytes")
})

test("owned relaunch preserves state and repairs missing directories with inherited candidate HOME/XDG", () => {
  const f = fixture()
  const p = initializeCandidateProfile(f.app, true)!
  writeFileSync(join(p.desktop, "orchestra.settings"), "candidate bytes")
  rmSync(p.cache, { recursive: true })
  relaunch(p, f.paths.appData)
  expect(existsSync(p.cache)).toBe(true)
  expect(readFileSync(join(p.desktop, "orchestra.settings"), "utf8")).toBe("candidate bytes")
})

test("rejects mismatched markers and escaping partial paths without filling missing directories", () => {
  const f = fixture()
  const p = initializeCandidateProfile(f.app, true)!
  const marker = join(p.root, ".orchestra-lean-candidate.json")
  const bytes = readFileSync(marker, "utf8")
  writeFileSync(marker, "foreign marker")
  relaunch(p, f.paths.appData, "candidate-profile: invalid ownership marker")
  writeFileSync(marker, bytes)
  rmSync(p.cache, { recursive: true })
  rmSync(p.data, { recursive: true })
  const outside = join(base, "outside")
  mkdirSync(outside)
  symlinkSync(outside, p.data, "junction")
  relaunch(p, f.paths.appData, "candidate-profile: path escapes owned root")
  expect(existsSync(p.cache)).toBe(false)
  expect(readdirSync(outside)).toEqual([])
})

test("candidate environment keeps toolchain PATH but excludes proxy/auth/token/telemetry and overrides all roots", () => {
  const p = initializeCandidateProfile(fixture().app, true)!
  const source = { PATH: "/tool/bin", JAVA_HOME: "/tool/java", HTTP_PROXY: "http://host", HTTPS_PROXY: "http://host",
    ALL_PROXY: "http://host", NODE_OPTIONS: "--require host.js", ANTHROPIC_API_KEY: "synthetic", CLAUDE_CODE_OAUTH_TOKEN: "synthetic",
    GH_TOKEN: "synthetic", OTEL_EXPORTER_OTLP_ENDPOINT: "http://host", UNKNOWN: "keep?", HOME: "/host", XDG_STATE_HOME: "/host",
    ORCHESTRA_DB: "/host/db", ORCHESTRA_INHERIT_CREDENTIALS: "1", ORCHESTRA_SIDECAR_V2: "1" }
  const env = candidateEnvironment(p, source)
  expect(env.PATH).toBe(source.PATH)
  expect(env.JAVA_HOME).toBe(source.JAVA_HOME)
  for (const key of Object.keys(source).filter((key) => !["PATH", "JAVA_HOME", "HOME", "XDG_STATE_HOME", "ORCHESTRA_DB",
    "ORCHESTRA_INHERIT_CREDENTIALS", "ORCHESTRA_SIDECAR_V2"].includes(key))) expect(env[key]).toBeUndefined()
  expect([env.HOME, env.USERPROFILE, env.ORCHESTRA_TEST_HOME]).toEqual([p.home, p.home, p.home])
  expect([env.XDG_DATA_HOME, env.XDG_CONFIG_HOME, env.XDG_CACHE_HOME, env.XDG_STATE_HOME]).toEqual([p.data, p.config, p.cache, p.state])
  expect([env.TMPDIR, env.TMP, env.TEMP]).toEqual([p.tmp, p.tmp, p.tmp])
  expect(env.ORCHESTRA_DB).toBe(p.db)
  expect(env.ORCHESTRA_TEST_MANAGED_CONFIG_DIR).toBe(p.managed)
  expect(env.ORCHESTRA_INHERIT_CREDENTIALS).toBe("0")
  expect(env.ORCHESTRA_SIDECAR_V2).toBe("0")
})

test("server blocks shell import/reintroduced secrets in candidate mode; normal mode still imports shell", () => {
  const p = initializeCandidateProfile(fixture().app, true)!
  run(resolve(import.meta.dir), `
    import { mock } from "bun:test"; import assert from "node:assert/strict";
    let shellReads = 0;
    mock.module("electron", () => ({ app: {}, utilityProcess: {} }));
    mock.module("./logging", () => ({ getLogger: () => ({}) }));
    mock.module("./store", () => ({ getStore: () => { throw Error("unexpected store read") } }));
    mock.module("./shell-env", () => ({ getUserShell: () => "synthetic-shell", loadShellEnv: () => {
      shellReads++; return { ANTHROPIC_API_KEY: "shell-secret", XDG_STATE_HOME: "/host/state" };
    } }));
    const { preferAppEnv, createSidecarEnv } = await import("./server.ts");
    const p = ${JSON.stringify(p)};
    process.env.ANTHROPIC_API_KEY = "host-secret"; process.env.HTTP_PROXY = "http://host";
    process.env.ORCHESTRA_SIDECAR_V2 = "1"; process.env.XDG_STATE_HOME = "/host/state";
    assert.equal(preferAppEnv(p.desktop, p), null); assert.equal(shellReads, 0);
    assert.equal(process.env.XDG_STATE_HOME, p.state); assert.equal(process.env.ANTHROPIC_API_KEY, undefined);
    process.env.GH_TOKEN = "late-secret"; process.env.HTTP_PROXY = "http://late";
    const env = createSidecarEnv(p); assert.equal(env.GH_TOKEN, undefined); assert.equal(env.HTTP_PROXY, undefined);
    assert.equal(env.ORCHESTRA_SIDECAR_V2, "0"); assert.equal(env.ORCHESTRA_DB, p.db);
    preferAppEnv("/normal"); assert.equal(shellReads, process.platform === "win32" ? 0 : 1);
    if (process.platform !== "win32") assert.equal(process.env.ANTHROPIC_API_KEY, "shell-secret");
    assert.equal(createSidecarEnv().GH_TOKEN, "late-secret");
    assert.equal(createSidecarEnv().ORCHESTRA_LEAN_CANDIDATE, undefined);
  `, candidateEnvironment(p))
})

test("normal backend candidate environment and owned marker cannot bypass machine policy", () => {
  const p = initializeCandidateProfile(fixture().app, true)!
  run(resolve(import.meta.dir, "../../../orchestra"), `
    import assert from "node:assert/strict"; import { mock } from "bun:test"; import fs from "node:fs";
    let policyReads = 0;
    Object.defineProperty(process, "platform", { value: "darwin" });
    mock.module("fs", () => ({ ...fs, existsSync: (p) => p.includes("Managed Preferences") || fs.existsSync(p) }));
    mock.module("./src/util/process", () => ({ Process: { run: async () => {
      policyReads++; return { code: 0, stdout: Buffer.from('{"machine":true}') };
    } } }));
    process.env.ORCHESTRA_CANDIDATE_BUILD = "true";
    const m = await import("./src/config/managed.ts");
    assert.equal(m.managedConfigDir(), ${JSON.stringify(p.managed)});
    assert.equal((await m.readManagedPreferences()).text, '{"machine":true}'); assert.equal(policyReads, 1);
    process.env.ORCHESTRA_CANDIDATE_PROFILE_ROOT = "relative";
    assert.equal(m.managedConfigDir(), ${JSON.stringify(p.managed)});
    process.env.ORCHESTRA_CANDIDATE_PROFILE_ROOT = ${JSON.stringify(p.root)};
    process.env.ORCHESTRA_TEST_MANAGED_CONFIG_DIR = "/host/managed";
    assert.equal(m.managedConfigDir(), "/host/managed");
    delete process.env.ORCHESTRA_LEAN_CANDIDATE;
    assert.equal(m.managedConfigDir(), "/host/managed");
    assert.equal((await m.readManagedPreferences()).text, '{"machine":true}'); assert.equal(policyReads, 2);
    assert.equal(m.parseManagedPlist('{"PayloadUUID":"mdm","keep":true}'), '{"keep":true}');
  `, candidateEnvironment(p))
})

// Electron uses Node's OS account lookup; Bun's Windows lookup follows the synthetic USERPROFILE instead.
function relaunch(p: CandidateProfile, appData: string, error?: string) {
  run(import.meta.dir, `
    import assert from "node:assert/strict"; import { initializeCandidateProfile } from "./candidate-profile.ts";
    const app = { getPath: () => ${JSON.stringify(appData)}, setPath() {}, setName() {}, setAppUserModelId() {} };
    ${error ? `assert.throws(() => initializeCandidateProfile(app, true), { message: ${JSON.stringify(error)} });`
      : `assert.deepEqual(initializeCandidateProfile(app, true), ${JSON.stringify(p)});`}
  `, candidateEnvironment(p), "node")
}

function run(cwd: string, script: string, env: Record<string, string>, executable = process.execPath) {
  const result = Bun.spawnSync([executable, ...(executable === "node" ? ["--input-type=module"] : []), "--eval", script], { cwd, env, stdout: "pipe", stderr: "pipe" })
  expect({ exit: result.exitCode, error: result.stderr.toString() }).toEqual({ exit: 0, error: "" })
}
