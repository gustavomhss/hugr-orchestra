import { ImagePreview } from "@orchestra/ui/image-preview"
import { useDialog } from "@orchestra/ui/context/dialog"
import { ProviderIcon } from "@orchestra/ui/provider-icon"
import { ButtonV2 } from "@orchestra/ui/v2/button-v2"
import { Icon } from "@orchestra/ui/v2/icon"
import { KeybindV2 } from "@orchestra/ui/v2/keybind-v2"
import { TooltipV2 } from "@orchestra/ui/v2/tooltip-v2"
import type { ReferenceInfo } from "@orchestra/sdk/v2/client"
import { createEffect, createMemo, on, onCleanup, Show } from "solid-js"
import { ModelSelectorPopoverV2 } from "@/components/dialog-select-model"
import { DialogSelectModelUnpaidV2 } from "@/components/dialog-select-model-unpaid-v2"
import type { PromptInputProps } from "@/components/prompt-input/contracts"
import { normalizePromptHistoryEntry, promptLength, type PromptHistoryComment } from "@/components/prompt-input/history"
import { createPersistedPromptInputHistory } from "@/components/prompt-input/history-store"
import { promptDesignPlaceholder, promptPlaceholder } from "@/components/prompt-input/placeholder"
import { createPromptSubmit } from "@/components/prompt-input/submit"
import { selectionFromLines, type SelectedLineRange, useFile } from "@/context/file"
import { useComments } from "@/context/comments"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePermission } from "@/context/permission"
import { type ImageAttachmentPart, usePrompt } from "@/context/prompt"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useProviders } from "@/hooks/use-providers"
import { createDraftSessionState, useDraftSessionKey } from "./prompt-input/draft-session"
import { effectiveModelState, hasModelScope } from "@/components/subagent-model-rules"
import { useServerProtocol } from "@/context/server-sdk"
import { createSessionTabs } from "@/pages/session/helpers"
import { OrchestraComposeTools } from "@/pages/session/composer/orchestra-compose-tools"
import { useSessionDelivery } from "@/pages/session/composer/delivery"
import { showToast } from "@/utils/toast"
import { PromptInputV2, type PromptInputV2Suggestion } from "@orchestra/session-ui/v2/prompt-input"
import { agentKey, agentMention } from "@/context/agent-identity"
import {
  createPromptInputV2Controller,
  createPromptInputV2State,
  type PromptInputV2Interaction,
} from "@orchestra/session-ui/v2/prompt-input/interaction"

export type PromptInputV2ComposerProps = {
  class?: string
  controller: PromptInputV2ComposerController
  borderUnderlay?: boolean
  sessionID?: string
}

export type PromptInputV2ControllerProps = Omit<PromptInputProps, "class" | "submission">
export type PromptInputV2ComposerController = PromptInputV2Interaction & {
  readonly model: PromptInputProps["controls"]["model"]
  readonly pendingKey: () => string
  readonly submitting: () => boolean
}

export function PromptInputV2Composer(props: PromptInputV2ComposerProps) {
  const dialog = useDialog()
  const command = useCommand()
  const language = useLanguage()
  // The session composer reads "Message Orchestra…" in normal mode; Home and Janitor keep their copy.
  // The view inherits from the controller's own, so its reactive getters stay live.
  const view = Object.create(props.controller.view, {
    placeholder: {
      value: () =>
        props.controller.state.mode === "normal"
          ? language.t("orchestra.chat.placeholder")
          : props.controller.view.placeholder?.(),
    },
    // The Orchestra tools carry the session's one Stop, so send stays send while a run works, as in the
    // approved mock; a second control named Stop would only repeat it.
    submit: { value: Object.create(props.controller.view.submit, { stopping: { value: () => false } }) },
  })
  const controller = () =>
    props.sessionID
      ? (Object.create(props.controller, { view: { value: view } }) as PromptInputV2ComposerController)
      : props.controller

  return (
    <div class="flex flex-col gap-3" data-prompt-admitting={String(props.controller.submitting())}>
      <PromptInputV2
        controller={controller()}
        borderUnderlay={props.borderUnderlay}
        class={props.class}
        variantControlVisible={!props.controller.model.loading}
        attachKeybind={command.keybindParts("file.attach")}
        attachShortcut={command.keybind("file.attach")}
        subagentModelsControl={
          <>
            <Show when={props.sessionID}>
              {(sessionID) => <OrchestraComposeTools controller={props.controller} sessionID={sessionID()} />}
            </Show>
            <PromptInputV2SubagentModelsControl
              sessionID={props.sessionID}
              pendingKey={props.controller.pendingKey()}
            />
          </>
        }
        modelControl={
          <PromptInputV2ModelControl
            loading={props.controller.model.loading}
            paid={props.controller.model.paid}
            title={language.t("command.model.choose")}
            keybind={command.keybindParts("model.choose")}
            model={props.controller.model.selection}
            providerID={props.controller.model.selection.current()?.provider?.id}
            modelName={props.controller.model.selection.current()?.name ?? language.t("dialog.model.select.title")}
            onClose={props.controller.restoreFocus}
            onUnpaidClick={() => dialog.show(() => <DialogSelectModelUnpaidV2 />)}
          />
        }
      />
    </div>
  )
}

