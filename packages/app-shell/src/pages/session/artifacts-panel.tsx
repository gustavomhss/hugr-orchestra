import { Button } from "@orchestra/ui/button"
import { Checkbox } from "@orchestra/ui/checkbox"
import { useDialog } from "@orchestra/ui/context/dialog"
import { Dialog } from "@orchestra/ui/dialog"
import { Icon } from "@orchestra/ui/icon"
import { Tooltip } from "@orchestra/ui/tooltip"
import type { SessionID } from "@orchestra/schema/session-id"
import { createEffect, createMemo, For, Match, on, onCleanup, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { DialogConfirmChoice } from "@/components/dialog-confirm-choice"
import { useLanguage } from "@/context/language"
import { useSync } from "@/context/sync"
import { bytes, relative } from "@/orchestra/actions/format"
import type { Artifact, ArtifactRef, ArtifactSelection, ArtifactsOutcome } from "./artifacts-model"
import { previewKind } from "./artifacts-model"
import { useSessionCapabilities } from "./capabilities"

const KIND_ICON = { image: "photo", video: "photo", pdf: "open-file", sheet: "bullet-list", download: "download" } as const
const SHEET_ROWS = 50

/** The Session's artifacts: a list above the preview of the selected one. */
export function ArtifactsPanel() {
  const language = useLanguage()
  const capabilities = useSessionCapabilities()
  const session = createMemo(() => capabilities?.session())
  return (
    <Show when={session()} keyed>
      {(session) => {
        const model = session.model
        const selected = (row: Artifact) => !!model.state.selected && model.state.selected.id === row.artifact.id
          && model.state.selected.revision === row.artifact.revision
        return (
          <div data-component="artifacts-panel">
            <ul data-slot="artifacts-list" aria-label={language.t("orchestra.artifacts.list")} aria-busy={model.state.status === "loading"}>
              <For each={model.state.artifacts}>
                {(row) => (
                  <li>
                    <button
                      type="button"
                      data-slot="artifacts-row"
                      aria-pressed={selected(row)}
                      onClick={() => void model.select(row.artifact)}
                    >
                      <span data-slot="artifacts-row-icon"><Icon name={KIND_ICON[previewKind(row.mime)]} size="small" /></span>
                      <span data-slot="artifacts-row-main">
                        <span data-slot="artifacts-row-title">
                          <span data-slot="artifacts-row-kind">{row.kind}</span>
                          <Show when={row.pinned}>
                            <span data-slot="artifacts-row-pin" title={language.t("orchestra.artifacts.pinned")}>
                              <Icon name="check-small" size="small" />
                              <span class="sr-only">{language.t("orchestra.artifacts.pinned")}</span>
                            </span>
                          </Show>
                        </span>
                        <span data-slot="artifacts-row-meta">
                          <span data-slot="artifacts-row-mime">{row.mime.split(";")[0]}</span>
                          <span aria-hidden="true">·</span>
                          <span>{bytes(row.bytes)}</span>
                          <span aria-hidden="true">·</span>
                          <time datetime={new Date(row.timeCreated).toISOString()}>
                            {relative(new Date(row.timeCreated).toISOString())}
                          </time>
                        </span>
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
            <Show when={model.state.after && model.state.status !== "loading"}>
              <button type="button" data-slot="artifacts-more" onClick={() => void model.load(true)}>
                {language.t("orchestra.artifacts.more")}
              </button>
            </Show>
            <Show when={model.state.status === "loading"}>
              <p data-slot="artifacts-quiet" role="status">{language.t("orchestra.artifacts.loading")}</p>
            </Show>
            <Show when={model.state.status === "error" && model.state.failure}>
              {(failure) => (
                <p data-slot="artifacts-alert" role="alert">
                  {language.t(`orchestra.artifacts.error.${failure()}`)}
                  <button type="button" data-slot="artifacts-link" onClick={() => void model.load()}>
                    {language.t("orchestra.artifacts.retry")}
                  </button>
                </p>
              )}
            </Show>
            <div data-slot="artifacts-detail">
              <Show
                when={model.selection()}
                keyed
                fallback={<p data-slot="artifacts-empty">{language.t("orchestra.artifacts.select")}</p>}
              >
                {(selection) => <ArtifactDetail selection={selection} />}
              </Show>
            </div>
          </div>
        )
      }}
    </Show>
  )
}

function ArtifactDetail(props: { selection: ArtifactSelection }) {
  const language = useLanguage()
  const dialog = useDialog()
  const capabilities = useSessionCapabilities()
  const session = () => capabilities?.session()
  const model = () => session()?.model
  const artifact = () => props.selection.artifact
  const ref = () => artifact().artifact
  const [preview, setPreview] = createStore<{ status: "loading" | "ready" | "error"; url?: string; rows?: string[][];
    truncated: boolean }>({ status: "loading", truncated: false })

  // A video streams from a header-free ticket URL with its own range requests. Other kinds read the content as a blob,
  // because capability content otherwise needs the Authorization header.
  const stream = { controller: new AbortController(), retried: false, resumeAt: 0 }
  const mint = () => {
    const current = session()
    if (!current) return
    const controller = stream.controller
    void current.api.ticket(ref(), controller.signal).then((ticket) => setPreview({ status: "ready", url: ticket.url }), () => {
      if (!controller.signal.aborted) setPreview({ status: "error" })
    })
  }
  // A ticket expires after a few minutes or on a server restart; mint one fresh ticket and resume where playback stopped.
  const restream = (video: HTMLVideoElement) => {
    if (stream.retried) return setPreview({ status: "error" })
    stream.retried = true
    stream.resumeAt = video.currentTime
    mint()
  }
  createEffect(on(() => props.selection.url, () => {
    const current = session()
    if (!current || props.selection.preview === "download") return
    const controller = new AbortController()
    const owned = { url: undefined as string | undefined }
    setPreview({ status: "loading", url: undefined, rows: undefined, truncated: false })
    onCleanup(() => {
      controller.abort()
      if (owned.url) URL.revokeObjectURL(owned.url)
    })
    if (props.selection.preview === "video") {
      Object.assign(stream, { controller, retried: false, resumeAt: 0 })
      return mint()
    }
    void current.api.read(ref(), controller.signal).then(async (blob) => {
      if (props.selection.preview !== "sheet") {
        owned.url = URL.createObjectURL(blob)
        return setPreview({ status: "ready", url: owned.url })
      }
      const rows = sheetRows(artifact().mime, await blob.text())
      if (!rows) return setPreview({ status: "error" })
      setPreview({ status: "ready", rows: rows.slice(0, SHEET_ROWS), truncated: rows.length > SHEET_ROWS })
    }, () => {
      if (!controller.signal.aborted) setPreview({ status: "error" })
    })
  }))

  const download = () => {
    const current = session()
    if (!current) return
    void current.api.read(ref()).then((blob) => {
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${ref().id}-${ref().revision}`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
    })
  }
  const remove = () => dialog.show(() => (
    <DialogConfirmChoice
      title={language.t("orchestra.artifacts.remove.title")}
      description={language.t("orchestra.artifacts.remove.description")}
      confirm={language.t("orchestra.artifacts.remove")}
      cancel={language.t("orchestra.artifacts.cancel")}
      onConfirm={() => void model()?.remove(ref())}
    />
  ))
  const share = () => dialog.show(() => <ShareDialog artifact={ref()} />)
  const kind = () => language.t(`orchestra.artifacts.kind.${props.selection.preview}`)

  return (
    <section data-component="artifact-detail" aria-label={artifact().kind}>
      <header data-slot="artifact-detail-head">
        <div data-slot="artifact-detail-title">
          <span data-slot="artifact-detail-kind">{artifact().kind}</span>
          <span data-slot="artifact-detail-meta">
            {kind()} · {bytes(artifact().bytes)} · {language.t("orchestra.artifacts.revision", { n: ref().revision })}
          </span>
        </div>
        <Show when={props.selection.note}>
          <Tooltip placement="bottom" value={language.t(`orchestra.artifacts.notVerified.${artifact().verification === "observed"
            ? "observed" : "acknowledged"}`)}>
            <span data-slot="artifact-unverified" tabindex="0">
              <Icon name="warning" size="small" />
              {language.t("orchestra.artifacts.notVerified")}
            </span>
          </Tooltip>
        </Show>
      </header>

      <div data-slot="artifact-preview" data-preview={props.selection.preview} data-status={preview.status}>
        <Switch>
          <Match when={props.selection.preview === "download"}>
            <div data-slot="artifact-preview-empty">
              <Icon name="download" />
              <p>{language.t("orchestra.artifacts.preview.download")}</p>
            </div>
          </Match>
          <Match when={preview.status === "error"}>
            <div data-slot="artifact-preview-empty">
              <Icon name="warning" />
              <p>{language.t(props.selection.preview === "sheet" ? "orchestra.artifacts.preview.sheetFailed"
                : "orchestra.artifacts.error.request")}</p>
            </div>
          </Match>
          <Match when={preview.status === "loading"}>
            <div data-slot="artifact-preview-skeleton" role="status">
              <span class="sr-only">{language.t(props.selection.preview === "sheet" ? "orchestra.artifacts.preview.sheetLoading"
                : "orchestra.artifacts.loading")}</span>
            </div>
          </Match>
          <Match when={props.selection.preview === "image" && preview.url}>
            {(url) => <img src={url()} alt={artifact().kind} draggable={false} />}
          </Match>
          <Match when={props.selection.preview === "video" && preview.url}>
            {(url) => (
              <video
                src={url()}
                controls
                preload="metadata"
                aria-label={artifact().kind}
                onError={(event) => restream(event.currentTarget)}
                onLoadedMetadata={(event) => {
                  if (stream.resumeAt) event.currentTarget.currentTime = stream.resumeAt
                }}
                onPlaying={() => (stream.retried = false)}
              />
            )}
          </Match>
          <Match when={props.selection.preview === "pdf" && preview.url}>
            {(url) => <iframe src={url()} title={artifact().kind} />}
          </Match>
          <Match when={props.selection.preview === "sheet" && preview.rows}>
            {(rows) => (
              <div data-slot="artifact-sheet">
                <table>
                  <tbody>
                    <For each={rows()}>
                      {(row, index) => (
                        <tr>
                          <For each={row}>
                            {(cell) => (index() === 0 ? <th scope="col">{cell}</th> : <td>{cell}</td>)}
                          </For>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
                <Show when={preview.truncated}>
                  <p data-slot="artifacts-quiet">
                    {language.t("orchestra.artifacts.preview.sheetTruncated", { rows: SHEET_ROWS })}
                  </p>
                </Show>
              </div>
            )}
          </Match>
        </Switch>
      </div>

      <div data-slot="artifact-actions">
        <Button size="small" variant="secondary" icon="download" onClick={download}>
          {language.t("orchestra.artifacts.download")}
        </Button>
        <Button size="small" variant="ghost" icon={artifact().pinned ? "close-small" : "check-small"}
          disabled={model()?.state.busy} onClick={() => void model()?.pin(ref(), !artifact().pinned)}>
          {language.t(artifact().pinned ? "orchestra.artifacts.unpin" : "orchestra.artifacts.pin")}
        </Button>
        <Button size="small" variant="ghost" icon="share" disabled={model()?.state.busy} onClick={share}>
          {language.t("orchestra.artifacts.share")}
        </Button>
        <Button size="small" variant="ghost" icon="trash" data-tone="danger" disabled={model()?.state.busy} onClick={remove}>
          {language.t("orchestra.artifacts.remove")}
        </Button>
      </div>

      <ActionStatus />
    </section>
  )
}

/** What the last pin, remove or share did; a share reports one line per target session. */
function ActionStatus() {
  const language = useLanguage()
  const sync = useSync()
  const capabilities = useSessionCapabilities()
  const model = () => capabilities?.session()?.model
  const title = (id?: SessionID) => (id ? sync().session.get(id)?.title : undefined)
    || language.t("orchestra.artifacts.share.untitled")
  const line = (outcome: ArtifactsOutcome) => {
    if (model()?.state.action === "share") {
      if (outcome.failure) return language.t("orchestra.artifacts.shareFailed", { session: title(outcome.targetSessionID) })
      return language.t("orchestra.artifacts.shared", { session: title(outcome.targetSessionID) })
    }
    if (outcome.failure) return language.t(`orchestra.artifacts.error.${outcome.failure}`)
    return language.t("orchestra.artifacts.saved")
  }
  return (
    <Show when={model()}>
      {(model) => (
        <div data-slot="artifact-status">
          <Show when={model().state.busy && model().state.action}>
            {(action) => (
              <p role="status" data-slot="artifact-status-line">
                <span data-slot="artifact-status-spinner" aria-hidden="true" />
                {language.t(`orchestra.artifacts.busy.${action()}`)}
                <button type="button" data-slot="artifacts-link" onClick={() => model().cancel()}>
                  {language.t("orchestra.artifacts.cancel")}
                </button>
              </p>
            )}
          </Show>
          <Show when={!model().state.busy}>
            <For each={model().state.outcomes}>
              {(outcome) => (
                <p role={outcome.failure ? "alert" : "status"} data-slot="artifact-status-line"
                  data-tone={outcome.failure ? "danger" : "success"}>
                  <Icon name={outcome.failure ? "circle-x" : "circle-check"} size="small" />
                  <span>{line(outcome)}</span>
                  <Show when={outcome.receipt?.reused}>
                    <span data-slot="artifact-status-reused">{language.t("orchestra.artifacts.reused")}</span>
                  </Show>
                </p>
              )}
            </For>
            <Show when={model().state.retryable}>
              <button type="button" data-slot="artifacts-link" onClick={() => void model().retry()}>
                {language.t("orchestra.artifacts.retry")}
              </button>
            </Show>
          </Show>
        </div>
      )}
    </Show>
  )
}

function ShareDialog(props: { artifact: ArtifactRef }) {
  const language = useLanguage()
  const dialog = useDialog()
  const sync = useSync()
  const capabilities = useSessionCapabilities()
  const [picked, setPicked] = createStore<Record<string, boolean>>({})
  const targets = createMemo(() => (sync().data.session ?? [])
    .filter((item) => item.id !== capabilities?.session()?.sessionID && !item.parentID && !item.time?.archived)
    .toSorted((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0)))
  const chosen = createMemo(() => targets().filter((item) => picked[item.id]).map((item) => item.id as SessionID))
  return (
    <Dialog title={language.t("orchestra.artifacts.share.title")} description={language.t("orchestra.artifacts.share.description")}>
      <div data-component="artifact-share">
        <Show when={targets().length > 0} fallback={<p data-slot="artifacts-empty">{language.t("orchestra.artifacts.share.empty")}</p>}>
          <ul data-slot="artifact-share-list">
            <For each={targets()}>
              {(item) => (
                <li>
                  <Checkbox checked={!!picked[item.id]} onChange={(value: boolean) => setPicked(item.id, value)}>
                    {item.title || language.t("orchestra.artifacts.share.untitled")}
                  </Checkbox>
                </li>
              )}
            </For>
          </ul>
        </Show>
        <div data-slot="artifact-share-actions">
          <Button size="large" variant="secondary" onClick={() => dialog.close()}>
            {language.t("orchestra.artifacts.cancel")}
          </Button>
          <Button size="large" variant="primary" disabled={chosen().length === 0} onClick={() => {
            void capabilities?.session()?.model.share(props.artifact, chosen())
            dialog.close()
          }}>
            {language.t("orchestra.artifacts.share.confirm")}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

/** The first sheet of a delimited file; binary workbooks have no reader here and fall back to Download. */
function sheetRows(mime: string, text: string) {
  const type = mime.split(";")[0].trim().toLowerCase()
  if (type !== "text/csv" && type !== "text/tab-separated-values") return
  const delimiter = type === "text/csv" ? "," : "\t"
  // A field is either quoted (doubled quotes escape a quote) or runs to the next delimiter or line break.
  const field = new RegExp(`(?:"((?:[^"]|"")*)"|([^"${delimiter}\\n]*))(${delimiter}|\\n|$)`, "g")
  const rows: string[][] = [[]]
  for (const match of text.replace(/\r\n?/g, "\n").matchAll(field)) {
    rows[rows.length - 1].push(match[1] === undefined ? match[2] : match[1].replaceAll('""', '"'))
    if (match[3] === "") break
    if (match[3] === "\n") rows.push([])
  }
  return rows.filter((row) => row.some((value) => value !== ""))
}
