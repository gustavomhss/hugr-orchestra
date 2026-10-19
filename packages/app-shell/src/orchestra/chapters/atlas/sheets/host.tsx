import { type Component, onCleanup, Show } from "solid-js"
import { Dynamic } from "solid-js/web"
import { type AtlasSheet, type AtlasSheetKind, type AtlasSheetProps, atlasSheetState, closeAtlasSheet, resetAtlasSheets } from "./state"

// Each sheet task adds its own line here: `<kind>: <Component>,` with the component imported from its file.
// A kind without a line opens nothing.
export const atlasSheets: { [K in AtlasSheetKind]?: Component<AtlasSheetProps<K>> } = {}

// Mounted once by the chapter frame. `keyed` remounts the dialog when one sheet replaces another, so each opens
// with showModal and its own fresh state.
export function AtlasSheetHost() {
  onCleanup(() => resetAtlasSheets())
  return (
    <Show when={atlasSheetState.sheet} keyed>
      {(sheet) => (
        <Show when={atlasSheets[sheet.kind] as Component<{ sheet: AtlasSheet; onClose: () => void }> | undefined}>
          {(view) => <Dynamic component={view()} sheet={sheet} onClose={closeAtlasSheet} />}
        </Show>
      )}
    </Show>
  )
}