export function usePromptInputV2Controller(props: PromptInputV2ControllerProps): PromptInputV2ComposerController {
  const sdk = useSDK()
  const sync = useSync()
  const files = useFile()
  const layout = useLayout()
  const comments = useComments()
  const dialog = useDialog()
  const command = useCommand()
  const permission = usePermission()
  const language = useLanguage()
  const platform = usePlatform()
  const prompt = props.state ?? usePrompt()
  const pendingKey = useDraftSessionKey()
  let editor: HTMLDivElement | undefined

  const interaction = createPromptInputV2State()
  const mode = () => interaction[0].mode
  const history = props.history ?? createPersistedPromptInputHistory()
  const tabs = () => props.controls.session.tabs
  const activeFileTab = createSessionTabs({
    tabs,
    pathFromTab: files.pathFromTab,
    normalizeTab: (tab) => (tab.startsWith("file://") ? files.tab(tab) : tab),
  }).activeFileTab
  const recent = createMemo(() => {
    const all = tabs().all()
    const active = activeFileTab()
    const order = active ? [active, ...all.filter((tab) => tab !== active)] : all
    return order.reduce<string[]>((result, tab) => {
      const path = files.pathFromTab(tab)
      if (!path || result.includes(path)) return result
      return [...result, path]
    }, [])
  })
  const info = createMemo(() => (props.controls.session.id ? sync().session.get(props.controls.session.id) : undefined))
  const working = createMemo(() => sync().data.session_working(props.controls.session.id ?? ""))
  const attachments = createMemo(() =>
    prompt.current().filter((part): part is ImageAttachmentPart => part.type === "image"),
  )
  const commentCount = createMemo(() => {
    if (mode() === "shell") return 0
    return prompt.context.items().filter((item) => !!item.comment?.trim()).length
  })
  const blank = createMemo(() => {
    const text = prompt
      .current()
      .map((part) => ("content" in part ? part.content : ""))
      .join("")
    return text.trim().length === 0 && attachments().length === 0 && commentCount() === 0
  })
  const placeholder = createMemo(() =>
    promptPlaceholder({
      mode: mode(),
      commentCount: commentCount(),
      example: mode() === "shell" ? "git status" : "",
      suggest: false,
      t: (key, params) => language.t(key as Parameters<typeof language.t>[0], params as never),
    }),
  )
  const designPlaceholder = () =>
    promptDesignPlaceholder(mode(), placeholder(), (key, params) =>
      language.t(key as Parameters<typeof language.t>[0], params as never),
    )

  const historyComments = () => {
    const byID = new Map(comments.all().map((item) => [`${item.file}\n${item.id}`, item] as const))
    return prompt.context.items().flatMap((item) => {
      const comment = item.comment?.trim()
      if (!comment) return []
      const selection = item.commentID ? byID.get(`${item.path}\n${item.commentID}`)?.selection : undefined
      const nextSelection =
        selection ??
        (item.selection
          ? ({ start: item.selection.startLine, end: item.selection.endLine } satisfies SelectedLineRange)
          : undefined)
      if (!nextSelection) return []
      return [
        {
          id: item.commentID ?? item.key,
          path: item.path,
          selection: { ...nextSelection },
          comment,
          time: item.commentID ? (byID.get(`${item.path}\n${item.commentID}`)?.time ?? Date.now()) : Date.now(),
          origin: item.commentOrigin,
          preview: item.preview,
        } satisfies PromptHistoryComment,
      ]
    })
  }
  const restoreHistoryComments = (items: PromptHistoryComment[]) => {
    comments.replace(
      items.map((item) => ({
        id: item.id,
        file: item.path,
        selection: { ...item.selection },
        comment: item.comment,
        time: item.time,
      })),
    )
    prompt.context.replaceComments(
      items.map((item) => ({
        type: "file",
        path: item.path,
        selection: selectionFromLines(item.selection),
        comment: item.comment,
        commentID: item.id,
        commentOrigin: item.origin,
        preview: item.preview,
      })),
    )
  }

  const accepting = createMemo(() => {
    const id = props.controls.session.id
    if (!id) return permission.isAutoAcceptingDirectory(sdk().directory)
    return permission.isAutoAccepting(id, sdk().directory)
  })
  const submission = createPromptSubmit({
    prompt,
    info,
    pendingKey,
    imageAttachments: attachments,
    commentCount,
    autoAccept: accepting,
    mode,
    working,
    editor: () => editor,
    queueScroll: () => requestAnimationFrame(() => editor?.scrollIntoView({ block: "nearest" })),
    promptLength,
    addToHistory: (value, mode) => controller.addHistory(value, mode),
    resetHistoryNavigation: () => controller.resetHistory(),
    setMode: (next) => controller.dispatch({ type: next === "shell" ? "mode.shell" : "mode.normal" }),
    setPopover: (popover) => {
      if (!popover) controller.dispatch({ type: "popover.close" })
    },
    newSessionWorktree: () => props.newSessionWorktree,
    onNewSessionWorktreeReset: props.onNewSessionWorktreeReset,
    shouldQueue: props.shouldQueue,
    onQueue: props.onQueue,
    onAbort: props.onAbort,
    onSubmit: props.onSubmit,
    model: props.controls.model.selection,
    delivery: useSessionDelivery(() => props.controls.session.id).delivery,
  })
  // A new-session draft has no Session status to watch; its admission in flight is what Send turns into Stop for.
  const admitting = () => !props.controls.session.id && submission.submitting()
  const stopping = createMemo(() => admitting() || (working() && blank()))

  const referenceDescription = (reference: ReferenceInfo) =>
    reference.source.type === "git" ? reference.source.repository : reference.source.path
  const references = createMemo(() =>
    sync()
      .data.reference.filter((reference) => !reference.hidden)
      .map((reference) => ({
        id: `reference:${reference.name}`,
        kind: "reference" as const,
        label: `@${reference.name}`,
        path: reference.path,
        description: reference.description ?? referenceDescription(reference),
        mention: {
          type: "file" as const,
          path: reference.path,
          content: `@${reference.name}`,
          start: 0,
          end: 0,
          mime: "application/x-directory",
          filename: reference.name,
        },
      })),
  )
  const resources = createMemo(() =>
    Object.values(sync().data.mcp_resource).map((resource) => ({
      id: `resource:${resource.server}:${resource.uri}`,
      kind: "resource" as const,
      label: `@${resource.name}`,
      path: resource.uri,
      description: resource.description,
      mention: {
        type: "file" as const,
        path: resource.uri,
        content: `@${resource.name}`,
        start: 0,
        end: 0,
        mime: resource.mimeType ?? "text/plain",
        filename: resource.name,
        url: resource.uri,
        source: {
          type: "resource" as const,
          text: { value: `@${resource.name}`, start: 0, end: resource.name.length + 1 },
          clientName: resource.server,
          uri: resource.uri,
        },
      },
      resource,
    })),
  )
  const context = createMemo<PromptInputV2Suggestion[]>(() => [
    ...references(),
    ...props.controls.agents.available
      .filter((agent) => !agent.hidden && agent.mode !== "primary")
      .map((agent) => ({
        id: `agent:${agentKey(agent)}`,
        kind: "agent" as const,
        label: `@${agent.name}`,
        mention: agentMention(agent),
      })),
    ...resources(),
    ...recent().map((path) => ({
      id: `file:${path}`,
      kind: "file" as const,
      label: path,
      path,
      recent: true,
      mention: { type: "file" as const, path, content: `@${path}`, start: 0, end: 0 },
    })),
  ])
  const slashCommands = createMemo(() => [
    ...(sync().data.command ?? []).map((item) => ({
      id: `custom.${item.name}`,
      trigger: item.name,
      title: item.name,
      description: item.description,
      type: "custom" as const,
    })),
    ...command.options
      .filter((item) => !item.disabled && !item.id.startsWith("suggested.") && item.slash)
      .map((item) => ({
        id: item.id,
        trigger: item.slash!,
        title: item.title,
        description: item.description,
        type: "builtin" as const,
      })),
  ])
  const commands = createMemo<PromptInputV2Suggestion[]>(() =>
    slashCommands().map((item) => ({
      id: item.id,
      kind: "command",
      label: `/${item.trigger}`,
      trigger: item.trigger,
      title: item.title,
      description: item.description,
      keybind: command.keybindParts(item.id),
    })),
  )
  const variants = createMemo(() => ["default", ...props.controls.model.selection.variant.list()])
  const controller = createPromptInputV2Controller({
    store: () => prompt.capture().store,
    state: interaction,
    identity: () => prompt.capture(),
    history: {
      entries: (mode) =>
        history.entries(mode).map((value) => {
          const entry = normalizePromptHistoryEntry(value)
          return { prompt: entry.prompt, metadata: entry.comments }
        }),
      add: (value, mode) => history.add(value, mode, mode === "shell" ? [] : historyComments()),
      capture: historyComments,
      restore: (metadata) => restoreHistoryComments(metadata as PromptHistoryComment[]),
    },
    commands,
    context,
    searchContextFiles: async (query) =>
      (await files.searchFilesAndDirectories(query)).map((path) => ({
        id: `file:${path}`,
        kind: "file",
        label: path,
        path,
        mention: { type: "file", path, content: `@${path}`, start: 0, end: 0 },
      })),
    onContextRemove(item) {
      if (item?.commentID) comments.remove(item.path, item.commentID)
    },
    openAttachment: (attachment) =>
      dialog.show(() => <ImagePreview src={attachment.blob.url} alt={attachment.filename} />),
    openContext(key) {
      const item = controller.contextItem(key)
      if (item) openComment(item, props, sync, layout, files, comments)
    },
    onEditor(element) {
      editor = element as HTMLDivElement
      props.ref?.(editor)
    },
    onSuggestionSelect(item) {
      if (item.kind !== "command") return
      const selected = slashCommands().find((entry) => entry.id === item.id)
      if (!selected || selected.type === "custom") return
      return () => command.trigger(selected.id, "slash")
    },
    attachments: {
      picker: platform.openAttachmentPickerDialog,
      directory: () => sdk().directory,
      isDialogActive: () => !!dialog.active,
      warn: () =>
        showToast({
          title: language.t("prompt.toast.pasteUnsupported.title"),
          description: language.t("prompt.toast.pasteUnsupported.description"),
        }),
      duplicate: () => showToast({ title: language.t("prompt.toast.attachmentDuplicate.title") }),
      onError: (error) =>
        showToast({
          variant: "error",
          title: language.t("common.requestFailed"),
          description: error instanceof Error ? error.message : String(error),
        }),
      readClipboardImage: platform.readClipboardImage,
      getPathForFile: platform.getPathForFile,
      store: platform.draftStore?.putBlob,
    },
    view: {
      placeholder: designPlaceholder,
      variant: {
        options: () => variants().map((value) => ({ id: value, label: value })),
        current: () => props.controls.model.selection.variant.current() ?? "default",
        onSelect: (value) => props.controls.model.selection.variant.set(value === "default" ? undefined : value),
        keybind: () => command.keybindParts("model.variant.cycle"),
      },
      submit: {
        stopping,
        working: () => working() || admitting(),
        onSubmit: () => void submission.handleSubmit(new Event("submit")),
        onStop: () => void submission.abort(),
      },
    },
  })
  const composer = Object.assign(controller, { model: props.controls.model, pendingKey, submitting: submission.submitting })
  Object.defineProperty(composer, "model", { get: () => props.controls.model })

  command.register("prompt-input", () => [
    {
      id: "file.attach",
      title: language.t("prompt.action.attachFile"),
      category: language.t("command.category.file"),
      keybind: "mod+u",
      disabled: controller.state.mode !== "normal",
      onSelect: () => controller.attach(),
    },
    {
      id: "prompt.mode.shell",
      title: language.t("command.prompt.mode.shell"),
      category: language.t("command.category.session"),
      keybind: "mod+shift+x",
      disabled: controller.state.mode === "shell",
      onSelect: () => controller.dispatch({ type: "mode.shell" }),
    },
    {
      id: "prompt.mode.normal",
      title: language.t("command.prompt.mode.normal"),
      category: language.t("command.category.session"),
      keybind: "mod+shift+e",
      disabled: controller.state.mode === "normal",
      onSelect: () => controller.dispatch({ type: "mode.normal" }),
    },
  ])

  createEffect(
    on(
      () => props.edit?.id,
      (id) => {
        const edit = props.edit
        if (!id || !edit) return
        prompt.context.items().forEach((item) => prompt.context.remove(item.key))
        edit.context.forEach((item) =>
          prompt.context.add({
            type: item.type,
            path: item.path,
            selection: item.selection,
            comment: item.comment,
            commentID: item.commentID,
            commentOrigin: item.commentOrigin,
            preview: item.preview,
          }),
        )
        controller.dispatch({ type: "mode.normal" })
        controller.resetHistory()
        prompt.set(edit.prompt, promptLength(edit.prompt))
        controller.restoreFocus()
        props.onEditLoaded?.()
      },
      { defer: true },
    ),
  )

  return composer
}

