import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useData } from "../../context"
import { useDialog } from "@orchestra/ui/context/dialog"
import { useI18n } from "@orchestra/ui/context/i18n"
import { FileIcon } from "@orchestra/ui/file-icon"
import { ImagePreview } from "@orchestra/ui/image-preview"
import { getFilename } from "@orchestra/core/util/path"
import { AttachmentCardV2 } from "../../v2/components/attachment-card-v2"
import { CommentCardV2 } from "../../v2/components/comment-card-v2"
import { ButtonV2 } from "@orchestra/ui/v2/button-v2"
import { attached, inline, kind, typeLabel } from "../message-file"
import { AgentPart, FilePart, PartType, TextPart, UserMessage, UserActions, UserMessageComment } from "./types"
import { writeClipboard, MessageActionButton } from "./support"
import { newLayout } from "./tool-info"

function UserMessageComments(props: { comments: UserMessageComment[]; bounded: boolean }) {
  const i18n = useI18n()
  const [state, setState] = createStore({ expanded: false })
  const comments = createMemo(() => (props.bounded && !state.expanded ? props.comments.slice(0, 5) : props.comments))

  return (
    <div data-slot="user-message-comments" data-bounded={props.bounded ? "true" : undefined}>
      <For each={comments()}>
        {(comment) => (
          <CommentCardV2
            comment={comment.comment}
            path={comment.path}
            selection={comment.selection}
            title={comment.comment}
            tooltip
            wide
          />
        )}
      </For>
      <Show when={props.bounded && props.comments.length > 5 && !state.expanded}>
        <ButtonV2 size="small" variant="ghost-muted" onClick={() => setState("expanded", true)}>
          {i18n.t("ui.common.showMore")}
        </ButtonV2>
      </Show>
    </div>
  )
}

