import { beforeAll, expect, test } from "bun:test"
import { createComponent, createEffect, createRoot } from "solid-js"
import { createStore, unwrap } from "solid-js/store"
import type { AdmissionOptions } from "@/server-api"
import type { ModelsExecutionInput } from "@orchestra/client"
import { registerSessionModelExecution } from "@/utils/session-model-execution"
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query"
import { createSourceFile, forEachChild, isCallExpression, isExpressionStatement, isFunctionDeclaration, isIdentifier, isVariableStatement, ScriptKind, ScriptTarget } from "typescript"
import type { Platform } from "@/context/platform"
import type { FollowupDraft, FollowupSendInput } from "@/components/prompt-input/submit"
import { createFollowupSender } from "@/components/prompt-input/submit"
import { createQueuedPromptSources, createQueuedPromptStore, queuedPromptPayload } from "@/components/prompt-input/queued-prompt"
import { createSessionOwnership } from "@/pages/session/session-ownership"
import { ServerScope } from "@/utils/server-scope"

const page = Bun.resolveSync("@/pages/session", import.meta.dir)
beforeAll(() => {
  Bun.plugin({ name: "actual-page-followup-handlers", setup(build) {
    build.onLoad({ filter: /session\.tsx\?followup-idle$/ }, async () => {
      const source = createSourceFile(page, await Bun.file(page).text(), ScriptTarget.Latest, true, ScriptKind.TSX)
      const component = source.statements.find((node) => isFunctionDeclaration(node) && node.name?.text === "Page")
      if (!component || !isFunctionDeclaration(component) || !component.body) throw new Error("Page body missing")
      const names = ["followupOwnership", "queuedItemOwner", "queuedFollowups", "followupMutation", "followupBusy", "sendFollowup"]
      const selected = component.body.statements.filter((statement) => isVariableStatement(statement) &&
        statement.declarationList.declarations.some((declaration) => isIdentifier(declaration.name) && names.includes(declaration.name.text)))
      if (selected.length !== names.length) throw new Error("Page followup declarations changed")
      const idle = component.body.statements.filter((statement) => {
        if (!isExpressionStatement(statement) || !isCallExpression(statement.expression) ||
          !isIdentifier(statement.expression.expression) || statement.expression.expression.text !== "createEffect") return false
        const calls: string[] = []
        const visit = (node: import("typescript").Node) => {
          if (isCallExpression(node) && isIdentifier(node.expression)) calls.push(node.expression.text)
          forEachChild(node, visit)
        }
        visit(statement)
        return calls.includes("sendFollowup")
      })
      if (idle.length !== 1) throw new Error("Page followup idle effect missing or ambiguous")
      const itemObserver = component.body.statements.filter((statement) => isExpressionStatement(statement) &&
        isCallExpression(statement.expression) && isIdentifier(statement.expression.expression) &&
        statement.expression.expression.text === "createComputed" && statement.expression.arguments.some((arg) =>
          isIdentifier(arg) && arg.text === "queuedItemOwner"))
      if (itemObserver.length !== 1) throw new Error("Page queued-item generation observer missing")
      // Compile actual Page mutation, send handler and idle effect. The test supplies IO ports only.
      return { loader: "ts", contents: `
        import { createComputed, createEffect, createMemo, onCleanup } from "solid-js"
        import { unwrap } from "solid-js/store"
        import { createSubmissionOwner } from "@/components/prompt-input/submission-policy"
        import { useMutation } from "@tanstack/solid-query"
        import { queuedPromptSources } from "@/components/prompt-input/queued-prompt"
        export function mount(input) {
          const { params, sdk, serverSDK, sync, serverSync, sessionOwnership, followup, setFollowup,
            platform, sendFollowupDraft, fail, resumeScroll, composer, busy, isChildSession } = input
          const emptyFollowups = []
          ${[...selected, ...itemObserver, ...idle].map((statement) => statement.getFullText(source)).join("\n")}
          return { send: sendFollowup, mutation: followupMutation }
        }
      ` }
    })
  } })
})