function PromptInputV2SubagentModelsControl(props: { sessionID?: string; pendingKey: string }) {
  const dialog = useDialog()
  const language = useLanguage()
  const sdk = useSDK()
  const sync = useSync()
  const providers = useProviders(() => sdk().directory)
  const protocol = useServerProtocol()
  const draftSession = createDraftSessionState({ sessionID: () => props.sessionID, pendingKey: () => props.pendingKey })
  const unresolved = () => !!props.sessionID && (
    protocol() === undefined || (protocol() === "v2" &&
      (draftSession.loading() || !!draftSession.error() || !draftSession.policy()))
  )
  const life = { active: true }
  onCleanup(() => { life.active = false })
  const source = createMemo(() => {
    const sdkValue = sdk()
    return { sdk: sdkValue, directory: sdkValue.directory, sessionID: props.sessionID, pendingKey: draftSession.pendingKey() }
  })

  const rules = () => {
    const id = props.sessionID
    if (!id) return []
    const permission = sync().session.get(id)?.permission
    return Array.isArray(permission) ? permission : []
  }
  const label = () => {
    if (props.sessionID && protocol() === undefined) return language.t("common.loading")
    if (!props.sessionID || protocol() === "v2") {
      const current = draftSession.policy()
      if (draftSession.error()) return language.t("dialog.subagentModels.saveFailed")
      if (draftSession.loading() || !current) return language.t("common.loading")
      return current.mode === "inherit" ? language.t("dialog.subagentModels.inherited") : `${current.models.length}`
    }
    const scoped = hasModelScope(rules())
    if (!scoped) return language.t("session.tasks.models.all")
    const allowed = providers
      .connected()
      .flatMap((provider) =>
        Object.values(provider.models).filter(
          (model) => effectiveModelState(rules(), provider.id, model.id) === "allow",
        ),
      ).length
    return `${allowed}`
  }
  const open = async () => {
    const selection = source()
    if (!selection.directory || !life.active || unresolved()) return
    const { DialogSubagentModels } = await import("@/components/dialog-subagent-models")
    if (!life.active || source() !== selection || unresolved()) return
    dialog.show(() => <DialogSubagentModels sessionID={selection.sessionID} directory={selection.directory} pendingKey={selection.pendingKey} />)
  }

  return (
    <TooltipV2 placement="top" gutter={4} value={<>{language.t("dialog.subagentModels.title")}</>}>
      <ButtonV2
        variant="ghost-muted"
        size="normal"
        style={{ height: "28px" }}
        class="min-w-0 max-w-[220px] justify-start ![font-weight:440] group"
        data-action="prompt-subagent-models"
        data-control-type="dialog"
        disabled={unresolved()}
        aria-busy={!!props.sessionID && (protocol() === undefined || draftSession.loading()) || undefined}
        onClick={open}
      >
        <span class="truncate leading-4">
          {props.sessionID && protocol() === "v1"
            ? hasModelScope(rules())
              ? language.t("orchestra.chat.models.count", { count: label() })
              : language.t("orchestra.chat.models.all")
            : language.t("session.tasks.models.label", { count: label() })}
        </span>
        <span class="-ms-0.5 -me-1 flex shrink-0">
          <Icon name="chevron-down" />
        </span>
      </ButtonV2>
    </TooltipV2>
  )
}

