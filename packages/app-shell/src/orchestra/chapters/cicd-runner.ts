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

type Input = {
  sdk: ServerSDK
  platform: Platform
  directory: string
  t: ReturnType<typeof useLanguage>["t"]
  socket?: (url: string | URL) => WebSocket
  reconnect?: (callback: () => void, delay: number) => void
}
type Live = {
  ptyID?: string
  socket?: WebSocket
  connection: number
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

export function createPipelines(input: Input) {
  const target = { directory: input.directory }
  const t = input.t
  const storage = Persist.serverWorkspace(input.sdk.scope, input.directory, "cicd")
  const [store, setStore, , ready] = persisted(storage, createStore({ pipelines: [] as Pipeline[] }), input.platform)
  // Raw terminal output of active runs. Only the final plain log is persisted.
  const [output, setOutput] = createStore<Record<string, string | undefined>>({})
  const [stopping, setStopping] = createStore<Record<string, { pending: boolean; error?: string } | undefined>>({})
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
    if (entry) {
      entry.connection++
      flush(id, entry)
    }
    live.delete(id)
    setStopping(id, undefined)
    update(id, { status, log: tailLog([log(id), ...lines].join("\n")), run: undefined })
    setOutput(id, undefined)
  }

  async function run(id: string, branch: string | undefined) {
    const item = find(id)
    if (!item || item.status === "running" || live.has(id)) return
    const entry: Live = { connection: 0, cursor: 0, stopped: false, attempts: 0, pending: "" }
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
      close(id, "error", ["", t("orchestra.cicd.log.startFailed", { detail: created.error })])
      return
    }
    entry.ptyID = created.ptyID
    update(id, { run: { ptyID: created.ptyID, ready: false, stopRequested: entry.stopped } })
    if (entry.stopped) return void terminate(id, entry)
    void connect(id, entry)
  }

  async function connect(id: string, entry: Live) {
    const ptyID = entry.ptyID
    if (!ptyID || entry.stopped || live.get(id) !== entry) return
    const connection = ++entry.connection
    const current = () => !entry.stopped && live.get(id) === entry && entry.connection === connection
    const protocol = await input.sdk.protocol
    if (!current()) return
    const ticket = undefined
    if (!current()) return
    const server = input.sdk.server
    const socket = (input.socket ?? ((url) => new WebSocket(url)))(
      terminalWebSocketURL({
        protocol,
        url: input.sdk.url,
        id: ptyID,
        directory: input.directory,
        cursor: entry.cursor,
        ticket,
        sameOrigin: new URL(input.sdk.url, location.href).origin === location.origin,
        username: server.http.username ?? "orchestra",
        password: server.http.password ?? "",
        authToken: server.type === "http" ? server.authToken : false,
      }),
    )
    socket.binaryType = "arraybuffer"
    entry.socket = socket
    socket.addEventListener("message", (event) => {
      if (!current() || entry.socket !== socket) return
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
      if (find(id)?.run?.ready !== false || find(id)?.run?.stopRequested) return
      socket.send("\r")
      update(id, { run: { ptyID, ready: true } })
    })
    socket.addEventListener("close", (event) => void closed(id, entry, socket, connection, event.code))
  }

  async function closed(id: string, entry: Live, socket: WebSocket, connection: number, code: number) {
    const current = () => !entry.stopped && live.get(id) === entry && entry.connection === connection
    if (!current() || entry.socket !== socket || !entry.ptyID) return
    entry.socket = undefined
    const ptyID = entry.ptyID
    const info = await inspect(ptyID)
    if (!current()) return
    if (info === "missing") return interrupt(id, entry, ptyID, t("orchestra.cicd.log.interrupted"), connection)
    if (info?.status === "exited") {
      finish(id, info.exitCode, code === 4404)
      return void removePty(ptyID)
    }
    // Still running, or the server is unreachable: reconnect from the consumed cursor with backoff.
    entry.attempts += 1
    if (entry.attempts > RECONNECT_LIMIT) {
      const failure = await removePty(ptyID)
      if (!current()) return
      if (failure !== undefined) {
        const error = t("orchestra.cicd.log.stopFailed", { detail: failure })
        setStopping(id, { pending: false, error })
        append(id, error)
        return
      }
      await interrupt(id, entry, ptyID, t("orchestra.cicd.log.connectionLost"), connection)
      return
    }
    ;(input.reconnect ?? setTimeout)(
      () => {
        if (current()) void connect(id, entry)
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
  async function interrupt(
    id: string,
    entry: Live | undefined,
    ptyID: string | undefined,
    reason: string,
    connection?: number,
  ) {
    const stored = await storedPipeline(id)
    // Bail out if the user stopped this run or started another one meanwhile.
    if (entry ? entry.stopped || live.get(id) !== entry : live.has(id)) return
    if (entry && connection !== undefined && entry.connection !== connection) return
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
    if (!item || item.status !== "running" || stopping[id]?.pending) return
    const entry = live.get(id) ?? {
      ptyID: item.run?.ptyID,
      cursor: 0,
      stopped: false,
      attempts: 0,
      connection: 0,
      pending: "",
    }
    live.set(id, entry)
    entry.stopped = true
    entry.connection++
    if (item.run) update(id, { run: { ...item.run, stopRequested: true } })
    setStopping(id, { pending: true, error: undefined })
    entry.socket?.close(1000)
    entry.socket = undefined
    // Creation may still be in flight. Its completion records the PTY before terminating it.
    if (entry.ptyID) void terminate(id, entry)
  }

  // Keep both the live owner and persisted PTY until DELETE confirms termination (including 404).
  async function terminate(id: string, entry: Live) {
    if (!entry.ptyID) return
    const failure = await removePty(entry.ptyID)
    if (live.get(id) !== entry) return
    if (failure === undefined) return close(id, "cancelled", [t("orchestra.cicd.log.cancelled")])
    const error = t("orchestra.cicd.log.stopFailed", { detail: failure })
    setStopping(id, { pending: false, error })
    append(id, error)
    entry.stopped = false
    entry.attempts = 0
    void connect(id, entry)
  }

  // Reattach runs left running by an earlier page lifetime. Idempotent for runs already attached.
  function resume() {
    store.pipelines
      .filter((item) => item.status === "running" && !live.has(item.id))
      .forEach((item) => {
        if (!item.run) return void interrupt(item.id, undefined, undefined, t("orchestra.cicd.log.interrupted"))
        const entry: Live = {
          ptyID: item.run.ptyID,
          connection: 0,
          cursor: 0,
          stopped: false,
          attempts: 0,
          pending: "",
        }
        live.set(item.id, entry)
        if (item.run.stopRequested) setStopping(item.id, { pending: false, error: t("orchestra.cicd.stopUnconfirmed") })
        setOutput(item.id, "")
        void connect(item.id, entry)
      })
  }

  // V1 reports a missing PTY only through its HTTP status, so read it without the throwing adapter.
  async function inspect(ptyID: string): Promise<PtyState> {
    return input.sdk.api.pty
      .get({ ptyID, location: target })
      .then((result) => ({ status: result.data.status, exitCode: result.data.exitCode }))
      .catch((error: unknown) => (missing(error) ? ("missing" as const) : undefined))
  }

  async function removePty(ptyID: string) {
    return input.sdk.api.pty
      .remove({ ptyID, location: target })
      .then(() => undefined)
      .catch((error: unknown) => (missing(error) ? undefined : errorText(error)))
  }

  return {
    ready,
    list: () => store.pipelines,
    log,
    run,
    stop,
    stopping: (id: string) => stopping[id],
    resume,
    save(definition: PipelineDefinition) {
      if (find(definition.id)) return update(definition.id, definition)
      setStore("pipelines", store.pipelines.length, { ...definition, status: "idle", runs: 0, log: "" })
    },
    remove(id: string) {
      if (find(id)?.status === "running" || live.has(id)) return false
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
