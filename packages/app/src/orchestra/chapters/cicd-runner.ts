import { createRoot } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { Option, Schema } from "effect"
import type { useLanguage } from "@/context/language"
import type { Platform } from "@/context/platform"
import type { ServerSDK } from "@/context/server-sdk"
import { Persist, persisted } from "@/utils/persist"
import { terminalWebSocketURL } from "@/utils/terminal-websocket-url"
import {
  decodeStoredPipelines,
  pipelineScript,
  plainLog,
  posixShell,
  tailLog,
  type Pipeline,
  type PipelineStatus,
} from "./cicd-data"

type Input = { sdk: ServerSDK; platform: Platform; directory: string; t: ReturnType<typeof useLanguage>["t"] }
type Live = {
  ptyID?: string
  socket?: WebSocket
  cursor: number
  stopped: boolean
  attempts: number
  pending: string
  frame?: number
}
type PtyState = { status: "running" | "exited"; exitCode?: number } | "missing" | undefined
export type PipelineDefinition = Pick<
  Pipeline,
  "id" | "name" | "branch" | "trigger" | "command" | "environment" | "deploy"
>

const RECONNECT_LIMIT = 8
const decodeMeta = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Struct({ cursor: Schema.Number })))
const profiles = new Map<string, ReturnType<typeof createPipelines>>()

// One store and runner per profile. It outlives the page so a run keeps streaming while the user
// works elsewhere in the app; after a reload the page resumes runs from their server PTY.
export function profilePipelines(key: string, input: Input) {
  const existing = profiles.get(key)
  if (existing) return existing
  const created = createRoot(() => createPipelines(input))
  profiles.set(key, created)
  return created
}

