export * as ActionsBinding from "./binding"

import { Actions } from "@orchestra/schema/actions"
import { Effect, Option, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { FSUtil } from "../fs-util"
import { AppProcess } from "../process"
import { ActionsContract } from "./contract"
import { ActionsError } from "./error"
import { ActionsState } from "./state"

const STRICT = { onExcessProperty: "error" } as const
const SSH_HOSTS: Readonly<Record<string, string>> = { "ssh.github.com": "github.com", "altssh.gitlab.com": "gitlab.com" }
const parseURL = Option.liftThrowable((text: string) => new URL(text))
const invalid = () => new ActionsError({ kind: "invalid_input", message: "Invalid Actions binding input." })
const checked = <A>(read: () => A) => Effect.try({ try: read, catch: (error) => error instanceof ActionsError ? error : invalid() })

export const make = Effect.fn("ActionsBinding.make")(function* (input: {
  directory: string
  workspaceID?: string
  projectID: string
  stateDirectory: string
  resolve: ActionsContract.BindingResolver
}) {
  const fs = yield* FSUtil.Service
  const proc = yield* AppProcess.Service
  const directory = yield* ActionsState.canonical(input.directory)
  yield* fs.realPath(directory).pipe(Effect.mapError(invalid))
  const git = Effect.fnUntraced(function* (args: string[]) {
    const result = yield* proc.run(ChildProcess.make("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args], {
      cwd: directory,
      // Git placement/config environment must not redirect this trusted Location, including Windows key casing.
      env: Object.fromEntries(Object.entries(process.env).filter((entry) => !/^GIT_/i.test(entry[0]))),
      extendEnv: false,
      stdin: "ignore",
    }), { maxOutputBytes: 64 * 1024, maxErrorBytes: 4 * 1024, timeout: "10 seconds" }).pipe(
      Effect.mapError(() => new ActionsError({ kind: "transport_failed", message: "Unable to inspect the repository's git configuration." })),
    )
    if (result.stdoutTruncated)
      return yield* new ActionsError({ kind: "metadata_truncated", message: "Git configuration exceeds the Actions read limit." })
    if (result.exitCode !== 0) return yield* invalid()
    // POSIX filenames may end in CR: only LF terminates git output there. NUL-delimited config stays intact.
    return result.stdout.toString("utf8").replace(process.platform === "win32" ? /\r?\n$/ : /\n$/, "")
  })
  const state = yield* ActionsState.make({ ...input, directory, repository: yield* git(["rev-parse", "--show-toplevel"]) })
  const target = Effect.fnUntraced(function* (request: Actions.BindingInput) {
    const decoded = yield* Schema.decodeUnknownEffect(Actions.BindingInput, STRICT)(request).pipe(Effect.mapError(invalid))
    const provider = yield* checked(() => ActionsState.provider(decoded.provider))
    const projectPath = yield* checked(() => ActionsState.projectPath(provider.kind, decoded.projectPath))
    if (!ActionsState.validRemote(decoded.remote)) return yield* invalid()
    // Validate every fetch URL, including git's insteadOf expansion, before touching provider authentication.
    const raw = yield* git(["config", "--null", "--get-all", `remote.${decoded.remote}.url`])
    const effective = yield* git(["remote", "get-url", "--all", decoded.remote])
    yield* checked(() => [...raw.split("\0").filter(Boolean), ...effective.split(/\r?\n/)].forEach((remote) =>
      matchRemote(remote, provider, projectPath)))
    const identity = yield* input.resolve(provider, projectPath)
    if (!identity.projectID.trim() || /[\x00-\x20\x7f]/.test(identity.projectID) ||
      !identity.account || /[\x00-\x20\x7f]/.test(identity.account))
      return yield* new ActionsError({ kind: "transport_failed", message: "Provider returned invalid project or account identity." })
    yield* checked(() => ActionsState.projectPath(provider.kind, identity.projectPath))
    if (!samePath(provider.kind, projectPath, identity.projectPath))
      return yield* new ActionsError({ kind: "host_mismatch", message: "Provider returned a different project path." })
    return { ...decoded, provider, projectID: identity.projectID, projectPath: identity.projectPath, account: identity.account }
  })
  const record = Effect.fnUntraced(function* (document: ActionsState.Document, ref: Actions.BindingRef) {
    // A Binding is also a BindingRef; project away caller metadata and use only the trusted store's Location.
    const decoded = yield* Schema.decodeUnknownEffect(Actions.BindingRef)(ref).pipe(Effect.mapError(invalid))
    const current = document.records.find((item) => item.binding.id === decoded.id)
    if (!current) return yield* new ActionsError({ kind: "binding_missing", message: "Actions binding does not exist at this Location." })
    if (current.binding.revision !== decoded.revision)
      return yield* new ActionsError({ kind: "binding_stale", message: "Actions binding revision has changed.", bindingID: decoded.id })
    return current
  })
  const list = Effect.fn("ActionsBinding.list")(function* () {
    return (yield* state.read()).records.map((item) => item.binding)
  })
  const create = Effect.fn("ActionsBinding.create")(function* (request: Actions.BindingInput) {
    return yield* state.change((document) => Effect.gen(function* () {
      const resolved = yield* target(request)
      if (resolved.expectedRevision !== undefined) return yield* invalid()
      if (document.records.some((item) => item.binding.remote === resolved.remote || ActionsState.identityKey(item.binding) === ActionsState.identityKey(resolved)))
        return yield* new ActionsError({ kind: "binding_stale", message: "Actions project or remote is already bound at this Location." })
      const binding: Actions.Binding = {
        id: Actions.BindingID.create(), revision: 1, remote: resolved.remote, provider: resolved.provider,
        projectID: resolved.projectID, projectPath: resolved.projectPath, account: resolved.account,
        directory, ...(input.workspaceID === undefined ? {} : { workspaceID: input.workspaceID }),
      }
      return { document: { ...document, records: [...document.records, { binding, policy: {} }] }, value: binding }
    }))
  })
  const update = Effect.fn("ActionsBinding.update")(function* (id: Actions.BindingID, request: Actions.BindingInput) {
    const decoded = yield* Schema.decodeUnknownEffect(Actions.BindingInput, STRICT)(request).pipe(Effect.mapError(invalid))
    if (decoded.expectedRevision === undefined)
      return yield* new ActionsError({ kind: "binding_stale", message: "Actions binding update requires an expected revision." })
    const expectedRevision = decoded.expectedRevision
    return yield* state.change((document) => Effect.gen(function* () {
      const current = yield* record(document, { id, revision: expectedRevision })
      const resolved = yield* target(decoded)
      if (ActionsState.identityKey(current.binding) !== ActionsState.identityKey(resolved))
        return yield* new ActionsError({ kind: "binding_stale", message: "Actions binding cannot retarget its provider project.", bindingID: id })
      if (document.records.some((item) => item !== current && item.binding.remote === resolved.remote))
        return yield* new ActionsError({ kind: "binding_stale", message: "Actions remote is already bound at this Location.", bindingID: id })
      const binding = { ...current.binding, revision: current.binding.revision + 1, remote: resolved.remote,
        provider: resolved.provider, projectPath: resolved.projectPath, account: resolved.account }
      return { document: { ...document, records: document.records.map((item) => item === current ? { ...item, binding } : item) }, value: binding }
    }))
  })
  const get = Effect.fn("ActionsBinding.get")(function* (ref: Actions.BindingRef) {
    return (yield* record(yield* state.read(), ref)).binding
  })
  const remove = Effect.fn("ActionsBinding.remove")(function* (ref: Actions.BindingRef) {
    yield* state.change((document) => Effect.gen(function* () {
      const current = yield* record(document, ref)
      return { document: { ...document, records: document.records.filter((item) => item !== current) }, value: undefined }
    }))
  })
  const policy = Effect.fn("ActionsBinding.policy")(function* (ref: Actions.BindingRef) {
    const current = yield* record(yield* state.read(), ref)
    return { binding: { id: current.binding.id, revision: current.binding.revision }, policy: current.policy }
  })
  const updatePolicy = Effect.fn("ActionsBinding.updatePolicy")(function* (ref: Actions.BindingRef, policy: Actions.Policy) {
    const decoded = yield* Schema.decodeUnknownEffect(Actions.Policy, STRICT)(policy).pipe(Effect.mapError(invalid))
    return yield* state.change((document) => Effect.gen(function* () {
      const current = yield* record(document, ref)
      const binding = { ...current.binding, revision: current.binding.revision + 1 }
      return {
        document: { ...document, records: document.records.map((item) => item === current ? { binding, policy: decoded } : item) },
        value: { binding: { id: binding.id, revision: binding.revision }, policy: decoded },
      }
    }))
  })
  return { list, create, update, get, remove, policy, updatePolicy } satisfies ActionsContract.Bindings
})

