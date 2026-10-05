import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { Option, Schema } from "effect"
import type { useLanguage } from "@/context/language"
import type { Platform } from "@/context/platform"
import type { ServerSDK } from "@/context/server-sdk"
import { Persist, persisted } from "@/utils/persist"
import { terminalWebSocketURL } from "@/utils/terminal-websocket-url"
import { LOG_LIMIT, pipelineScript, plainLog, tailLog, type Pipeline } from "./cicd-data"

type Input = { sdk: ServerSDK; platform: Platform; directory: string; t: ReturnType<typeof useLanguage>["t"] }
type Live = { ptyID?: string; socket?: WebSocket; cursor: number; stopped: boolean; attempts: number }
export type PipelineDefinition = Pick<
  Pipeline,
  "id" | "name" | "branch" | "trigger" | "command" | "environment" | "deploy"
>

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
  const [store, setStore, , ready] = persisted(
    Persist.serverWorkspace(input.sdk.scope, input.directory, "cicd"),
    createStore({ pipelines: [] as Pipeline[] }),
    input.platform,
  )
  // Raw terminal output of active runs. Only the final plain log is persisted.
  const [output, setOutput] = createStore<Record<string, string | undefined>>({})
  const live = new Map<string, Live>()
  const find = (id: string) => store.pipelines.find((item) => item.id === id)
  const update = (id: string, patch: Partial<Pipeline>) => setStore("pipelines", (item) => item.id === id, patch)
  const log = (id: string) => {
    const raw = output[id]
    return `${find(id)?.log ?? ""}${raw ? `\n${plainLog(raw)}` : ""}`
  }
  const close = (id: string, status: Pipeline["status"], lines: string[]) => {
    live.delete(id)
    update(id, { status, log: tailLog([log(id), ...lines].join("\n")), run: undefined })
    setOutput(id, undefined)
  }
  const removePty = (ptyID: string) =>
    input.sdk.api.pty.remove({ ptyID, location: target }).catch(() => undefined)

  async function run(id: string) {
    const item = find(id)
    if (!item || item.status === "running" || live.has(id)) return
    const entry: Live = { cursor: 0, stopped: false, attempts: 0 }
    live.set(id, entry)
    setOutput(id, "")
    update(id, {
      status: "running",
      runs: item.runs + 1,
      run: undefined,
      log: [
        t("orchestra.cicd.log.run", { count: item.runs + 1, time: new Date().toLocaleString() }),
        t("orchestra.cicd.log.branch", { branch: item.branch }),
        t("orchestra.cicd.log.directory", { directory: input.directory }),
        `$ ${item.command}`,
      ].join("\n"),
    })
    const created = await input.sdk.api.pty
      .create({ location: target, args: ["-c", pipelineScript(item.command)], title: `CI/CD · ${item.name}` })
      .then(
        (result) => ({ ptyID: result.data.id }),
        (error: unknown) => ({ error: errorText(error) }),
      )
    if ("error" in created) {
      if (!entry.stopped) close(id, "failed", ["", t("orchestra.cicd.log.startFailed", { detail: created.error })])
      return
    }
    if (entry.stopped) return void removePty(created.ptyID)
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
        setOutput(id, (text) => tailLog(`${text ?? ""}${event.data}`, LOG_LIMIT))
        return
      }
      if (!(event.data instanceof ArrayBuffer)) return
      const bytes = new Uint8Array(event.data)
      if (bytes[0] !== 0) return
      const meta = decodeMeta(new TextDecoder().decode(bytes.subarray(1)))
      if (Option.isSome(meta)) entry.cursor = meta.value.cursor
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
    const info = await input.sdk.api.pty.get({ ptyID, location: target }).then(
      (result) => result.data,
      (error: unknown) => (missing(error) ? ("missing" as const) : undefined),
    )
    if (entry.stopped || live.get(id) !== entry) return
    if (info === "missing") return close(id, "interrupted", ["", t("orchestra.cicd.log.interrupted")])
    if (info?.status === "exited") {
      const item = find(id)
      const passed = info.exitCode === 0
      const environment = t(`orchestra.cicd.environment.${item?.environment ?? "preview"}`)
      close(id, passed ? "passed" : "failed", [
        // 4404 means the run ended before this socket attached, so its last output was not observed.
        ...(code === 4404 ? [t("orchestra.cicd.log.missed")] : []),
        "",
        info.exitCode === undefined
          ? t("orchestra.cicd.log.noExitCode")
          : t("orchestra.cicd.log.exited", { code: info.exitCode }),
        ...(item?.deploy
          ? [t(passed ? "orchestra.cicd.log.deployNotRun" : "orchestra.cicd.log.deploySkipped", { environment })]
          : []),
        t(passed ? "orchestra.cicd.log.passed" : "orchestra.cicd.log.failed"),
      ])
      return void removePty(ptyID)
    }
    // Still running, or the server is unreachable: reconnect from the consumed cursor with backoff.
    entry.attempts += 1
    if (entry.attempts > 8) return void live.delete(id)
    setTimeout(
      () => {
        if (!entry.stopped && live.get(id) === entry) void connect(id, entry)
      },
      Math.min(250 * 2 ** entry.attempts, 4000),
    )
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
    if (ptyID) void removePty(ptyID)
  }

  // Reattach runs left running by an earlier page lifetime. Idempotent for runs already attached.
  function resume() {
    store.pipelines
      .filter((item) => item.status === "running" && !live.has(item.id))
      .forEach((item) => {
        if (!item.run) return close(item.id, "interrupted", ["", t("orchestra.cicd.log.interrupted")])
        const entry: Live = { ptyID: item.run.ptyID, cursor: 0, stopped: false, attempts: 0 }
        live.set(item.id, entry)
        setOutput(item.id, "")
        void connect(item.id, entry)
      })
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
  if (error instanceof Error) return error.message.startsWith("Terminal not found")
  if (!error || typeof error !== "object") return false
  return ("_tag" in error && error._tag === "PtyNotFoundError") || ("name" in error && error.name === "NotFoundError")
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message
  return String(error)
}