async function persistedQueue() {
  const owner = { serverScopeKey: ServerScope.local, directory: "/repo/main" }
  const bytes = new Map<string, string>()
  const platform = { platform: "desktop", storage: () => ({
    getItem: async (key: string) => bytes.get(key) ?? null,
    setItem: async (key: string, value: string) => { bytes.set(key, value) },
    removeItem: async (key: string) => { bytes.delete(key) },
  }) } as unknown as Platform
  const first = createRoot((dispose) => ({ dispose, store: createQueuedPromptStore(owner, platform) }))
  await first.store[3].promise
  const draft: FollowupDraft = {
    sessionID: "session-1", sessionDirectory: owner.directory,
    prompt: [{ type: "text", content: "persisted input", start: 0, end: 15 }], context: [],
    agent: "backend", model: { providerID: "provider", modelID: "model" },
    source: { ...owner, version: 1, sessionID: "session-1", runtimeSourceToken: "old-process:token" },
  }
  first.store[1]("items", "session-1", [queuedPromptPayload(draft, "queued-item")])
  expect(JSON.parse([...bytes.values()][0]).items["session-1"][0].source.runtimeSourceToken).toBe("old-process:token")
  first.dispose()
  const loaded = createRoot((dispose) => ({ dispose, store: createQueuedPromptStore(owner, platform) }))
  await loaded.store[3].promise
  return { ...loaded, platform }
}

async function mountQueue(options: { foreign?: boolean; prepare?: Promise<void> } = {}) {
  const persisted = await persistedQueue()
  const module = await import(`${page}?followup-idle`)
  const [status, setStatus] = createStore({ scope: options.foreign ? "foreign" as ServerScope : ServerScope.local, id: "session-1", busy: false, password: "none" })
  const counts = { automatic: 0, manual: 0, dispatch: 0 }
  const failure = new Error("real dispatch error")
  const errors: unknown[] = []
  const state = { throwDispatch: false, policyVersion: 0 }
  const control = { execution: async (input: ModelsExecutionInput) => {
    if (!input.model) throw new Error("Fake Page admission requires an exact model candidate")
    return { location: { directory: "/repo/main", project: { id: "project", directory: "/repo/main" } },
      data: { models: [], selection: { status: "ready" as const, ref: input.model, engine: "orchestra" as const } } }
  } }
  const stopped = Promise.withResolvers<"failed" | "four-auto-attempts">()
  const idle = Promise.withResolvers<void>()
  const sender = createFollowupSender(createQueuedPromptSources())
  const api = { prompt: async (_input: unknown, options?: AdmissionOptions) => {
    options?.beforeAdmission?.()
    counts.dispatch++
    if (state.throwDispatch) throw failure
  } } as unknown as FollowupSendInput["api"]
  registerSessionModelExecution(api, (input) => control.execution(input))
  const directorySync = { session: { get: () => undefined, optimistic: { add() {}, remove() {} } } } as unknown as FollowupSendInput["sync"]
  const serverState = { data: { project: [] }, session: { set() {} } } as unknown as FollowupSendInput["serverSync"]
  const server = { server: { http: { url: "https://queue.invalid", get password() { return status.password } } }, ready: Promise.resolve(),
    sessionManagement: { waitSubagentModels: async () => {}, subagentModelsWriteVersion: () => state.policyVersion } }
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const sdk = { get scope() { return status.scope }, directory: "/repo/main", api: { session: api } }
  const controls: { current?: { send: (sid: string, id: string, options?: { manual?: boolean }) => Promise<unknown>; mutation: { isPending: boolean; isSuccess: boolean } } } = {}
  const root = createRoot((dispose) => {
    const ownership = createSessionOwnership(() => `${status.scope}:${sdk.directory}:${status.id}`)
    createComponent(QueryClientProvider, { client, get children() {
      controls.current = module.mount({
        params: { get id() { return status.id } }, sdk: () => sdk, serverSDK: () => server,
        sync: () => directorySync, serverSync: () => serverState, sessionOwnership: ownership,
        followup: persisted.store[0], setFollowup: persisted.store[1], platform: persisted.platform,
        sendFollowupDraft: async (input: FollowupSendInput) => {
          await options.prepare
          if (input.deliberate) counts.manual++
          if (!input.deliberate && ++counts.automatic === 4) {
            setStatus("busy", true)
            stopped.resolve("four-auto-attempts")
          }
          return sender(input)
        },
        fail: (error: unknown) => errors.push(error), resumeScroll() {},
        composer: { blocked: () => false }, busy: () => status.busy, isChildSession: () => false,
      })
      createEffect(() => {
        if (persisted.store[0].failed["session-1"] === "queued-item") stopped.resolve("failed")
        if (controls.current?.mutation.isSuccess && !controls.current.mutation.isPending) idle.resolve()
      })
      return undefined
    } })
    return { dispose }
  })
  if (!controls.current) throw new Error("Page followup controls did not mount")
  return { ...persisted, controls: controls.current, counts, stopped, idle, setStatus, state, control, errors, failure,
    dispose: () => { root.dispose(); persisted.dispose(); client.clear() } }
}

