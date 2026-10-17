import { createMemo, Show, type Component, type JSX } from "solid-js"
import { Dynamic } from "solid-js/web"
import { useFileComponent } from "@orchestra/ui/context/file"
import { useI18n } from "@orchestra/ui/context/i18n"
import { DiffChanges } from "@orchestra/ui/diff-changes"
import { TextShimmer } from "@orchestra/ui/text-shimmer"
import { getFilename } from "@orchestra/core/util/path"
import { BasicTool } from "../basic-tool"
import { resolveFileDiff } from "../session-diff"
import type { ToolProps } from "../message-part"

// Shared tool chrome stays with the registry; Edit owns its projection and staged-review rendering.
export function createEditTool(support: {
  directory: (path: string | undefined) => string
  FileAccordion: Component<{ path: string; actions?: JSX.Element; children: JSX.Element }>
  Diagnostics: Component<ToolProps>
}) {
  return function EditTool(props: ToolProps) {
    const i18n = useI18n()
    const fileComponent = useFileComponent()
    const path = createMemo(() => props.metadata?.filediff?.file || props.input.filePath || "")
    const filename = () => getFilename(props.input.filePath ?? "")
    const pending = () => props.status === "pending" || props.status === "running"
    const staged = () => props.metadata.staged === true
    const diffSource = createMemo(
      () => {
        if (staged()) return
        const filediff = props.metadata?.filediff
        if (!filediff) return
        return {
          file: filediff.file || props.input.filePath || "",
          patch: typeof filediff.patch === "string" ? filediff.patch : undefined,
          before: typeof filediff.before === "string" ? filediff.before : undefined,
          after: typeof filediff.after === "string" ? filediff.after : undefined,
        }
      },
      undefined,
      {
        equals: (a, b) =>
          a?.file === b?.file && a?.patch === b?.patch && a?.before === b?.before && a?.after === b?.after,
      },
    )

    const fileCompProps = createMemo(() => {
      if (staged()) return
      try {
        const source = diffSource()
        if (source) {
          const fileDiff = resolveFileDiff(source)
          if (fileDiff) return { fileDiff, hunkSeparators: fileDiff.isPartial ? "simple" : "line-info-basic" }
        }
      } catch {}

      return {
        before: {
          name: props.metadata?.filediff?.file || props.input.filePath,
          contents: props.metadata?.filediff?.before || props.input.oldString || "",
        },
        after: {
          name: props.metadata?.filediff?.file || props.input.filePath,
          contents: props.metadata?.filediff?.after || props.input.newString || "",
        },
      }
    })

    return (
      <div data-component="edit-tool">
        <BasicTool
          {...props}
          icon="code-lines"
          defer={props.deferContent !== false}
          trigger={
            <div data-component="edit-trigger">
              <div data-slot="message-part-title-area">
                <div data-slot="message-part-title">
                  <span data-slot="message-part-title-text">
                    <TextShimmer text={i18n.t("ui.messagePart.title.edit")} active={pending()} />
                  </span>
                  <Show when={!pending()}>
                    <span data-slot="message-part-title-filename">{filename()}</span>
                  </Show>
                </div>
                <Show when={!pending() && props.input.filePath?.includes("/")}>
                  <div data-slot="message-part-path">
                    <span data-slot="message-part-directory">{support.directory(props.input.filePath!)}</span>
                  </div>
                </Show>
              </div>
              <div data-slot="message-part-actions">
                <Show when={staged()}>
                  <span data-slot="basic-tool-tool-subtitle">{i18n.t("ui.messagePart.edit.awaitingReview")}</span>
                </Show>
                <Show when={!staged() && !pending() && props.metadata.filediff}>
                  <DiffChanges changes={props.metadata.filediff} />
                </Show>
              </div>
            </div>
          }
        >
          <Show when={!staged() && path()}>
            <support.FileAccordion
              path={path()}
              actions={
                <Show when={!staged() && !pending() && props.metadata.filediff}>
                  <DiffChanges changes={props.metadata.filediff!} />
                </Show>
              }
            >
              <div data-component="edit-content">
                <Dynamic
                  component={fileComponent}
                  mode="diff"
                  virtualize={props.virtualizeDiff}
                  onRendered={props.onContentRendered}
                  {...fileCompProps()}
                />
              </div>
            </support.FileAccordion>
          </Show>
          <Show when={!staged()}>
            <support.Diagnostics {...props} />
          </Show>
        </BasicTool>
      </div>
    )
  }
}
