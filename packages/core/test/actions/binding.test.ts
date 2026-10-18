import { describe, expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Effect, Exit, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import path from "node:path"
import fs from "node:fs/promises"
import { ActionsBinding } from "../../src/actions/binding"
import { ActionsContract } from "../../src/actions/contract"
import { ActionsError } from "../../src/actions/error"
import { ActionsState } from "../../src/actions/state"
import { LayerNode } from "../../src/effect/layer-node"
import { FSUtil } from "../../src/fs-util"
import { AppProcess } from "../../src/process"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([AppProcess.node, FSUtil.node])))
const github: Actions.Provider = { kind: "github", hostname: "github.com", apiOrigin: "https://api.github.com" }
const request: Actions.BindingInput = { remote: "origin", provider: github, projectPath: "acme/widgets" }
const identity: ActionsContract.BindingIdentity = { projectID: "R_42", projectPath: "acme/widgets", account: "ada" }
const failure = (effect: Effect.Effect<unknown, ActionsError>) => effect.pipe(Effect.flip)

const git = Effect.fnUntraced(function* (directory: string, args: string[]) {
  const proc = yield* AppProcess.Service
  const result = yield* proc.run(ChildProcess.make("git", args, { cwd: directory, extendEnv: true, stdin: "ignore" }))
  expect(result.exitCode).toBe(0)
})

const fixture = Effect.fnUntraced(function* () {
  const filesystem = yield* FSUtil.Service
  const root = yield* filesystem.makeTempDirectoryScoped()
  const directory = path.join(root, "repo")
  const stateDirectory = path.join(root, "data")
  yield* filesystem.makeDirectory(directory)
  yield* git(directory, ["init"])
  yield* git(directory, ["remote", "add", "origin", "https://github.com/acme/widgets.git"])
  const calls: { provider: Actions.Provider; projectPath: string }[] = []
  const resolve: ActionsContract.BindingResolver = (provider, projectPath) => Effect.sync(() => {
    calls.push({ provider, projectPath })
    return { ...identity, projectPath }
  })
  const options = { directory, stateDirectory, projectID: "core-project", resolve }
  const open = (overrides: Partial<typeof options> & { workspaceID?: string } = {}) => ActionsBinding.make({ ...options, ...overrides })
  const file = (binding: Actions.Binding) => path.join(stateDirectory, "actions", options.projectID,
    ActionsState.locationKey(binding.directory, binding.workspaceID), "bindings.json")
  return { filesystem, root, directory, stateDirectory, calls, open, file }
})

