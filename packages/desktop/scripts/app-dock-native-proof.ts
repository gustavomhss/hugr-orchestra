import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { tool, type ToolContext } from "@opencode-ai/plugin"
import { AppDockNative } from "../src/main/app-dock-native"
import { NativeDockClient } from "../src/main/app-dock-native-client"
import { NativeDockProtocol } from "../src/main/app-dock-native-protocol"
import { AppDockRPC } from "../src/main/app-dock-rpc"
import { createAppDockHooks } from "../../opencode/src/plugin/app-dock"
import {
  appIDs, check, checkout, configValue, digest, failure, inventory, message, outputPath, recorder, requirements, restoring,
  senderID, snapshot, success, successArray, validateProcess, wireRequests,
  type CaseResult, type FileEvidence, type Item, type Manifests, type Options, type Receipt,
} from "./app-dock-native-proof-support"
import { channel, command, deadline, files, manifests, validateLaunches } from "./app-dock-native-proof-guest"

const sourceFiles = [
  "packages/desktop/src/main/app-dock-native-protocol.ts", "packages/desktop/src/main/app-dock-native-client.ts",
  "packages/desktop/src/main/app-dock-native.ts", "packages/desktop/src/main/app-dock-rpc.ts",
  "packages/desktop/src/main/app-dock-api.ts", "packages/opencode/src/plugin/app-dock.ts",
  "packages/desktop/scripts/app-dock-native-proof.ts", "packages/desktop/test/native/scenarios.json",
  "packages/desktop/scripts/native-proof-docker.ts",
  "packages/desktop/scripts/app-dock-native-proof-support.ts", "packages/desktop/scripts/app-dock-native-proof-guest.ts",
  "packages/desktop/test/native/prepare_code.py",
]
const guestFiles = ["main.py", "context.py", "bindings.py", "refs.py", "snapshot.py", "actions.py", "keyboard.py", "bus.py"]
const guestPaths = [...guestFiles.map((file) => `/bridge/${file}`), "/proof/prepare_code.py"]
const profileID = "exclusive-test-controller"
const sleep = (milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds))
const normalize = (value: string) => value.replace(/_/g, "").replace(/\s+/g, " ").trim()
let running = false

export async function run(options: Options): Promise<Receipt> {
  return runWithControl(options, false)
}

