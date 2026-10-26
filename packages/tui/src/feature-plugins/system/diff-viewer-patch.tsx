/** @jsxImportSource @opentui/solid */
import type { BorderSides, BoxRenderable, DiffRenderable } from "@opentui/core"
import type { TuiPluginApi } from "@orchestra/plugin/tui"
import { Show } from "solid-js"
import type { useTheme } from "../../context/theme"
import { Separator } from "./diff-viewer-ui"
import { filetype, type DiffFile, type DiffView } from "./diff-viewer-model"

export const PLAIN_TEXT_FILETYPE = "orchestra-plain-text"

export function DiffViewerPatch(props: {
  readonly entry: { readonly file: DiffFile; readonly fileIndex: number }
  readonly index: number
  readonly reviewed: boolean
  readonly showFileTree: boolean
  readonly leftBorder: BorderSides[]
  readonly theme: TuiPluginApi["theme"]["current"]
  readonly syntax: ReturnType<ReturnType<typeof useTheme>["syntax"]>
  readonly view: DiffView
  readonly registerNode: (fileIndex: number, element: BoxRenderable) => void
  readonly registerDiff: (fileIndex: number, element: DiffRenderable) => void
}) {
  const theme = () => props.theme
  const reviewed = () => props.reviewed
  return (
    <box ref={(element: BoxRenderable) => props.registerNode(props.entry.fileIndex, element)}>
      {props.index !== 0 ? <Separator axis="x" start={props.showFileTree ? "edge" : undefined} /> : null}
      <box
        flexDirection="row"
        gap={1}
        flexShrink={0}
        paddingLeft={1}
        paddingRight={1}
        border={props.leftBorder}
        borderColor={theme().border}
      >
        <text fg={reviewed() ? theme().textMuted : theme().text}>{props.entry.file.file}</text>
        <box flexGrow={1} />
        <text fg={reviewed() ? theme().textMuted : theme().diffAdded}>
          +{props.entry.file.additions}
        </text>
        <text fg={reviewed() ? theme().textMuted : theme().diffRemoved}>
          -{props.entry.file.deletions}
        </text>
      </box>
      <Separator axis="x" start={props.showFileTree ? "edge" : undefined} />
      <Show
        when={props.entry.file.patch}
        fallback={<text fg={theme().textMuted}>No patch available for this file.</text>}
      >
        {(patch) => (
          <box border={props.leftBorder} borderColor={theme().border}>
            <diff
              ref={(element: DiffRenderable) => props.registerDiff(props.entry.fileIndex, element)}
              diff={patch()}
              view={props.view}
              filetype={reviewed() ? PLAIN_TEXT_FILETYPE : filetype(props.entry.file.file)}
              syntaxStyle={props.syntax}
              showLineNumbers={true}
              width="100%"
              wrapMode="char"
              fg={reviewed() ? theme().textMuted : theme().text}
              addedBg={reviewed() ? theme().backgroundElement : theme().diffAddedBg}
              removedBg={reviewed() ? theme().backgroundElement : theme().diffRemovedBg}
              addedSignColor={reviewed() ? theme().textMuted : theme().diffHighlightAdded}
              removedSignColor={reviewed() ? theme().textMuted : theme().diffHighlightRemoved}
              lineNumberFg={theme().diffLineNumber}
              addedLineNumberBg={
                reviewed() ? theme().backgroundElement : theme().diffAddedLineNumberBg
              }
              removedLineNumberBg={
                reviewed() ? theme().backgroundElement : theme().diffRemovedLineNumberBg
              }
            />
          </box>
        )}
      </Show>
    </box>
  )
}