function samePath(kind: Actions.ProviderKind, left: string, right: string) {
  return kind === "github" ? left.toLowerCase() === right.toLowerCase() : left === right
}

function matchRemote(text: string, provider: Actions.Provider, projectPath: string) {
  if (/[\x00-\x20\x7f]/.test(text)) throw invalid()
  const scp = /^(?:git@)?([A-Za-z0-9.-]+):([^/].*)$/.exec(text)
  const remote = scp ? { protocol: "ssh:", hostname: scp[1].toLowerCase(), host: scp[1].toLowerCase(), path: scp[2] }
    : Option.getOrUndefined(parseURL(text).pipe(Option.map((url) => {
      if (url.password || (url.protocol === "https:" ? url.username : url.username && url.username !== "git") ||
        !["https:", "ssh:"].includes(url.protocol) || url.search || url.hash) throw invalid()
      // URL parsing normalizes dot segments; reject them before that normalization can hide a different repository.
      if (/\/(?:\.|\.\.)(?:\/|$)|%|\\/.test(text)) throw invalid()
      return { protocol: url.protocol, hostname: url.hostname, host: url.host, path: url.pathname.slice(1) }
    })))
  if (!remote) throw invalid()
  const alias = remote.protocol === "ssh:" ? SSH_HOSTS[remote.hostname] : undefined
  const expected = new URL(`https://${provider.hostname}`)
  if ((remote.protocol === "https:" ? remote.host !== expected.host : (alias ?? remote.hostname) !== expected.hostname))
    throw new ActionsError({ kind: "host_mismatch", message: "Named git remote does not match the explicit Actions host." })
  const actual = ActionsState.projectPath(provider.kind, remote.path.replace(/\.git$/, ""))
  if (!samePath(provider.kind, actual, projectPath))
    throw new ActionsError({ kind: "host_mismatch", message: "Named git remote does not match the Actions project path." })
}