async function runWithControl(options: Options, suppressAction: boolean): Promise<Receipt> {
  check(!running, "one-heavyweight-proof-run-at-a-time")
  check(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(options.container), "invalid-container")
  const output = await outputPath(options.output)
  running = true
  const receipt: Receipt = { version: 1, status: "fail", started: new Date().toISOString(), container: options.container,
    output, control: suppressAction ? "suppress-action: synthetic ACK without native DoAction; restoration exempt" : "none",
    required: [], cases: [], scope: {
      hostTransport: "in-process contract port",
      rootConfirmation: "test-controller owned exclusive launches; actual runtime window pairing untested",
      permissions: "ToolContext.ask fixture recorded; production permission policy untested",
      packaged: false, xpra: false, N12: false,
    }, provenance: { declaredBase: "5e4bea3b519c04cebfb787e98dfa171f5771d25c",
      declaredSourceTree: "fe54fa42f066ce8de607f4bb77468d50f4b531ad", gateCategory: "repair",
       guestTransport: { kind: "Docker Engine raw exec stream", apiVersion: "1.51", tty: false, endpoint: "owned local Unix socket" },
       settingsGateExtension: "distinct one-result baseline; proved target replacement still requires verified native equality; uncertain setup is retained and only read back, never replayed",
      diagnosticCase: options.diagnosticCase ?? null,
      bounds: { caseWorkMs: 600000, caseRestoreMs: 120000, toolMs: 17000, performanceSLA: false } }, trace: [], failures: [] }
  const record = recorder(receipt.trace)
  const rpc = new AppDockRPC()
  const catalog = inventory(record)
  const control = { suppress: false, readAbort: undefined as (() => void) | undefined }
  const state = { helper: undefined as ReturnType<typeof channel> | undefined, client: undefined as NativeDockClient | undefined,
    manifests: undefined as Manifests | undefined, stopping: undefined as Promise<void> | undefined, interrupted: false, deadline: 0 }
  const interrupt = () => {
    state.interrupted = true
    receipt.failures.push("proof-interrupted")
    void stopHelper().catch((error: unknown) => receipt.failures.push(`interrupt-cleanup: ${message(error)}`))
  }
  process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt)
  const bindings = new Map<string, NativeDockProtocol.Binding>()
  const identities = new Map<string, AppDockNative.DockIdentity>()
  const listeners = new Set<(event: { data: unknown }) => void>()
  const port = {
    on(_event: "message", listener: (event: { data: unknown }) => void) { listeners.add(listener) },
    postMessage(value: unknown) {
      record("port.request", value)
      check(rpc.handleDockRPC(value, (reply) => {
        record("port.reply", NativeDockProtocol.object(reply) && reply.type === "dock.rpc.result" && reply.ok === true
          ? { type: reply.type, id: reply.id, ok: true, valueSHA256: digest(JSON.stringify(reply.value)) } : reply)
        listeners.forEach((listener) => listener({ data: reply }))
      }), "rpc-contract-port-message-not-handled")
    },
  }
  const definitions = createAppDockHooks(port).tool
  check(definitions, "registered-tool-definitions-missing")
  async function execute(name: string, args: Record<string, unknown> = {}, abort = new AbortController().signal) {
    check(!state.deadline || performance.now() < state.deadline, "case-operation-deadline")
    const started = performance.now()
    const definition = definitions![name]
    check(definition, `registered-tool-missing: ${name}`)
    const input = tool.schema.object(definition.args).parse(args)
    const context: ToolContext = {
      sessionID: "native-proof", messageID: randomUUID(), agent: "native-proof", directory: checkout, worktree: checkout, abort,
      metadata: (value) => record("permission.fixture-metadata", value),
      ask: async (value) => { check(value.permission === "dock", "tool-permission-not-dock"); record("permission.fixture-ask", value) },
    }
    record("tool.execute", { name, args: input })
    const result = await deadline(definition.execute(input, context), 17000, `tool-deadline: ${name}`)
    const raw = typeof result === "string" ? result : result.output
    // Native read JSON is retained verbatim in wire.reply; avoid a second large
    // pretty-printed copy while preserving the registered tool's exact digest.
    record("tool.result", { name, ...(name === "dock_read" ? { rawSHA256: digest(raw) } : { raw }),
      bytes: Buffer.byteLength(raw), durationMs: performance.now() - started })
    return JSON.parse(raw) as unknown
  }
  async function activate(appID: string) { successArray(await execute("dock_activate", { tabID: appID })); check(catalog.state.active === appID, "fixture-tab-not-selected") }
  async function page(args: Record<string, unknown> = {}) {
    const value = await execute("dock_read", { ...(args.cursor === undefined ? { budget: 20, maxText: 20000 } : {}), ...args })
    if (NativeDockProtocol.object(value) && value.backend === "linux-atspi" && typeof value.code === "string")
      throw new NativeDockProtocol.NativeError(value.code, String(value.message), value.outcome === "unknown" ? "unknown" : "not-dispatched")
    return snapshot(value)
  }
  async function read(args: Record<string, unknown> = {}) {
    // RefRegistry.begin retires this binding's abandoned cursors on a new read.
    // Only find/E10 retain a token, and only while actually resuming traversal.
    return page(args)
  }
  async function find(predicate: (item: Item) => boolean, label: string, scope: () => Promise<Record<string, unknown>> = async () => ({})) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const traversal = { cursor: undefined as string | undefined }
      try {
        const args = await scope()
        for (let count = 0; count < 128; count++) {
          const current = await read(traversal.cursor ? { cursor: traversal.cursor } : args)
          const matches = current.items.filter(predicate)
          check(matches.length <= 1, `native-control-ambiguous: ${label}: ${JSON.stringify(matches)}`)
          if (matches[0]) return matches[0]
          if (!current.hasMore) throw new Error(`native-control-missing: ${label}: ${JSON.stringify(current.coverage)}`)
          check(current.cursor && current.cursor !== traversal.cursor, `native-cursor-missing-or-repeated: ${label}`)
          traversal.cursor = current.cursor
        }
        throw new Error(`native-control-page-limit: ${label}`)
      } catch (error) {
        if (!(error instanceof NativeDockProtocol.NativeError) || !["stale-ref", "cursor-stale"].includes(error.code) || attempt === 2) throw error
        record("read.reacquire-after-async-invalidation", { label, code: error.code, attempt: attempt + 1, mutationReplay: false })
        await sleep(150)
      }
    }
    throw new Error(`native-control-reacquire-limit: ${label}`)
  }
  const editable = (item: Item) => item.capabilities.type?.supported === true && item.interfaces.includes("org.a11y.atspi.Text")
  async function editor(expected?: string) {
    return find((item) => editable(item) && item.states.includes(17) && (expected === undefined || item.text === expected),
      `multiline-editor${expected === undefined ? "" : "-matching-independent-file"}`)
  }
  async function replace(item: Item, text: string, mode: "editable" | "keyboard" = "editable") {
    const result = success(await execute("dock_type", { ref: item.ref, text, mode }), "dock_type")
    check(result.method === mode && result.dispatch === "acknowledged" && result.postcondition === "verified" && result.value === text,
      `native-replacement-not-verified: ${JSON.stringify(result)}`)
    await sleep(150)
    return result
  }
  async function save(suppress = false) {
    const item = await find((item) => normalize(item.name).toLowerCase() === "save" && item.capabilities.action?.supported === true,
      "advertised-Save")
    check(item.actions.length === 1, "save-action-ambiguous")
    control.suppress = suppress
    try {
      const result = success(await execute("dock_action", { ref: item.ref, actionID: item.actions[0]!.id }), "dock_action-Save")
      check(result.dispatch === "acknowledged", "save-not-acknowledged")
      return { item, result }
    } finally { control.suppress = false }
  }
  async function readFile(path: string) {
    check(!state.deadline || performance.now() < state.deadline, "case-operation-deadline")
    return (await files(options.container, [path], record))[0]!
  }
  async function agreement(path: string, text: string, label: string) {
    const desired = Buffer.from(text)
    const result = { file: await readFile(path) }
    for (let attempt = 0; attempt < 15 && result.file.base64 !== desired.toString("base64"); attempt++) {
      await sleep(100); result.file = await readFile(path)
    }
    check(result.file.exists && result.file.base64 === desired.toString("base64"),
      `${label}-independent-app-written-bytes-mismatch: expected=${digest(desired)} actual=${result.file.sha256} bytes=${result.file.bytes}`)
    return result.file
  }
  async function restoreEditor(appID: string, before: FileEvidence) {
    state.deadline = performance.now() + 120000
    await activate(appID)
    await replace(await editor(), before.text)
    const current = await readFile(before.path)
    // Mousepad disables Save when the restored buffer already equals its file.
    // Saving is needed only when the successful proof changed durable bytes.
    if (current.base64 !== before.base64) await save()
    await agreement(before.path, before.text, `${appID}-restore`)
    record("app-driven.editor-restored", { appID, sha256: before.sha256, saveRequired: current.base64 !== before.base64 })
  }
  async function textCase(appID: string) {
    await activate(appID)
    const before = await readFile(state.manifests!.apps.apps[appID]!.file)
    check(before.exists && before.bytes > 0, `${appID}-before-file-missing-or-empty`)
    const desired = `Harness E ${appID} café 漢字 é 🧪 ${randomUUID()}\nsecond line\n`
    check(before.text !== desired, `${appID}-before-already-equals-desired`)
    const selected = await editor(before.text)
    return restoring(async () => {
      await replace(selected, desired)
      const unicode = await editor(desired)
      await replace(unicode, "")
      const empty = await editor("")
      await replace(empty, desired)
      await editor(desired)
      const action = await save(suppressAction)
      const after = await agreement(before.path, desired, appID)
      return { before, desired, action, after, selector: "fresh per-page native ref; writable Text matching before-file value" }
    }, () => restoreEditor(appID, before))
  }
  async function bindAll() {
    check(!state.interrupted, "proof-interrupted")
    state.stopping = undefined
    const manifest = state.manifests!
    await command(["docker", "exec", "--user", "1000:1000", options.container, "python3", "-B", "-c",
      validateLaunches, JSON.stringify(manifest.apps)], record)
    state.helper = channel(options.container, record, control)
    state.client = await NativeDockClient.create(state.helper.transport, { sessionID: manifest.apps.sessionID })
    validateProcess(state.client.hello.processIdentity)
    record("helper.hello", state.client.hello)
    rpc.setAppDock(catalog.dock); rpc.setWindow(catalog.window)
    rpc.setProfileResolver(() => ({ profileID, storageKey: "exclusive-proof-storage-fixture" }))
    for (const appID of appIDs) {
      const app = manifest.apps.apps[appID]!
      const runtime = { runtimeID: `test-controller:${options.container}`, runtimeEpoch: manifest.apps.sessionID,
        accessibilitySessionID: manifest.apps.sessionID }
      const identity = { senderID, tabID: appID, generation: catalog.state.generation, profileID, ...runtime,
        appID, launchEpoch: app.launchEpoch, ownershipRevision: 1 }
      const target = { runtime, appID, launchEpoch: app.launchEpoch, ownershipRevision: 1,
        processIdentities: app.processIdentities.map((process) => ({ pid: process.pid, startTicks: process.startTicks,
          bootID: process.bootID, pidNamespace: process.pidNamespace, mountNamespace: process.mountNamespace })) }
      identities.set(appID, identity)
      bindings.set(appID, await rpc.registerNative(identity, target, state.client, async (proposal) => {
        await command(["docker", "exec", "--user", "1000:1000", options.container, "python3", "-B", "-c",
          validateLaunches, JSON.stringify(manifest.apps)], record)
        check(proposal.roots.length > 0 && proposal.roots.every((root) => [16, 23, 69].includes(root.role)
          && root.owner.startsWith(":") && !["/org/a11y/atspi/accessible/root", "/org/a11y/atspi/null"].includes(root.path)), "confirm-not-concrete-owned-window")
        record("controller.root-authorization", { identity, target, proposal,
          authority: "exclusive isolated supervisor launch; confirms only concrete proposed windows; runtime/X11 pairing untested" })
        return proposal.roots.map((root) => ({ owner: root.owner, path: root.path }))
      }))
    }
    check(bindings.size === appIDs.length, "all-launches-not-bound-before-cases")
  }
  function stopHelper(): Promise<void> {
    if (state.stopping) return state.stopping
    state.stopping = (async () => {
      const failures = await Promise.allSettled([rpc.reset()])
      const close = await state.client?.close().then(() => undefined, message)
      const reap = await state.helper?.transport.terminate().then(() => undefined, message)
      const audit = await state.helper?.state.audit?.then(() => undefined, message)
      state.client = undefined; state.helper = undefined; bindings.clear()
      const errors = [...failures.filter((result) => result.status === "rejected").map((result) => message(result.reason)), close, reap, audit].filter(Boolean)
      check(!errors.length, `helper-cleanup-failed: ${errors.join("; ")}`)
    })()
    return state.stopping
  }
  const handlers: Record<string, () => Promise<unknown>> = {
    E01: async () => {
      const list = await execute("dock_list")
      check(Array.isArray(list) && appIDs.every((id) => list.some((tab) => NativeDockProtocol.object(tab)
        && tab.tabID === id && tab.backend === "linux-atspi" && tab.nativeReadiness === "bound")), "native-tool-list-not-bound")
      const reads = []
      for (const appID of appIDs) { await activate(appID); const current = await read(); check(current.items.length > 0, `${appID}-native-read-empty`); reads.push({ appID, current }) }
      const admitted = receipt.trace.filter((entry) => entry.kind === "port.reply" && NativeDockProtocol.object(entry.value)
        && entry.value.type === "dock.rpc.native-admitted")
      check(admitted.length > 0 && admitted.every((entry) => receipt.trace.some((terminal) => terminal.kind === "port.reply"
        && NativeDockProtocol.object(terminal.value) && terminal.value.type === "dock.rpc.result"
        && terminal.value.id === (entry.value as Record<string, unknown>).id)), "native-admitted-treated-as-terminal")
      return { registeredTools: Object.keys(definitions), bindings: Object.fromEntries(bindings), reads }
    },
    E02: () => textCase("mousepad"),
    E03: () => textCase("featherpad"),
    E04: async () => {
      const app = state.manifests!.apps.apps.vscode!
      const profile = app.argv.find((arg) => arg.startsWith("--user-data-dir="))?.slice("--user-data-dir=".length)
      check(typeof profile === "string" && profile.startsWith("/home/proof/"), "vscode-profile-manifest-missing")
      const configPath = join(profile, "User/settings.json")
      const version = await readFile("/opt/vscode/resources/app/package.json")
      check(JSON.parse(version.text).version === "1.140.0", "vscode-maintained-version-mismatch")
      const before = await readFile(configPath)
      const original = configValue(before)
      const setup = async (view: "quick" | "settings") => {
        const input = await Bun.file(join(checkout, "packages/desktop/test/native/prepare_code.py")).bytes()
        await command(["docker", "exec", "-i", "--user", "1000:1000", options.container, "/usr/local/bin/orchestra-a11y-session",
          "--exec", "python3", "-B", "-", "--view", view], record, 10000, input)
        record("setup.code-view", { view, sourceSHA256: digest(input), semanticProof: false })
        await sleep(400); await activate("vscode")
      }
      // Discover metadata first, then read only the selected field's native Text.
      // Whole-window Text extraction repeatedly walks the Code editor/settings
      // documentation before finding the control and adds no effect oracle.
      const textControl = async (predicate: (item: Item) => boolean, label: string, scope: () => Promise<Record<string, unknown>> = async () => ({})) => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const item = await find(predicate, label, async () => ({ budget: 100, maxText: 0, ...await scope() }))
            const current = await read({ rootRef: item.ref, budget: 1, maxText: 1500 })
            check(current.items.length === 1 && predicate(current.items[0]!), `vscode-text-control-changed: ${label}`)
            return current.items[0]!
          } catch (error) {
            if (!(error instanceof NativeDockProtocol.NativeError) || !["stale-ref", "cursor-stale"].includes(error.code) || attempt === 2) throw error
            record("read.reacquire-after-async-invalidation", { label: label + "-Text", code: error.code, attempt: attempt + 1, mutationReplay: false })
            await sleep(150)
          }
        }
        throw new Error(`vscode-text-control-reacquire-limit: ${label}`)
      }
      const quick = () => textControl((item) => item.role === 79 && item.capabilities.keyboardType?.supported === true
        && /^Search files by name\b/i.test(item.name), "VS-Code-Quick-Open-HTML-input")
      const settings = async () => ({ rootRef: (await find((item) => item.role === 16 && item.name === "Settings", "VS-Code-Settings-dialog",
        async () => ({ budget: 100, maxText: 0 }))).ref })
      const search = () => textControl((item) => /search settings/i.test(normalize(item.name)) && item.capabilities.keyboardType?.supported === true,
        "VS-Code-Search-settings", settings)
      const checkbox = () => find((item) => item.role === 7 && (item.name === "files.trimTrailingWhitespace"
        || /trim trailing whitespace/i.test(normalize(item.name))), "files.trimTrailingWhitespace-checkbox", async () => ({ budget: 100, maxText: 0, ...await settings() }))
      const changed = { actionAttempted: false }
      const actionID = (item: Item) => {
        const actions = item.actions.filter((action) => ["check", "uncheck", "toggle", "click", "press", "activate"].includes(action.name))
        check(actions.length === 1, `vscode-checkbox-action-missing-or-ambiguous: ${JSON.stringify(item.actions)}`)
        return actions[0]!.id
      }
      const observed = async (item: Item, suppress = false) => {
        check(item.capabilities.observedAction?.supported === true, `vscode-observed-action-unsupported: ${JSON.stringify(item.capabilities)}`)
        control.suppress = suppress
        const result = success(await execute("dock_action", { ref: item.ref, actionID: actionID(item), mode: "observed" })
          .finally(() => { control.suppress = false }), "vscode-observed-action")
        check(result.method === "action" && result.dispatch === "acknowledged" && result.postcondition === "unverified"
          && result.identity === "observed-control" && result.logicalIdentity === "unverified" && result.consistency === "non-atomic",
          `vscode-observed-action-metadata-invalid: ${JSON.stringify(result)}`)
        return result
      }
      return restoring(async () => {
        const quickProof = await (async () => {
          await setup("quick")
          const initial = await quick()
          check(initial.text !== "café 漢字 🧪", "vscode-quick-before-already-equals-desired")
          const unicode = await replace(initial, "café 漢字 🧪", "keyboard")
          check((await quick()).text === "café 漢字 🧪", "vscode-quick-unicode-fresh-read-mismatch")
          const decomposed = await replace(await quick(), "e\u0301", "keyboard")
          check((await quick()).text === "e\u0301", "vscode-quick-decomposed-fresh-read-mismatch")
          const clear = await replace(await quick(), "", "keyboard")
          check((await quick()).text === "", "vscode-quick-empty-fresh-read-mismatch")
          const noop = await replace(await quick(), "", "keyboard")
          check(noop.noOp === true && noop.controllerCalls === 0, "vscode-quick-noop-dispatched-typing")
          check((await quick()).text === "", "vscode-quick-noop-fresh-read-mismatch")
          return { status: "pass" as const, initial, unicode, decomposed, clear, noop }
        })().catch((error: unknown) => ({ status: "fail" as const, error: message(error) }))
        record("case.quick-open", quickProof)
        // Independent Settings proof follows; a failed Quick Open leg still fails E04.
        // Opening another view is setup, not a retry of the failed text mutation.
        await setup("settings")
        const projection = await search()
        record("limitation.settings-empty-projection", { nativeBefore: projection.text,
          limitation: "Settings empty projection may be '\\n'; exact empty replacement is unverified and not claimed. Quick Open must independently prove empty/Unicode.", normalization: false })
        // Code appends the result count to this field's accessible name after a
        // search. Establish a distinct one-result input before the proved change;
        // the strict post-mutation Name guard remains enforced in both operations.
        const baselineText = "@id:editor.fontSize"
        const baselineOutput = await execute("dock_type", { ref: projection.ref, text: baselineText, mode: "keyboard" })
        if (NativeDockProtocol.object(baselineOutput) && baselineOutput.code !== undefined) {
          const uncertain = failure(baselineOutput, ["stale-ref"])
          check(uncertain.outcome === "unknown" && uncertain.message === "Native action target role, name or parent changed: name"
            && NativeDockProtocol.object(uncertain.result) && uncertain.result.method === "keyboard"
            && uncertain.result.dispatch === "acknowledged" && uncertain.result.postcondition === "unverified"
            && uncertain.result.value === baselineText, "vscode-baseline-unexpected-uncertainty")
        } else {
          const baseline = success(baselineOutput, "vscode-baseline-keyboard")
          check(baseline.method === "keyboard" && baseline.dispatch === "acknowledged" && baseline.postcondition === "verified"
            && baseline.value === baselineText, "vscode-baseline-not-verified")
        }
        record("setup.settings-single-result", { desired: baselineText, output: baselineOutput, semanticProof: false, mutationReplay: false })
        const baseline = { item: await search() }
        for (let attempt = 0; attempt < 3 && baseline.item.name !== "Search settings. 1 Setting Found"; attempt++) {
          await sleep(250)
          baseline.item = await search()
        }
        check(baseline.item.text !== "@id:files.trimTrailingWhitespace", "vscode-filter-before-already-equals-desired")
        check(baseline.item.text === baselineText && baseline.item.name === "Search settings. 1 Setting Found",
          "vscode-single-result-baseline-not-observed")
        record("setup.settings-baseline-readback", { item: baseline.item, originalOutcomePreserved: true, semanticProof: false })
        const filter = await replace(baseline.item, "@id:files.trimTrailingWhitespace", "keyboard")
        check((await search()).text === "@id:files.trimTrailingWhitespace", "vscode-setting-filter-fresh-read-mismatch")
        const stable = await checkbox()
        check(stable.states.includes(4) === original.value && stable.capabilities.action?.supported === false,
          "vscode-before-checkbox-config-or-stable-policy-disagree")
        const rejected = failure(await execute("dock_action", { ref: stable.ref, actionID: actionID(stable) }), ["unstable-ref"])
        check(rejected.outcome === "not-dispatched", "vscode-stable-action-was-dispatched")
        const unchanged = await readFile(configPath)
        check(unchanged.base64 === before.base64, "vscode-default-stable-action-changed-config")
        const item = await checkbox()
        changed.actionAttempted = true
        const action = await observed(item, suppressAction)
        const after = await pollConfig(configPath, !original.value)
        const checked = await checkbox()
        check(checked.states.includes(4) === !original.value, "vscode-after-checkbox-config-disagree")
        record("case.settings-effect", { item, action, checked, before, after })
        check(quickProof.status === "pass", `vscode-quick-open-proof-failed: ${quickProof.status === "fail" ? quickProof.error : ""}`)
        return { version: "1.140.0", before, original, quick: quickProof,
          baseline: { output: baselineOutput, observed: baseline.item }, filter, rejected, unchanged, item, action, checked, after,
          settingsEmptyProjection: "unverified; never normalized", insertion: "explicit native keyboard; setup excluded" }
      }, async () => {
        state.deadline = performance.now() + 120000
        control.suppress = false
        if (changed.actionAttempted) {
          const live = await checkbox()
          if (live.states.includes(4) !== original.value) {
            await observed(live)
          }
          const restored = await pollConfig(configPath, original.value)
          check((await checkbox()).states.includes(4) === original.value, "vscode-restored-checkbox-config-disagree")
          record("app-driven.vscode-restored", { before, restored, effectiveValue: original.value, byteIdentical: before.sha256 === restored.sha256 })
        }
        if (!changed.actionAttempted) {
          const after = await readFile(configPath)
          check(after.base64 === before.base64, "vscode-config-changed-without-native-action")
          record("vscode.setting-preserved", { before, after, nativeActionAttempted: false, appDrivenRestoreProved: false })
        }
      })
    },
    E05: async () => {
      await activate("mousepad")
      const before = await readFile(state.manifests!.apps.apps.mousepad!.file)
      const first = await editor(before.text)
      await read()
      const oldRead = failure(await execute("dock_type", { ref: first.ref, text: "must not insert" }), ["stale-ref"])
      const fresh = await editor(before.text)
      await replace(fresh, before.text)
      const oldMutation = failure(await execute("dock_type", { ref: fresh.ref, text: "must not replay" }), ["stale-ref"])
      check((await editor(before.text)).text === before.text, "stale-operation-changed-app-text")
      return { oldRead, oldMutation, file: await agreement(before.path, before.text, "stale-no-file-effect") }
    },
    E06: async () => {
      const paths = appIDs.slice(0, 2).map((id) => state.manifests!.apps.apps[id]!.file)
      const before = await files(options.container, paths, record)
      await activate("mousepad")
      const numericRef = failure(await execute("dock_click", { ref: 1 }), ["wrong-scope"])
      const ref = (await editor()).ref
      await activate("featherpad")
      const foreignTab = failure(await execute("dock_type", { ref, text: "foreign mutation forbidden" }), ["wrong-scope", "stale-ref"])
      await activate("browser-fixture")
      const browserRef = failure(await execute("dock_click", { ref }), ["wrong-scope"])
      await activate("mousepad")
      catalog.state.generation++
      const generation = await execute("dock_read").finally(() => { catalog.state.generation-- })
      failure(generation, ["wrong-scope"])
      const binding = bindings.get("mousepad")!
      const foreignBinding = await state.client!.request({ op: "read", bindingID: binding.bindingID,
        bindingEpoch: "foreign-binding-epoch", args: {} }).then(() => { throw new Error("foreign-binding-accepted") }, (error: unknown) => {
        check(error instanceof NativeDockProtocol.NativeError && error.code === "stale-binding", `wrong-foreign-binding-error: ${message(error)}`)
        return { code: error.code, outcome: error.outcome }
      })
      const identity = identities.get("mousepad")!
      const app = state.manifests!.apps.apps.mousepad!
      const protectedRoot = await state.client!.request({ op: "bind", args: { phase: "discover",
        identity: { senderID, tabID: "protected-root-negative", generation: 1, profileID }, target: {
          runtime: { runtimeID: identity.runtimeID, runtimeEpoch: identity.runtimeEpoch, accessibilitySessionID: identity.accessibilitySessionID },
          appID: app.appID, launchEpoch: app.launchEpoch, ownershipRevision: 1,
          processIdentities: app.processIdentities, roots: [{ owner: ":1.0", path: "/org/a11y/atspi/accessible/root" }],
        } } }).then(() => { throw new Error("application-root-admitted") }, (error: unknown) => {
          check(error instanceof NativeDockProtocol.NativeError && error.code === "ownership-unresolved", `wrong-protected-root-error: ${message(error)}`)
          return { code: error.code, outcome: error.outcome }
        })
      const after = await files(options.container, paths, record)
      check(before.every((file, index) => file.sha256 === after[index]!.sha256), "foreign-scope-operation-changed-files")
      return { foreignTab, browserRef, numericRef, generation, foreignBinding, protectedRoot, before, after }
    },
    E07: async () => {
      await activate("mousepad")
      const calls = catalog.state.fallbackCalls
      const result = failure(await execute("dock_evaluate", { script: "throw new Error('native must not evaluate viewer DOM')" }), ["unsupported-operation"])
      check(catalog.state.fallbackCalls === calls, "native-evaluate-reached-viewer-fallback")
      return { result, viewerFallbackCalls: catalog.state.fallbackCalls }
    },
    E08: async () => {
      await activate("mousepad")
      const paths = appIDs.slice(0, 2).map((id) => state.manifests!.apps.apps[id]!.file)
      const before = await files(options.container, paths, record)
      const offset = receipt.trace.length
      const controller = new AbortController()
      control.readAbort = () => controller.abort()
      const cancelled = failure(await execute("dock_read", { budget: 500, maxText: 20000 }, controller.signal), ["cancelled"])
      await sleep(200)
      const requests = wireRequests(receipt.trace.slice(offset))
      check(requests.filter((item) => item.op === "read").length === 1 && requests.some((item) => item.op === "cancel"), "aborted-read-not-correlated-or-replayed")
      check(requests.every((item) => ["read", "cancel"].includes(String(item.op))), "abort-scheduled-mutation")
      const after = await files(options.container, paths, record)
      check(before.every((file, index) => file.sha256 === after[index]!.sha256), "abort-changed-independent-files")
      check((await read()).items.length > 0, "read-after-abort-not-live")
      return { cancelled, requests, before, after, replay: "none; measured wire interval" }
    },
    E09: async () => {
      await activate("mousepad")
      const ref = (await editor()).ref
      const oldEpoch = state.client!.hello.helperEpoch
      await stopHelper()
      await bindAll()
      await activate("mousepad")
      check(state.client!.hello.helperEpoch !== oldEpoch, "helper-restart-epoch-reused")
      const old = failure(await execute("dock_type", { ref, text: "old helper ref forbidden" }), ["stale-ref", "wrong-scope"])
      const live = await editor()
      return { oldEpoch, newEpoch: state.client!.hello.helperEpoch, old, newRef: live.ref }
    },
    E10: async () => {
      await activate("mousepad")
      const before = await readFile(state.manifests!.apps.apps.mousepad!.file)
      const text = "🧪漢字".repeat(5000)
      const first = await editor(before.text)
      return restoring(async () => {
        await replace(first, text)
        const newest = await find((item) => editable(item) && item.textLength === [...text].length, "large-Unicode-editor")
        const offset = 3
        const partial = await read({ rootRef: newest.ref, maxText: 17, textOffset: offset })
        const item = partial.items.find(editable)
        check(item && item.text === [...text].slice(offset, offset + 17).join("") && item.textOffset === offset
          && item.textTruncated && partial.hasMore, "Unicode-character-offset-or-small-cap-mismatch")
        const anchor = await find((item) => editable(item) && item.textLength === [...text].length, "large-Unicode-fresh-editor")
        const start = receipt.trace.length
        const pieces: string[] = []
        const traversal = { cursor: undefined as string | undefined, complete: false }
        for (let page = 0; page < 64; page++) {
          const current = await read(traversal.cursor ? { maxText: 20000, cursor: traversal.cursor } : { maxText: 20000, rootRef: anchor.ref })
          current.items.filter(editable).forEach((item) => { check(typeof item.text === "string", "Unicode-page-text-missing"); pieces.push(item.text) })
          if (!current.hasMore) { traversal.complete = true; break }
          check(current.cursor && current.cursor !== traversal.cursor, "Unicode-cursor-missing-or-repeated")
          traversal.cursor = current.cursor
        }
        check(traversal.complete && pieces.join("") === text, "Unicode-bounded-pages-not-exact-full-value")
        const replies = receipt.trace.slice(start).filter((entry) => entry.kind === "wire.reply")
        check(replies.length > 1 && replies.every((entry) => NativeDockProtocol.object(entry.value)
          && typeof entry.value.bytes === "number" && entry.value.bytes <= NativeDockProtocol.limits.frameBytes), "Unicode-native-wire-byte-cap-not-proved")
        return { characters: [...text].length, utf8Bytes: Buffer.byteLength(text), utf16Units: text.length,
          partial, pageHashes: pieces.map((piece) => digest(piece)), wireReplyBytes: replies.map((entry) => (entry.value as Record<string, unknown>).bytes) }
      }, () => restoreEditor("mousepad", before))
    },
  }
  async function pollConfig(path: string, expected: boolean) {
    const result = { file: await readFile(path) }
    for (let attempt = 0; attempt < 20 && configValue(result.file).value !== expected; attempt++) {
      await sleep(100); result.file = await readFile(path)
    }
    check(configValue(result.file).value === expected, `vscode-independent-config-mismatch: expected=${expected} actual=${configValue(result.file).value}`)
    return result.file
  }
  try {
    const scenarioPath = join(checkout, "packages/desktop/test/native/scenarios.json")
    const scenarioFile = Bun.file(scenarioPath)
    check(await scenarioFile.exists(), "scenarios-file-missing")
    const scenarioBytes = await scenarioFile.slice(0, 65537).bytes()
    check(scenarioBytes.length <= 65536, "scenarios-file-byte-limit")
    receipt.provenance.requirements = { path: scenarioPath, sha256: digest(scenarioBytes), raw: Buffer.from(scenarioBytes).toString("utf8") }
    const required = requirements(JSON.parse(Buffer.from(scenarioBytes).toString("utf8")))
    receipt.required = required.map((row) => row.id)
    check(required.every((row) => typeof handlers[row.id] === "function"), "required-case-implementation-missing")
    check(Object.keys(handlers).every((id) => receipt.required.includes(id)), "implemented-case-not-required")
    receipt.provenance.hostSources = await Promise.all(sourceFiles.map(async (path) => ({ path, sha256: digest(await Bun.file(join(checkout, path)).bytes()) })))
    receipt.provenance.head = (await command(["git", "-C", checkout, "rev-parse", "HEAD"], record)).trim()
    receipt.provenance.container = JSON.parse(await command(["docker", "inspect", options.container,
      "--format", "{{json .}}"], record)).Config.Image
    check(receipt.provenance.container === "orchestra-a11y-test:20260930", "unexpected-testbed-image")
    receipt.provenance.abi = (await command(["docker", "exec", "--user", "1000:1000", options.container,
      "python3", "-B", "-c", "import platform,struct; print(platform.system(),platform.machine(),8*struct.calcsize('P'))"], record)).trim()
    check(receipt.provenance.abi === "Linux x86_64 64", "unproved-testbed-abi")
    const guest = await files(options.container, guestPaths, record)
    guest.forEach((file) => check(file.exists && file.bytes > 0, `required-guest-source-missing-or-empty: ${file.path}`))
    receipt.provenance.guestSources = guest.map((file) => ({ path: file.path, sha256: file.sha256 }))
    state.manifests = await manifests(options.container, record)
    receipt.provenance.manifests = state.manifests
    await bindAll()
    // Seed only the input buffer from independently read launch input. Expected
    // output is a later nonce-bearing value, never written by this controller.
    for (const appID of options.diagnosticCase ? [] : appIDs.slice(0, 2)) {
      await activate(appID)
      const input = await readFile(state.manifests.apps.apps[appID]!.file)
      const opened = await editor()
      if (opened.text !== input.text || opened.textTruncated) {
        record("controller.input-seed", { appID, source: input, previousTextSHA256: digest(opened.text ?? ""), proof: false })
        await replace(opened, input.text)
      }
    }
    // Exercise the saved-effect assertion first in the destructive ACK control.
    // The same nonempty requirement set still must pass in its entirety.
    check(options.diagnosticCase === undefined || required.some((row) => row.id === options.diagnosticCase), "diagnostic-case-not-required")
    // Partial diagnostics retain the full required list and fail with named
    // missing cases. They can never become a green complete acceptance receipt.
    const selected = options.diagnosticCase ? required.filter((row) => row.id === options.diagnosticCase) : required
    const order = suppressAction ? [...selected.filter((row) => row.id === "E02"), ...selected.filter((row) => row.id !== "E02")] : selected
    for (const row of order) {
      check(!state.interrupted, "proof-interrupted")
      record("case.begin", row)
      state.deadline = performance.now() + 600000
      const result = await handlers[row.id]!().then((evidence): CaseResult => ({ ...row, status: "pass", evidence }),
        (error: unknown): CaseResult => ({ ...row, status: "fail", error: message(error) }))
      state.deadline = 0
      receipt.cases.push(result); record("case.end", { id: result.id, status: result.status, error: result.error })
      if (result.status === "fail") receipt.failures.push(`${row.id}: ${result.error}`)
    }
    const after = await files(options.container, guestPaths, record)
    check(guest.every((file, index) => file.sha256 === after[index]!.sha256), "guest-source-changed-during-proof")
    const hostAfter = await Promise.all(sourceFiles.map(async (path) => ({ path, sha256: digest(await Bun.file(join(checkout, path)).bytes()) })))
    check(JSON.stringify(hostAfter) === JSON.stringify(receipt.provenance.hostSources), "host-source-changed-during-proof")
    check(catalog.state.fallbackCalls === 0, "viewer-fallback-called")
  } catch (error) { receipt.failures.push(`setup-or-finalization: ${message(error)}`) }
  finally {
    control.suppress = false; control.readAbort = undefined
    await stopHelper().catch((error: unknown) => receipt.failures.push(`cleanup: ${message(error)}`))
    process.off("SIGINT", interrupt); process.off("SIGTERM", interrupt)
    receipt.required.filter((id) => !receipt.cases.some((item) => item.id === id)).forEach((id) => {
      receipt.cases.push({ id, description: "Required case did not execute", status: "fail", error: "required-case-missing" })
      receipt.failures.push(`${id}: required-case-missing`)
    })
    if (record.failure()) receipt.failures.push(record.failure()!)
    receipt.status = receipt.required.length > 0 && receipt.failures.length === 0 && receipt.cases.length === receipt.required.length
      && receipt.required.every((id) => receipt.cases.filter((row) => row.id === id && row.status === "pass").length === 1) ? "pass" : "fail"
    receipt.finished = new Date().toISOString()
    running = false
    await Bun.write(output, JSON.stringify(receipt, null, 2) + "\n")
  }
  return receipt
}