export function UserMessageDisplay(props: {
  message: UserMessage
  parts: PartType[]
  actions?: UserActions
  useV2Actions?: boolean
  comments?: UserMessageComment[]
}) {
  const data = useData()
  const dialog = useDialog()
  const i18n = useI18n()
  const [state, setState] = createStore({
    copied: false,
    busy: false,
  })
  const copied = () => state.copied
  const busy = () => state.busy

  const textPart = createMemo(
    () => props.parts?.find((p) => p.type === "text" && !(p as TextPart).synthetic) as TextPart | undefined,
  )

  const text = createMemo(() => textPart()?.text || "")

  const files = createMemo(() => (props.parts?.filter((p) => p.type === "file") as FilePart[]) ?? [])

  const attachments = createMemo(() => files().filter(attached))

  const messageComments = createMemo(() => (newLayout() ? (props.comments ?? []) : []))

  const inlineFiles = createMemo(() => files().filter(inline))

  const agents = createMemo(() => (props.parts?.filter((p) => p.type === "agent") as AgentPart[]) ?? [])

  const model = createMemo(() => {
    const providerID = props.message.model?.providerID
    const modelID = props.message.model?.modelID
    if (!providerID || !modelID) return ""
    const match = data.store.provider?.all?.get(providerID)
    return match?.models?.[modelID]?.name ?? modelID
  })
  const timefmt = createMemo(() => new Intl.DateTimeFormat(i18n.locale(), { timeStyle: "short" }))

  const stamp = createMemo(() => {
    const created = props.message.time?.created
    if (typeof created !== "number") return ""
    return timefmt().format(created)
  })

  const metaHead = createMemo(() => {
    const agent = props.message.agent
    const items = [agent ? agent[0]?.toUpperCase() + agent.slice(1) : "", model()]
    return items.filter((x) => !!x).join("\u00A0\u00B7\u00A0")
  })

  const metaTail = stamp

  const openImagePreview = (url: string, alt?: string) => {
    dialog.show(() => <ImagePreview src={url} alt={alt} />)
  }

  const handleCopy = async () => {
    const content = text()
    if (!content) return
    if (await writeClipboard(content)) {
      setState("copied", true)
      setTimeout(() => setState("copied", false), 2000)
    }
  }

  const revert = () => {
    const act = props.actions?.revert
    if (!act || busy()) return
    setState("busy", true)
    void Promise.resolve()
      .then(() =>
        act({
          sessionID: props.message.sessionID,
          messageID: props.message.id,
        }),
      )
      .finally(() => setState("busy", false))
  }

  const renderAttachments = () => (
    <Show when={attachments().length > 0}>
      <div data-slot="user-message-attachments">
        <For each={attachments()}>
          {(file) => {
            const type = kind(file)
            const name = file.filename ?? i18n.t("ui.message.attachment.alt")

            return (
              <Show
                when={newLayout() && type === "file"}
                fallback={
                  <div
                    data-slot="user-message-attachment"
                    data-type={type}
                    data-clickable={type === "image" ? "true" : undefined}
                    title={type === "file" ? name : undefined}
                    onClick={() => {
                      if (type === "image") openImagePreview(file.url, name)
                    }}
                  >
                    <Show
                      when={type === "image"}
                      fallback={
                        <div data-slot="user-message-attachment-file">
                          <FileIcon node={{ path: name, type: "file" }} />
                          <span data-slot="user-message-attachment-name">{name}</span>
                        </div>
                      }
                    >
                      <img data-slot="user-message-attachment-image" src={file.url} alt={name} />
                    </Show>
                  </div>
                }
              >
                <AttachmentCardV2
                  title={getFilename(name)}
                  hover={name}
                  clickable={!!props.actions?.openAttachment}
                  onClick={() => props.actions?.openAttachment?.(file)}
                >
                  {typeLabel(name, file.mime, i18n.t("ui.common.file"))}
                </AttachmentCardV2>
              </Show>
            )
          }}
        </For>
      </div>
    </Show>
  )

  return (
    <div data-component="user-message" data-timeline-part-id={textPart()?.id}>
      <Show when={!props.useV2Actions}>{renderAttachments()}</Show>
      <Show
        when={text()}
        fallback={
          <Show when={messageComments().length > 0}>
            <UserMessageComments comments={messageComments()} bounded={false} />
          </Show>
        }
      >
        <div data-slot="user-message-body">
          <div
            data-slot="user-message-text"
            dir="auto"
            data-comments={messageComments().length > 0 ? "true" : undefined}
          >
            <HighlightedText text={text()} references={inlineFiles()} agents={agents()} />
            <Show when={messageComments().length > 0}>
              <UserMessageComments comments={messageComments()} bounded />
            </Show>
          </div>
        </div>
      </Show>
      <Show when={props.useV2Actions}>{renderAttachments()}</Show>
      <Show when={text() || (props.useV2Actions && messageComments().length > 0)}>
        <div data-slot="user-message-copy-wrapper">
          <Show when={metaHead() || metaTail()}>
            <span data-slot="user-message-meta-wrap">
              <Show when={metaHead()}>
                <span data-slot="user-message-meta" class="text-12-regular text-text-weak cursor-default">
                  {metaHead()}
                </span>
              </Show>
              <Show when={metaHead() && metaTail()}>
                <span data-slot="user-message-meta-sep" class="text-12-regular text-text-weak cursor-default">
                  {"\u00A0\u00B7\u00A0"}
                </span>
              </Show>
              <Show when={metaTail()}>
                <span data-slot="user-message-meta-tail" class="text-12-regular text-text-weak cursor-default">
                  {metaTail()}
                </span>
              </Show>
            </span>
          </Show>
          <Show when={props.actions?.revert}>
            <MessageActionButton
              icon="reset"
              label={i18n.t("ui.message.revertMessage")}
              useV2={props.useV2Actions}
              disabled={!!busy()}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation()
                revert()
              }}
              aria-label={i18n.t("ui.message.revertMessage")}
            />
          </Show>
          <Show when={text()}>
            <MessageActionButton
              icon={copied() ? "check" : "copy"}
              label={copied() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copyMessage")}
              useV2={props.useV2Actions}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation()
                void handleCopy()
              }}
              aria-label={copied() ? i18n.t("ui.message.copied") : i18n.t("ui.message.copyMessage")}
            />
          </Show>
        </div>
      </Show>
    </div>
  )
}

type HighlightSegment = { text: string; type?: "file" | "agent" }

function HighlightedText(props: { text: string; references: FilePart[]; agents: AgentPart[] }) {
  const segments = createMemo(() => {
    const text = props.text

    const allRefs: { start: number; end: number; type: "file" | "agent" }[] = [
      ...props.references
        .filter((r) => r.source?.text?.start !== undefined && r.source?.text?.end !== undefined)
        .map((r) => ({ start: r.source!.text!.start, end: r.source!.text!.end, type: "file" as const })),
      ...props.agents
        .filter((a) => a.source?.start !== undefined && a.source?.end !== undefined)
        .map((a) => ({ start: a.source!.start, end: a.source!.end, type: "agent" as const })),
    ].sort((a, b) => a.start - b.start)

    const result: HighlightSegment[] = []
    let lastIndex = 0

    for (const ref of allRefs) {
      if (ref.start < lastIndex) continue

      if (ref.start > lastIndex) {
        result.push({ text: text.slice(lastIndex, ref.start) })
      }

      result.push({ text: text.slice(ref.start, ref.end), type: ref.type })
      lastIndex = ref.end
    }

    if (lastIndex < text.length) {
      result.push({ text: text.slice(lastIndex) })
    }

    return result
  })

  return <For each={segments()}>{(segment) => <span data-highlight={segment.type}>{segment.text}</span>}</For>
}