function PromptInputV2ModelControl(props: {
  loading: boolean
  paid: boolean
  title: string
  keybind: string[]
  model: PromptInputV2ComposerController["model"]["selection"]
  providerID?: string
  modelName: string
  onClose: () => void
  onUnpaidClick: () => void
}) {
  const shouldAnimate = createMemo<boolean>((previous) => previous ?? props.loading)
  const content = () => (
    <>
      <Show when={props.providerID}>
        {(providerID) => (
          <ProviderIcon
            id={providerID()}
            class="size-4 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity duration-150"
            style={{ "will-change": "opacity", transform: "translateZ(0)" }}
          />
        )}
      </Show>
      <span class="truncate leading-4">{props.modelName}</span>
      <span class="-ml-0.5 -mr-1 flex shrink-0">
        <Icon name="chevron-down" />
      </span>
    </>
  )
  return (
    <Show when={!props.loading}>
      <TooltipV2
        placement="top"
        gutter={4}
        value={
          <>
            {props.title}
            <KeybindV2 keys={props.keybind} variant="neutral" />
          </>
        }
      >
        <Show
          when={props.paid}
          fallback={
            <ButtonV2
              data-action="prompt-model"
              data-control-type="dialog"
              variant="ghost-muted"
              size="normal"
              class="min-w-0 max-w-[220px] justify-start ![font-weight:440] group"
              classList={{ "animate-in fade-in": shouldAnimate() }}
              style={{ height: "28px" }}
              onClick={props.onUnpaidClick}
            >
              {content()}
            </ButtonV2>
          }
        >
          <ModelSelectorPopoverV2
            model={props.model}
            trigger={(triggerProps) => (
              <ButtonV2
                {...triggerProps}
                variant="ghost-muted"
                size="normal"
                style={{ height: "28px" }}
                class="min-w-0 max-w-[220px] justify-start ![font-weight:440] group"
                classList={{ "animate-in fade-in": shouldAnimate() }}
                data-action="prompt-model"
                data-control-type="popover"
              >
                {content()}
              </ButtonV2>
            )}
            onClose={props.onClose}
          />
        </Show>
      </TooltipV2>
    </Show>
  )
}