export async function main(argv = process.argv.slice(2)) {
  const options = { container: "orchestra-a11y-session-20260930", output: "", suppressAction: false, diagnosticCase: undefined as string | undefined }
  const seen = new Set<string>()
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index]!
    check(!seen.has(flag), `duplicate-option: ${flag}`); seen.add(flag)
    if (flag === "--suppress-action") { options.suppressAction = true; continue }
    check(flag === "--container" || flag === "--output" || flag === "--diagnostic-case", `unknown-option: ${flag}`)
    const value = argv[++index]
    check(value && !value.startsWith("--"), `missing-option-value: ${flag}`)
    if (flag === "--container") options.container = value
    if (flag === "--output") options.output = value
    if (flag === "--diagnostic-case") options.diagnosticCase = value
  }
  check(options.output, "required-option-missing: --output")
  const receipt = await runWithControl(options, options.suppressAction)
  console.log(JSON.stringify({ status: receipt.status, output: receipt.output, control: receipt.control,
    cases: receipt.cases.map((row) => ({ id: row.id, status: row.status, ...(row.error ? { error: row.error.slice(0, 300) } : {}) })),
    failures: receipt.failures.map((error) => error.slice(0, 512)) }))
  if (receipt.status !== "pass") process.exitCode = 1
  return receipt
}

if (import.meta.main) void main().catch((error: unknown) => { console.error(message(error)); process.exitCode = 1 })