describe("ActionsBinding", () => {
  it.live("round-trips bindings and policy, stable IDs, updates and removal through fresh store instances", () => Effect.gen(function* () {
    const f = yield* fixture()
    const service = yield* f.open()
    expect(yield* service.list()).toEqual([])
    const binding = yield* service.create(request)
    expect(binding).toMatchObject({ revision: 1, remote: "origin", provider: github, ...identity })
    expect(binding.id).toStartWith("ab_")
    expect(binding.workspaceID).toBeUndefined()
    expect(Schema.is(Actions.Binding)(binding)).toBe(true)
    const policy = { retentionDays: 30, execution: "manual" }
    expect(yield* service.policy(binding)).toEqual({ binding: { id: binding.id, revision: 1 }, policy: {} })
    const saved = yield* service.updatePolicy(binding, policy)
    expect(saved).toEqual({ binding: { id: binding.id, revision: 2 }, policy })
    const refreshed = yield* service.get(saved.binding)
    const reopened = yield* f.open({ directory: path.join(f.directory, "nested", "..") })
    expect(yield* reopened.list()).toEqual([refreshed])
    expect(yield* reopened.get(saved.binding)).toEqual(refreshed)
    expect(yield* reopened.policy(saved.binding)).toEqual(saved)
    const updated = yield* reopened.update(binding.id, { ...request, expectedRevision: saved.binding.revision })
    expect(updated.id).toBe(binding.id)
    expect(updated.revision).toBe(3)
    expect(yield* service.get(updated)).toEqual(updated)
    expect(yield* service.policy(updated)).toEqual({ binding: { id: binding.id, revision: 3 }, policy })
    const disk = yield* f.filesystem.readFileString(f.file(updated))
    expect(JSON.parse(disk)).toEqual({ version: 1, records: [{ binding: updated, policy }] })
    yield* reopened.remove(updated)
    expect(yield* service.list()).toEqual([])
    expect((yield* service.get(updated).pipe(Effect.flip)).kind).toBe("binding_missing")
    expect(JSON.parse(yield* f.filesystem.readFileString(f.file(updated)))).toEqual({ version: 1, records: [] })
  }))

  it.live("rejects named git remote host mismatch before resolver", () => Effect.gen(function* () {
    const f = yield* fixture()
    const service = yield* f.open()
    const binding = yield* service.create(request)
    expect(f.calls).toHaveLength(1)
    yield* git(f.directory, ["remote", "set-url", "origin", "https://github.com.attacker.example/acme/widgets.git"])
    const error = yield* service.update(binding.id, { ...request, expectedRevision: 1 }).pipe(Effect.flip)
    expect(error.kind).toBe("host_mismatch")
    expect(f.calls).toHaveLength(1)
    expect(yield* service.get(binding)).toEqual(binding)
    yield* git(f.directory, ["remote", "set-url", "origin", "https://github.com/acme/widgets.git"])
    expect((yield* service.update(binding.id, { ...request, expectedRevision: 1 })).revision).toBe(2)
  }))

  it.live("accepts public SSH aliases and explicit canonical self-hosted GitHub and GitLab", () => Effect.gen(function* () {
    const f = yield* fixture()
    const service = yield* f.open()
    yield* Effect.forEach([
      { url: "git@github.com:acme/widgets.git", provider: github },
      { url: "ssh://git@ssh.github.com:443/acme/widgets.git", provider: github },
      { url: "https://github.com/acme/widgets", provider: github },
      { url: "git@gitlab.com:acme/platform/widgets.git", provider: { kind: "gitlab", hostname: "gitlab.com", apiOrigin: "https://gitlab.com" } },
      { url: "ssh://git@altssh.gitlab.com:443/acme/platform/widgets.git", provider: { kind: "gitlab", hostname: "gitlab.com", apiOrigin: "https://gitlab.com" } },
      { url: "ssh://git@ghe.example:2222/acme/widgets.git", provider: { kind: "github", hostname: "ghe.example", apiOrigin: "https://ghe.example" } },
      { url: "https://git.example:8443/acme/platform/widgets.git", provider: { kind: "gitlab", hostname: "git.example:8443", apiOrigin: "https://git.example:8443" } },
    ] satisfies { url: string; provider: Actions.Provider }[], (entry) => Effect.gen(function* () {
      yield* git(f.directory, ["remote", "set-url", "origin", entry.url])
      const projectPath = entry.provider.kind === "gitlab" ? "acme/platform/widgets" : "acme/widgets"
      const binding = yield* service.create({ remote: "origin", provider: entry.provider, projectPath })
      expect(binding.provider).toEqual(entry.provider)
      expect(binding.projectPath).toBe(projectPath)
      expect(f.calls.at(-1)).toEqual({ provider: entry.provider, projectPath })
      yield* service.remove(binding)
    }))
  }))

  it.live("rejects credentials, URL rewrites, ambiguous remotes, path traversal and mismatched API origins safely", () => Effect.gen(function* () {
    const f = yield* fixture()
    const service = yield* f.open()
    const positive = yield* service.create(request)
    yield* service.remove(positive)
    yield* Effect.forEach([
      "https://secret-user:secret-password@github.com/acme/widgets.git",
      "https://secret-token@github.com/acme/widgets.git",
      "ssh://secret-token@github.com/acme/widgets.git",
      "https://github.com/acme/../acme/widgets.git",
      "https://github.com/acme/%77idgets.git",
      "https://github.com/acme/other.git",
      "https://ssh.github.com/acme/widgets.git",
      "file:///acme/widgets.git",
    ], (remote) => Effect.gen(function* () {
      yield* git(f.directory, ["remote", "set-url", "origin", remote])
      const error = yield* service.create(request).pipe(Effect.flip)
      expect(["invalid_input", "host_mismatch"]).toContain(error.kind)
      expect(JSON.stringify(error)).not.toContain("secret-")
    }))
    yield* git(f.directory, ["remote", "set-url", "origin", "https://github.com/acme/widgets.git"])
    yield* git(f.directory, ["config", "url.https://evil.example/.insteadOf", "https://github.com/"])
    expect((yield* service.create(request).pipe(Effect.flip)).kind).toBe("host_mismatch")
    yield* git(f.directory, ["config", "--unset", "url.https://evil.example/.insteadOf"])
    yield* git(f.directory, ["config", "--add", "remote.origin.url", "https://evil.example/acme/widgets.git"])
    expect((yield* service.create(request).pipe(Effect.flip)).kind).toBe("host_mismatch")
    yield* Effect.forEach([
      { ...github, apiOrigin: "https://evil.example" },
      { ...github, hostname: "gitlab.com" },
      { ...github, hostname: "ghe.example", apiOrigin: "https://api.ghe.example" },
      { ...github, apiOrigin: "https://secret-token@api.github.com" },
      { ...github, apiOrigin: "https://api.github.com/api/v3" },
    ], (provider) => Effect.gen(function* () {
      const error = yield* service.create({ ...request, provider }).pipe(Effect.flip)
      expect(["invalid_input", "host_mismatch"]).toContain(error.kind)
      expect(error.message).not.toContain("secret-")
    }))
    expect((yield* service.create({ ...request, remote: "missing" }).pipe(Effect.flip)).kind).toBe("invalid_input")
    expect((yield* service.create({ ...request, projectPath: "../widgets" }).pipe(Effect.flip)).kind).toBe("invalid_input")
    expect(f.calls).toHaveLength(1)
  }))

  it.live("rejects client-supplied ID/account/native identity and unknown policy secrets", () => Effect.gen(function* () {
    const f = yield* fixture()
    const service = yield* f.open()
    yield* Effect.forEach([
      { ...request, id: "ab_client" }, { ...request, account: "secret-token" }, { ...request, projectID: "client-native" },
    ], (input) => Effect.gen(function* () {
      expect((yield* service.create(input).pipe(Effect.flip)).kind).toBe("invalid_input")
    }))
    const binding = yield* service.create(request)
    const secret = { retentionDays: 10, token: "secret-token" }
    expect((yield* service.updatePolicy(binding, secret).pipe(Effect.flip)).kind).toBe("invalid_input")
    expect(yield* service.policy(binding)).toEqual({ binding: { id: binding.id, revision: 1 }, policy: {} })
    expect(yield* f.filesystem.readFileString(f.file(binding))).not.toContain("secret-token")
  }))

  it.live("requires expected revision and rejects stale get/remove/policy/update without disk changes", () => Effect.gen(function* () {
    const f = yield* fixture()
    const service = yield* f.open()
    const binding = yield* service.create(request)
    expect((yield* service.update(binding.id, request).pipe(Effect.flip)).kind).toBe("binding_stale")
    const updated = yield* service.update(binding.id, { ...request, expectedRevision: 1 })
    const before = yield* f.filesystem.readFileString(f.file(binding))
    yield* Effect.forEach([
      service.get(binding), service.remove(binding), service.policy(binding), service.updatePolicy(binding, { retentionDays: 10 }),
      service.update(binding.id, { ...request, expectedRevision: 1 }),
    ], (effect) => Effect.gen(function* () {
      expect((yield* failure(effect)).kind).toBe("binding_stale")
    }))
    expect(yield* f.filesystem.readFileString(f.file(binding))).toBe(before)
    expect(yield* service.get(updated)).toEqual(updated)
  }))

  it.live("serializes concurrent same-key updates across separately constructed stores", () => Effect.gen(function* () {
    const f = yield* fixture()
    const first = yield* f.open()
    const second = yield* f.open({ directory: path.join(f.directory, ".") })
    const binding = yield* first.create(request)
    const results = yield* Effect.all([
      first.update(binding.id, { ...request, expectedRevision: 1 }).pipe(Effect.exit),
      second.update(binding.id, { ...request, expectedRevision: 1 }).pipe(Effect.exit),
    ], { concurrency: "unbounded" })
    const successes = results.filter(Exit.isSuccess)
    expect(successes).toHaveLength(1)
    expect(results.filter(Exit.isFailure)).toHaveLength(1)
    const final = yield* first.get({ id: binding.id, revision: 2 })
    expect(final).toEqual(successes[0].value)
    expect((yield* second.update(binding.id, { ...request, expectedRevision: 1 }).pipe(Effect.flip)).kind).toBe("binding_stale")
  }))

  it.live("keeps native project ID and provider immutable, permits proven same-ID rename", () => Effect.gen(function* () {
    const f = yield* fixture()
    const service = yield* f.open()
    const binding = yield* service.create(request)
    const replacement = yield* f.open({ resolve: () => Effect.succeed({ ...identity, projectID: "R_different" }) })
    expect((yield* replacement.update(binding.id, { ...request, expectedRevision: 1 }).pipe(Effect.flip)).kind).toBe("binding_stale")
    yield* git(f.directory, ["remote", "set-url", "origin", "https://ghe.example/acme/widgets.git"])
    expect((yield* service.update(binding.id, { ...request, expectedRevision: 1,
      provider: { ...github, hostname: "ghe.example", apiOrigin: "https://ghe.example" } }).pipe(Effect.flip)).kind).toBe("binding_stale")
    yield* git(f.directory, ["remote", "set-url", "origin", "https://github.com/acme/renamed.git"])
    const renamed = yield* service.update(binding.id, { ...request, projectPath: "acme/renamed", expectedRevision: 1 })
    expect(renamed).toMatchObject({ id: binding.id, revision: 2, projectID: binding.projectID, projectPath: "acme/renamed" })
  }))

  it.live("isolates canonical directories, core projects and explicit workspaces; rejects forged persisted Location", () => Effect.gen(function* () {
    const f = yield* fixture()
    const implicit = yield* f.open()
    const binding = yield* implicit.create(request)
    const explicit = yield* f.open({ workspaceID: "workspace-1" })
    const otherProject = yield* f.open({ projectID: "other-project" })
    const otherDirectory = path.join(f.root, "other-repo")
    yield* f.filesystem.makeDirectory(otherDirectory)
    yield* git(otherDirectory, ["init"])
    const other = yield* f.open({ directory: otherDirectory })
    yield* Effect.forEach([explicit, otherProject, other], (store) => Effect.gen(function* () {
      expect(yield* store.list()).toEqual([])
      yield* Effect.forEach([store.get(binding), store.remove(binding), store.policy(binding), store.updatePolicy(binding, {})], (effect) =>
        failure(effect).pipe(Effect.map((error) => expect(error.kind).toBe("binding_missing"))))
    }))
    const second = yield* explicit.create(request)
    expect(second.workspaceID).toBe("workspace-1")
    expect(second.id).not.toBe(binding.id)
    const disk = JSON.parse(yield* f.filesystem.readFileString(f.file(binding)))
    yield* f.filesystem.writeFileString(f.file(second), JSON.stringify(disk))
    expect((yield* explicit.get(second).pipe(Effect.flip)).kind).toBe("maintenance_required")
  }))

  it.live("corrupt state fails closed for every CRUD operation and remains untouched", () => Effect.gen(function* () {
    const f = yield* fixture()
    const service = yield* f.open()
    const binding = yield* service.create(request)
    const valid = JSON.parse(yield* f.filesystem.readFileString(f.file(binding)))
    yield* Effect.forEach([
      "{bad-json secret-token", "{}", JSON.stringify({ ...valid, version: 9 }),
      JSON.stringify({ ...valid, token: "secret-token" }),
      JSON.stringify({ ...valid, records: [...valid.records, ...valid.records] }),
      JSON.stringify({ ...valid, records: [{ binding: { ...binding, revision: 0 }, policy: {} }] }),
    ], (text) => Effect.gen(function* () {
      yield* f.filesystem.writeFileString(f.file(binding), text)
      yield* Effect.forEach([
        service.list(), service.get(binding), service.policy(binding), service.create(request), service.remove(binding),
        service.update(binding.id, { ...request, expectedRevision: 1 }), service.updatePolicy(binding, {}),
      ], (effect) => Effect.gen(function* () {
        const error = yield* failure(effect)
        expect(error.kind).toBe("maintenance_required")
        expect(JSON.stringify(error)).not.toContain("secret-token")
      }))
      expect(yield* f.filesystem.readFileString(f.file(binding))).toBe(text)
    }))
  }))

  it.live("rejects repository-contained state, unsafe path segments and symlinked state files", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* Effect.forEach(["..", "../escape", "project/escape", "CON", "", "project:escape"], (projectID) =>
      f.open({ projectID }).pipe(Effect.flip, Effect.map((error) => expect(error.kind).toBe("invalid_input"))))
    expect((yield* f.open({ stateDirectory: path.join(f.directory, "state") }).pipe(Effect.flip)).kind).toBe("invalid_input")
    const alias = path.join(f.root, "repo-alias")
    yield* Effect.promise(() => fs.symlink(f.directory, alias, process.platform === "win32" ? "junction" : "dir"))
    expect((yield* f.open({ stateDirectory: path.join(alias, "state") }).pipe(Effect.flip)).kind).toBe("invalid_input")
    const service = yield* f.open()
    const binding = yield* service.create(request)
    const aliased = yield* f.open({ directory: alias })
    expect(yield* aliased.get(binding)).toEqual(binding)
    const moved = path.join(f.root, "moved.json")
    yield* f.filesystem.rename(f.file(binding), moved)
    yield* Effect.promise(() => fs.symlink(moved, f.file(binding), "file"))
    expect((yield* service.list().pipe(Effect.flip)).kind).toBe("maintenance_required")
  }))

  it.live("non-directory state ancestors never masquerade as missing or empty state", () => Effect.gen(function* () {
    const f = yield* fixture()
    yield* f.filesystem.writeFileString(f.stateDirectory, "blocked state root")
    const service = yield* f.open()
    expect((yield* service.list().pipe(Effect.flip)).kind).toBe("maintenance_required")
    expect((yield* service.create(request).pipe(Effect.flip)).kind).toBe("maintenance_required")
    expect(yield* f.filesystem.readFileString(f.stateDirectory)).toBe("blocked state root")
  }))

  it.live("inherited git placement and config cannot bind repository B at Location A", () => Effect.gen(function* () {
    const f = yield* fixture()
    const proc = yield* AppProcess.Service
    const other = path.join(f.root, "repository-b")
    yield* f.filesystem.makeDirectory(other)
    yield* git(other, ["init"])
    yield* git(other, ["remote", "add", "origin", "https://github.com/acme/other.git"])
    const script = path.join(f.root, "binding-probe.ts")
    yield* f.filesystem.writeFileString(script, `
import { Effect } from ${JSON.stringify(import.meta.resolve("effect"))}
import { ActionsBinding } from ${JSON.stringify(new URL("../../src/actions/binding.ts", import.meta.url).href)}
import { AppProcess } from ${JSON.stringify(new URL("../../src/process.ts", import.meta.url).href)}
import { FSUtil } from ${JSON.stringify(new URL("../../src/fs-util.ts", import.meta.url).href)}
import { LayerNode } from ${JSON.stringify(new URL("../../src/effect/layer-node.ts", import.meta.url).href)}
const calls = []
const effect = Effect.gen(function* () {
  const proc = yield* AppProcess.Service
  const observed = { ...proc, run: (command, options) => {
    calls.push({ extendEnv: command.options.extendEnv, keys: Object.keys(command.options.env ?? {}).filter((key) => /^GIT_/i.test(key)) })
    return proc.run(command, options)
  } }
  const service = yield* ActionsBinding.make({ directory: process.argv[2], stateDirectory: process.argv[3], projectID: "core-project", resolve: (_, projectPath) => Effect.succeed({ projectID: "R_42", projectPath, account: "ada" }) }).pipe(Effect.provideService(AppProcess.Service, observed))
  return yield* service.create({ remote: "origin", provider: ${JSON.stringify(github)}, projectPath: process.argv[4] })
})
await Effect.runPromise(effect.pipe(Effect.provide(LayerNode.compile(LayerNode.group([AppProcess.node, FSUtil.node]))))).then(
  (binding) => console.log(JSON.stringify({ binding, calls })), (error) => console.log(JSON.stringify({ kind: error.kind, calls })))
`)
    const decode = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({
      kind: Schema.optional(Schema.String), binding: Schema.optional(Actions.Binding),
      calls: Schema.Array(Schema.Struct({ extendEnv: Schema.Boolean, keys: Schema.Array(Schema.String) })),
    })))
    yield* Effect.forEach([
      { GIT_DIR: path.join(other, ".git"), GIT_WORK_TREE: other, GIT_COMMON_DIR: path.join(other, ".git") },
      { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "remote.origin.url", GIT_CONFIG_VALUE_0: "https://github.com/acme/other.git" },
      { GIT_CONFIG_PARAMETERS: "'remote.origin.url=https://github.com/acme/other.git'" },
      { gIt_DiR: path.join(other, ".git"), gIt_WoRk_TrEe: other, gIt_CoNfIg_CoUnT: "0" },
    ], (overrides, index) => Effect.gen(function* () {
      const env = { ...process.env, ...overrides }
      const control = yield* proc.run(ChildProcess.make("git", index === 1 || index === 2
        ? ["config", "--get", "remote.origin.url"] : ["remote", "get-url", "origin"], { cwd: f.directory, env, extendEnv: false }))
      expect(control.exitCode).toBe(0)
      expect(control.stdout.toString("utf8").trim()).toBe(index === 3 && process.platform !== "win32"
        ? "https://github.com/acme/widgets.git" : "https://github.com/acme/other.git")
      const run = (projectPath: string) => proc.run(ChildProcess.make(process.execPath,
        [script, f.directory, path.join(f.root, `probe-state-${index}`), projectPath], { cwd: f.directory, env, extendEnv: false }))
        .pipe(Effect.map((result) => { expect(result.exitCode).toBe(0); return decode(result.stdout.toString("utf8")) }))
      expect(yield* run("acme/other")).toMatchObject({ kind: "host_mismatch" })
      const actual = yield* run("acme/widgets")
      expect(actual.binding).toMatchObject({ directory: yield* ActionsState.canonical(f.directory), projectPath: "acme/widgets" })
      expect(actual.calls.length).toBeGreaterThan(0)
      expect(actual.calls.every((call) => !call.extendEnv && call.keys.length === 0)).toBe(true)
    }))
  }), 120_000)

  it.live("competing policy edits have one winner and invalidate old binding leases", () => Effect.gen(function* () {
    const f = yield* fixture()
    const first = yield* f.open()
    const second = yield* f.open()
    const binding = yield* first.create(request)
    const lease = Actions.OperationIntent.make({ clientID: "prepared-before-policy", binding, kind: "workflow.dispatch", target: {} })
    const results = yield* Effect.all([
      first.updatePolicy(binding, { retentionDays: 10 }).pipe(Effect.result),
      second.updatePolicy(binding, { retentionDays: 20 }).pipe(Effect.result),
    ], { concurrency: "unbounded" })
    const winners = results.filter((result) => result._tag === "Success")
    expect(winners).toHaveLength(1)
    expect(results.filter((result) => result._tag === "Failure").map((result) => result.failure.kind)).toEqual(["binding_stale"])
    const winner = winners[0].success
    expect(winner.binding).toEqual({ id: binding.id, revision: 2 })
    const reopened = yield* f.open()
    expect(yield* reopened.policy(winner.binding)).toEqual(winner)
    expect(yield* reopened.get(winner.binding)).toEqual({ ...binding, revision: 2 })
    expect((yield* reopened.get(lease.binding).pipe(Effect.flip)).kind).toBe("binding_stale")
    expect((yield* reopened.update(binding.id, { ...request, expectedRevision: 1 }).pipe(Effect.flip)).kind).toBe("binding_stale")
    expect((yield* reopened.updatePolicy(binding, {}).pipe(Effect.flip)).kind).toBe("binding_stale")
  }))

  const pathWhitespace = process.platform === "win32" ? it.live.skip : it.live
  it.live("legal repository path spaces preserve Location and reject internal state on both platforms", () => Effect.gen(function* () {
    const f = yield* fixture()
    const directory = path.join(f.root, "repo legal spaces")
    yield* f.filesystem.rename(f.directory, directory)
    const service = yield* f.open({ directory })
    expect((yield* service.create(request)).directory).toBe(yield* ActionsState.canonical(directory))
    expect((yield* f.open({ directory, stateDirectory: path.join(directory, "state") }).pipe(Effect.flip)).kind).toBe("invalid_input")
  }))
  Array.of({ label: "space", suffix: " " }, { label: "CR", suffix: "\r" }).forEach((entry) =>
    pathWhitespace(`ending-${entry.label} repository preserves whitespace and rejects internal state (POSIX-only path)`, () => Effect.gen(function* () {
      const f = yield* fixture()
      const directory = path.join(f.root, `repo${entry.suffix}`)
      yield* f.filesystem.makeDirectory(directory)
      yield* git(directory, ["init"])
      yield* git(directory, ["remote", "add", "origin", "https://github.com/acme/widgets.git"])
      const service = yield* f.open({ directory })
      expect((yield* service.create(request)).directory).toBe(yield* ActionsState.canonical(directory))
      expect((yield* f.open({ directory, stateDirectory: path.join(directory, "state") }).pipe(Effect.flip)).kind).toBe("invalid_input")
      expect(yield* f.filesystem.exists(path.join(directory, "state"))).toBe(false)
    })),
  )
})
