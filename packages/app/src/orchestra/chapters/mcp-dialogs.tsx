import { createUniqueId, For, type JSX, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { MxBadge } from "./kit"
import { mcpErrorDetail } from "./mcp-actions"
import {
  type McpCard,
  mcpConfig,
  mcpDraft,
  mcpNameValid,
  type McpServerConfig,
  type McpTransport,
  mcpUnchanged,
} from "./mcp-model"

// Native modal like the mock: top layer, Escape and backdrop close, focus returns to the opener.
function McpDialog(props: {
  title: string
  subtitle: string
  error?: string
  busy?: boolean
  save?: string
  // Receives the native close, so a finished write returns focus to the opener like Cancel does.
  onSubmit?: (close: () => void) => void
  onClose: () => void
  children: JSX.Element
}) {
  const language = useLanguage()
  const id = createUniqueId()
  let dialog!: HTMLDialogElement
  onMount(() => dialog.showModal())

  // Unmounting an open dialog (another dialog replaced it) is not a user close.
  return (
    <dialog
      ref={dialog}
      class="mx-dialog orchestra-mcp-dialog"
      aria-labelledby={`${id}-title`}
      onClose={() => {
        if (dialog.isConnected) props.onClose()
      }}
      onClick={(event) => {
        if (event.target !== dialog) return
        const rect = dialog.getBoundingClientRect()
        const inside =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        if (!inside) dialog.close()
      }}
    >
      <form
        autocomplete="off"
        aria-busy={props.busy}
        onSubmit={(event) => {
          event.preventDefault()
          if (!props.busy) props.onSubmit?.(() => dialog.close())
        }}
      >
        <header class="mx-dialog-head">
          <div>
            <h2 id={`${id}-title`}>{props.title}</h2>
            <p>{props.subtitle}</p>
          </div>
          <button
            type="button"
            class="mx-link"
            aria-label={language.t("orchestra.mcp.closeDialog")}
            onClick={() => dialog.close()}
          >
            <svg class="orchestra-mcp-ic" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
          </button>
        </header>
        <div class="mx-dialog-body">
          <Show when={props.error}>
            <p class="mx-error" role="alert">
              {props.error}
            </p>
          </Show>
          {props.children}
        </div>
        <footer class="mx-dialog-foot">
          <button type="button" class="mx-btn" onClick={() => dialog.close()}>
            {language.t("orchestra.mcp.cancel")}
          </button>
          <Show when={props.save}>
            <button class="mx-btn primary" type="submit" disabled={props.busy}>
              {props.save}
            </button>
          </Show>
        </footer>
      </form>
    </dialog>
  )
}

export function McpEditDialog(props: {
  card?: McpCard
  names: readonly string[]
  // False when the server cannot report an existing server's config (V2): saving would guess.
  writable: boolean
  onSave: (name: string, config: McpServerConfig) => Promise<unknown>
  onRemove: () => void
  onClose: () => void
}) {
  const language = useLanguage()
  const initial = mcpDraft(props.card?.entry)
  const locked = !!props.card && !props.writable
  const [draft, setDraft] = createStore({
    name: props.card?.name ?? "",
    transport: initial?.transport ?? ("stdio" as McpTransport),
    endpoint: initial?.endpoint ?? "",
    error:
      props.card && "error" in props.card.status
        ? language.t("orchestra.mcp.lastError", { detail: props.card.status.error })
        : "",
    busy: false,
  })

  async function submit(close: () => void) {
    const name = draft.name.trim()
    if (!mcpNameValid(name)) return setDraft("error", language.t("orchestra.mcp.invalidName"))
    if (!props.card && props.names.includes(name)) return setDraft("error", language.t("orchestra.mcp.duplicate"))
    const result = mcpConfig(draft.transport, draft.endpoint)
    if ("error" in result)
      return setDraft(
        "error",
        language.t(result.error === "url" ? "orchestra.mcp.invalidUrl" : "orchestra.mcp.invalidCommand"),
      )
    // Saving restarts every MCP server in the profile, so an unedited dialog writes nothing.
    if (props.card && mcpUnchanged(props.card.entry, result.config)) return close()
    setDraft({ busy: true, error: "" })
    await props
      .onSave(name, result.config)
      .then(close)
      .catch((error: unknown) =>
        setDraft({
          busy: false,
          error: language.t("orchestra.mcp.actionError", {
            detail: mcpErrorDetail(error) ?? language.t("common.requestFailed"),
          }),
        }),
      )
  }

  return (
    <McpDialog
      title={
        props.card
          ? language.t("orchestra.mcp.configureTitle", { name: props.card.name })
          : language.t("orchestra.mcp.add")
      }
      subtitle={language.t("orchestra.mcp.editSubtitle")}
      error={draft.error}
      busy={draft.busy}
      save={locked ? undefined : language.t("orchestra.mcp.save")}
      onSubmit={(close) => void submit(close)}
      onClose={() => props.onClose()}
    >
      <label class="mx-field">
        <span>{language.t("orchestra.mcp.name")}</span>
        <input
          name="name"
          type="text"
          required
          readOnly={!!props.card}
          value={draft.name}
          onInput={(event) => setDraft("name", event.currentTarget.value)}
        />
      </label>
      <label class="mx-field">
        <span>{language.t("orchestra.mcp.transport")}</span>
        <select
          name="transport"
          disabled={locked}
          value={draft.transport}
          onChange={(event) => setDraft("transport", event.currentTarget.value === "http" ? "http" : "stdio")}
        >
          <option value="stdio">stdio</option>
          <option value="http">http</option>
        </select>
      </label>
      <label class="mx-field">
        <span>{language.t("orchestra.mcp.endpoint")}</span>
        <input
          name="endpoint"
          type="text"
          required
          disabled={locked}
          value={draft.endpoint}
          onInput={(event) => setDraft("endpoint", event.currentTarget.value)}
        />
      </label>
      <Show when={props.card && !initial}>
        <p class="mx-note orchestra-mcp-dialog-note" role="note">
          {language.t(locked ? "orchestra.mcp.configUnavailable" : "orchestra.mcp.configOutside")}
        </p>
      </Show>
      <Show when={props.card}>
        <button type="button" class="mx-btn" onClick={() => props.onRemove()}>
          {language.t("orchestra.mcp.remove")}
        </button>
      </Show>
    </McpDialog>
  )
}

export function McpToolsDialog(props: { card: McpCard; status: string; supported: boolean; onClose: () => void }) {
  const language = useLanguage()
  return (
    <McpDialog
      title={language.t("orchestra.mcp.toolsTitle", { name: props.card.name })}
      subtitle={props.card.endpoint ?? ""}
      onClose={() => props.onClose()}
    >
      <Show
        when={props.card.tools?.length}
        fallback={
          <div class="mx-empty" role="status">
            {language.t(
              !props.supported
                ? "orchestra.mcp.toolsUnsupported"
                : props.card.tools
                  ? "orchestra.mcp.toolsNone"
                  : "orchestra.mcp.toolsUnknown",
            )}
          </div>
        }
      >
        <div class="mx-table">
          <For each={props.card.tools}>
            {(tool) => (
              <div class="mx-row">
                <div class="mx-grow">
                  <strong>
                    <bdi>{tool}</bdi>
                  </strong>
                  <small>{language.t("orchestra.mcp.toolAvailable")}</small>
                </div>
                <MxBadge>{props.status}</MxBadge>
              </div>
            )}
          </For>
        </div>
      </Show>
    </McpDialog>
  )
}

export function McpRemoveDialog(props: {
  name: string
  profile: string
  onConfirm: () => Promise<unknown>
  onClose: () => void
}) {
  const language = useLanguage()
  const [state, setState] = createStore({ busy: false, error: "" })
  return (
    <McpDialog
      title={language.t("orchestra.mcp.removeTitle")}
      subtitle={language.t("orchestra.mcp.removeSubtitle")}
      error={state.error}
      busy={state.busy}
      save={language.t("orchestra.mcp.confirm")}
      onSubmit={(close) => {
        setState({ busy: true, error: "" })
        void props
          .onConfirm()
          .then(close)
          .catch((error: unknown) =>
            setState({
              busy: false,
              error: language.t("orchestra.mcp.actionError", {
                detail: mcpErrorDetail(error) ?? language.t("common.requestFailed"),
              }),
            }),
          )
      }}
      onClose={() => props.onClose()}
    >
      <p class="mx-note">{language.t("orchestra.mcp.removeNote", { name: props.name, profile: props.profile })}</p>
    </McpDialog>
  )
}
