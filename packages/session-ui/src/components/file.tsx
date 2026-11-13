import { FileMedia } from "./file-media"
import type { FileProps } from "./file/types"
import { DiffViewer } from "./file/diff"
import { TextViewer } from "./file/text"

export type { DiffFileProps, FileProps, FileSearchControl, FileSearchHandle, TextFileProps } from "./file/types"

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function File<T>(props: FileProps<T>) {
  if (props.mode === "text") {
    return <FileMedia media={props.media} fallback={() => TextViewer(props)} />
  }

  return <FileMedia media={props.media} fallback={() => DiffViewer(props)} />
}