function createPipelines(input: Input) {
  const target = { directory: input.directory }
  const t = input.t
  const storage = Persist.serverWorkspace(input.sdk.scope, input.directory, "cicd")
  const [store, setStore, , ready] = persisted(storage, createStore({ pipelines: [] as Pipeline[] }), input.platform)
  // Raw terminal output of active runs. Only the final plain log is persisted.
  const [output, setOutput] = createStore<Record<string, string | undefined>>({})
  const live = new Map<string, Live>()
  const find = (id: string) => store.pipelines.find((item) => item.id === id)
  const update = (id: string, patch: Partial<Pipeline>) => setStore("pipelines", (item) => item.id === id, patch)
  const log = (id: string) => {
    const raw = output[id]
    return `${find(id)?.log ?? ""}${raw ? `\n${plainLog(raw)}` : ""}`
  }
  const append = (id: string, line: string) => update(id, { log: tailLog(`${find(id)?.log ?? ""}\n${line}`) })
  // Output is coalesced into one store write per animation frame.
  const flush = (id: string, entry: Live) => {
    if (entry.frame !== undefined) cancelAnimationFrame(entry.frame)
    entry.frame = undefined
    if (!entry.pending) return
    const chunk = entry.pending
    entry.pending = ""
    setOutput(id, (text) => tailLog(`${text ?? ""}${chunk}`))
  }
  const close = (id: string, status: PipelineStatus, lines: string[]) => {
    const entry = live.get(id)
    if (entry) flush(id, entry)
    live.delete(id)
    update(id, { status, log: tailLog([log(id), ...lines].join("\n")), run: undefined })
    setOutput(id, undefined)
  }

  async function run(id: string, branch: string | undefined) {
    const item = find(id)
    if (!item || item.status === "running" || live.has(id)) return
    const entry: Live = { cursor: 0, stopped: false, attempts: 0, pending: "" }
    live.set(id, entry)
    setOutput(id, "")
    update(id, {
      status: "running",
      runs: item.runs + 1,
      run: undefined,
      log: [
        t("orchestra.cicd.log.run", { count: item.runs + 1, time: new Date().toLocaleString() }),
        ...(branch ? [t("orchestra.cicd.log.branch", { branch })] : []),
        ...(branch === item.branch ? [] : [t("orchestra.cicd.log.configuredBranch", { branch: item.branch })]),
        t("orchestra.cicd.log.directory", { directory: input.directory }),
        `$ ${item.command}`,
      ].join("\n"),
    })
    const created = await input.sdk.api.pty
      .create({
        location: target,
        command: posixShell(input.directory),
        args: ["-c", pipelineScript(item.command)],
        title: `CI/CD · ${item.name}`,
      })
      .then((result) => ({ ptyID: result.data.id }))
      .catch((error: unknown) => ({ error: errorText(error) }))
    if ("error" in created) {
      if (!entry.stopped) close(id, "error", ["", t("orchestra.cicd.log.startFailed", { detail: created.error })])
      return
    }
    if (entry.stopped) return void kill(id, created.ptyID)
    entry.ptyID = created.ptyID
    update(id, { run: { ptyID: created.ptyID, ready: false } })
    void connect(id, entry)
  }

  async function connect(id: string, entry: Live) {
    const ptyID = entry.ptyID
    if (!ptyID) return
    const protocol = await input.sdk.protocol
    const ticket = protocol === "v1" ? await connectTicket(ptyID).catch(() => undefined) : undefined
    if (entry.stopped || live.get(id) !== entry) return
    const server = input.sdk.server
    const socket = new WebSocket(
      terminalWebSocketURL({
        protocol,
        url: input.sdk.url,
        id: ptyID,
        directory: input.directory,
        cursor: entry.cursor,
        ticket,
        sameOrigin: new URL(input.sdk.url, location.href).origin === location.origin,
        username: server.http.username ?? "opencode",
        password: server.http.password ?? "",
        authToken: server.type === "http" ? server.authToken : false,
      }),
    )
    socket.binaryType = "arraybuffer"
    entry.socket = socket
    socket.addEventListener("message", (event) => {
      if (entry.stopped || live.get(id) !== entry) return
      if (typeof event.data === "string") {
        entry.cursor += event.data.length
        entry.pending = tailLog(`${entry.pending}${event.data}`)
        entry.frame ??= requestAnimationFrame(() => flush(id, entry))
        return
      }
      if (!(event.data instanceof ArrayBuffer)) return
      const bytes = new Uint8Array(event.data)
      if (bytes[0] !== 0) return
      const meta = decodeMeta(new TextDecoder().decode(bytes.subarray(1)))
      if (Option.isSome(meta)) entry.cursor = meta.value.cursor
      entry.attempts = 0
      // The control frame arrives once the server is streaming to this socket: release the start gate.
      if (find(id)?.run?.ready !== false) return
      socket.send("\r")
      update(id, { run: { ptyID, ready: true } })
    })
    socket.addEventListener("close", (event) => void closed(id, entry, event.code))
  }

  async function closed(id: string, entry: Live, code: number) {
    if (entry.stopped || live.get(id) !== entry || !entry.ptyID) return
    entry.socket = undefined
    const ptyID = entry.ptyID
    const info = await inspect(ptyID)
    if (entry.stopped || live.get(id) !== entry) return
    if (info === "missing") return interrupt(id, entry, ptyID, t("orchestra.cicd.log.interrupted"))
    if (info?.status === "exited") {
      finish(id, info.exitCode, code === 4404)
      return void kill(id, ptyID)
    }
    // Still running, or the server is unreachable: reconnect from the consumed cursor with backoff.
    entry.attempts += 1
    if (entry.attempts > RECONNECT_LIMIT) {
      await interrupt(id, entry, ptyID, t("orchestra.cicd.log.connectionLost"))
      return void kill(id, ptyID)
    }
    setTimeout(
      () => {
        if (!entry.stopped && live.get(id) === entry) void connect(id, entry)
      },
      Math.min(250 * 2 ** entry.attempts, 4000),
    )
  }

  function finish(id: string, exitCode: number | undefined, missed: boolean) {
    const item = find(id)
    const passed = exitCode === 0
    const environment = t(`orchestra.cicd.environment.${item?.environment ?? "preview"}`)
    close(id, passed ? "passed" : "failed", [
      // 4404 means the run ended before this socket attached, so its last output was not observed.
      ...(missed ? [t("orchestra.cicd.log.missed")] : []),
      "",
      exitCode === undefined ? t("orchestra.cicd.log.noExitCode") : t("orchestra.cicd.log.exited", { code: exitCode }),
      ...(item?.deploy
        ? [t(passed ? "orchestra.cicd.log.deployNotRun" : "orchestra.cicd.log.deploySkipped", { environment })]
        : []),
      t(passed ? "orchestra.cicd.log.passed" : "orchestra.cicd.log.failed"),
    ])
  }

  // Another tab or window may own this run and have recorded its result; that record wins.
  async function interrupt(id: string, entry: Live | undefined, ptyID: string | undefined, reason: string) {
    const stored = await storedPipeline(id)
    // Bail out if the user stopped this run or started another one meanwhile.
    if (entry ? entry.stopped || live.get(id) !== entry : live.has(id)) return
    if (stored && !(stored.status === "running" && stored.run?.ptyID === ptyID)) {
      if (entry) flush(id, entry)
      live.delete(id)
      setOutput(id, undefined)
      return setStore("pipelines", (item) => item.id === id, reconcile({ ...stored }))
    }
    close(id, "interrupted", ["", reason])
  }

  async function storedPipeline(id: string) {
    const raw = await Promise.resolve()
      .then(() => {
        const desktop = input.platform.platform === "desktop" ? input.platform.storage?.(storage.storage) : undefined
        if (desktop) return desktop.getItem(storage.key)
        return localStorage.getItem(`${storage.storage}:${storage.key}`)
      })
      .catch(() => null)
    if (!raw) return
    return Option.getOrUndefined(decodeStoredPipelines(raw))?.pipelines.find((item) => item.id === id)
  }

  function stop(id: string) {
    const item = find(id)
    if (!item || item.status !== "running") return
    const entry = live.get(id)
    const ptyID = entry?.ptyID ?? item.run?.ptyID
    if (entry) {
      entry.stopped = true
      entry.socket?.close(1000)
    }
    close(id, "cancelled", [t("orchestra.cicd.log.cancelled")])
    if (ptyID) void kill(id, ptyID)
  }

  // Ends the server process. A PTY that is already gone counts as stopped.
  async function kill(id: string, ptyID: string) {
    const failure = await removePty(ptyID)
    if (failure === undefined || find(id)?.status !== "cancelled") return
    append(id, t("orchestra.cicd.log.stopFailed", { detail: failure }))
  }

  // Reattach runs left running by an earlier page lifetime. Idempotent for runs already attached.
  function resume() {
    store.pipelines
      .filter((item) => item.status === "running" && !live.has(item.id))
      .forEach((item) => {
        if (!item.run) return void interrupt(item.id, undefined, undefined, t("orchestra.cicd.log.interrupted"))
        const entry: Live = { ptyID: item.run.ptyID, cursor: 0, stopped: false, attempts: 0, pending: "" }
        live.set(item.id, entry)
        setOutput(item.id, "")
        void connect(item.id, entry)
      })
  }

  // V1 reports a missing PTY only through its HTTP status, so read it without the throwing adapter.
  async function inspect(ptyID: string): Promise<PtyState> {
    if ((await input.sdk.protocol) === "v1")
      return input.sdk.client.pty
        .get({ ptyID, directory: input.directory }, { throwOnError: false })
        .then((result) => {
          if (result.response.status === 404) return "missing" as const
          return result.data ? { status: result.data.status, exitCode: result.data.exitCode } : undefined
        })
        .catch(() => undefined)
    return input.sdk.api.pty
      .get({ ptyID, location: target })
      .then((result) => ({ status: result.data.status, exitCode: result.data.exitCode }))
      .catch((error: unknown) => (missing(error) ? ("missing" as const) : undefined))
  }

  async function removePty(ptyID: string) {
    if ((await input.sdk.protocol) === "v1")
      return input.sdk.client.pty
        .remove({ ptyID, directory: input.directory }, { throwOnError: false })
        .then((result) =>
          result.response.ok || result.response.status === 404 ? undefined : `HTTP ${result.response.status}`,
        )
        .catch((error: unknown) => errorText(error))
    return input.sdk.api.pty
      .remove({ ptyID, location: target })
      .then(() => undefined)
      .catch((error: unknown) => (missing(error) ? undefined : errorText(error)))
  }

  function connectTicket(ptyID: string) {
    return input.sdk.client.pty
      .connectToken(
        { ptyID, directory: input.directory },
        { throwOnError: false, headers: { "x-opencode-ticket": "1" } },
      )
      .then((result) => (result.response.status === 200 ? result.data?.ticket : undefined))
  }

  return {
    ready,
    list: () => store.pipelines,
    log,
    run,
    stop,
    resume,
    save(definition: PipelineDefinition) {
      if (find(definition.id)) return update(definition.id, definition)
      setStore("pipelines", store.pipelines.length, { ...definition, status: "idle", runs: 0, log: "" })
    },
    remove(id: string) {
      stop(id)
      setStore(
        "pipelines",
        store.pipelines.filter((item) => item.id !== id),
      )
    },
  }
}

function missing(error: unknown) {
  if (!error || typeof error !== "object") return false
  if ("_tag" in error && error._tag === "PtyNotFoundError") return true
  const cause = error instanceof Error ? error.cause : undefined
  return !!cause && typeof cause === "object" && "status" in cause && cause.status === 404
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message
  return String(error)
}