test("actual persisted Page idle effect makes one unbound attempt, then manual Send dispatches and removes once", async () => {
  const queue = await mountQueue()
  try {
    expect(await queue.stopped.promise, JSON.stringify(queue.counts)).toBe("failed")
    await queue.idle.promise
    expect(queue.counts).toEqual({ automatic: 1, manual: 0, dispatch: 0 })
    expect(queue.store[0].items["session-1"]).toHaveLength(1)
    expect(queue.store[0].failed["session-1"]).toBe("queued-item")
    await queue.controls.send("session-1", "queued-item", { manual: true })
    expect(queue.counts).toEqual({ automatic: 1, manual: 1, dispatch: 1 })
    expect(queue.store[0].items["session-1"]).toEqual([])
    expect(queue.store[0].failed["session-1"]).toBeUndefined()
    expect(queue.errors).toEqual([])
  } finally { queue.dispose() }
})

test("actual persisted Page foreign-owner queue stops automatic retry and retains item on manual denial", async () => {
  const queue = await mountQueue({ foreign: true })
  try {
    expect(await queue.stopped.promise).toBe("failed")
    await queue.idle.promise
    await queue.controls.send("session-1", "queued-item", { manual: true })
    expect(queue.counts).toEqual({ automatic: 1, manual: 1, dispatch: 0 })
    expect(queue.store[0].items["session-1"]).toHaveLength(1)
    expect(queue.store[0].failed["session-1"]).toBe("queued-item")
  } finally { queue.dispose() }
})

test("actual Page late-scope false result cannot mark the captured or new Session failed", async () => {
  const prepare = Promise.withResolvers<void>()
  const queue = await mountQueue({ prepare: prepare.promise })
  try {
    queue.setStatus("scope", "foreign" as ServerScope)
    queue.setStatus("id", "other-session")
    prepare.resolve()
    await queue.idle.promise
    expect(queue.store[0].failed["session-1"]).toBeUndefined()
    expect(queue.store[0].failed["other-session"]).toBeUndefined()
    expect(queue.store[0].items["session-1"]).toHaveLength(1)
    expect(queue.counts.dispatch).toBe(0)
  } finally { queue.dispose() }
})

test("actual Page manual dispatch errors still surface and retain the item", async () => {
  const queue = await mountQueue()
  try {
    expect(await queue.stopped.promise).toBe("failed")
    await queue.idle.promise
    queue.state.throwDispatch = true
    await queue.controls.send("session-1", "queued-item", { manual: true })
    expect(queue.errors).toEqual([queue.failure])
    expect(queue.store[0].failed["session-1"]).toBe("queued-item")
    expect(queue.store[0].items["session-1"]).toHaveLength(1)
  } finally { queue.dispose() }
})


test.each(["edit ABA", "remove and reinsert", "credentials ABA", "policy write"] as const)("E6 actual Page queued admission rejects a held canonical answer after %s", async (change) => {
  const queue = await mountQueue()
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const tasks: Promise<unknown>[] = []
  const witness = { entered: false }
  try {
    expect(await queue.stopped.promise).toBe("failed")
    await queue.idle.promise
    queue.setStatus("busy", true)
    const original = queue.control.execution
    queue.control.execution = async (input) => {
      expect(input.context).toMatchObject({ type: "session", sessionID: "session-1", agentID: "backend" })
      expect(input.model).toEqual({ providerID: "provider", id: "model", variant: undefined })
      const response = await original(input)
      witness.entered = true
      entered.resolve()
      await release.promise
      return response
    }
    const pending = queue.controls.send("session-1", "queued-item", { manual: true })
    tasks.push(pending)
    await Promise.race([entered.promise, pending])
    expect(witness.entered).toBe(true)
    expect(queue.counts.dispatch).toBe(0)
    const item = structuredClone(unwrap(queue.store[0].items["session-1"]![0]!))
    if (change === "edit ABA") {
      queue.store[1]("items", "session-1", 0, "prompt", [{ type: "text", content: "edited", start: 0, end: 6 }])
      await Promise.resolve()
      queue.store[1]("items", "session-1", 0, "prompt", item.prompt)
    }
    if (change === "remove and reinsert") {
      queue.store[1]("items", "session-1", [])
      await Promise.resolve()
      queue.store[1]("items", "session-1", [item])
    }
    if (change === "credentials ABA") {
      queue.setStatus("password", "changed")
      await Promise.resolve()
      queue.setStatus("password", "none")
    }
    if (change === "policy write") queue.state.policyVersion++
    release.resolve()
    await pending
    expect(queue.counts.dispatch).toBe(0)
    expect(queue.store[0].items["session-1"]).toEqual([item])
    expect(queue.errors).toEqual([])
  } finally { release.resolve(); await Promise.allSettled(tasks); queue.dispose() }
})