function openComment(
  item: { path: string; commentID?: string; commentOrigin?: "review" | "file" },
  props: PromptInputV2ControllerProps,
  sync: ReturnType<typeof useSync>,
  layout: ReturnType<typeof useLayout>,
  files: ReturnType<typeof useFile>,
  comments: ReturnType<typeof useComments>,
) {
  if (!item.commentID) return
  const focus = { file: item.path, id: item.commentID }
  comments.setActive(focus)
  const queueFocus = (attempts = 6) => {
    requestAnimationFrame(() => {
      comments.setFocus({ ...focus })
      if (attempts <= 0) return
      requestAnimationFrame(() => {
        const current = comments.focus()
        if (current?.file === focus.file && current.id === focus.id) queueFocus(attempts - 1)
      })
    })
  }
  const diffs = props.controls.session.id ? sync().data.session_diff[props.controls.session.id] : undefined
  const review =
    item.commentOrigin === "review" || (item.commentOrigin !== "file" && diffs?.some((diff) => diff.file === item.path))
  if (!props.controls.session.reviewPanel.opened()) props.controls.session.reviewPanel.open()
  if (review) {
    layout.fileTree.setTab("changes")
    props.controls.session.tabs.setActive("review")
    queueFocus()
    return
  }
  layout.fileTree.setTab("all")
  const tab = files.tab(item.path)
  void props.controls.session.tabs.open(tab)
  props.controls.session.tabs.setActive(tab)
  void Promise.resolve(files.load(item.path)).finally(() => queueFocus())
}
