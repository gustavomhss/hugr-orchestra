import { type Component, onCleanup, Show } from "solid-js"
import { Dynamic } from "solid-js/web"
import { HotsetSheet, RepublishSheet, RespawnSheet, RuleSheet, TerritorySheet, VerifySheet } from "./more-sheets"
import { MineSheet, ProducersSheet, PromoteAllSheet, PromoteResultSheet, ReconcileSheet } from "./review-sheets"
import { AddFactSheet, ClassifySheet, EditSheet, LinkSheet, RatifySheet } from "./fact-sheets"
import { type AtlasSheet, type AtlasSheetKind, type AtlasSheetProps, atlasSheetState, closeAtlasSheet, resetAtlasSheets } from "./state"

// Each sheet task adds its own line here: `<kind>: <Component>,` with the component imported from its file.
// A kind without a line opens nothing.
export const atlasSheets: { [K in AtlasSheetKind]?: Component<AtlasSheetProps<K>> } = {
  verify: VerifySheet,
  hotset: HotsetSheet,
  republish: RepublishSheet,
  respawn: RespawnSheet,
  rule: RuleSheet,
  territory: TerritorySheet,
  "promote-all": PromoteAllSheet,
  "promote-result": PromoteResultSheet,
  reconcile: ReconcileSheet,
  mine: MineSheet,
  producers: ProducersSheet,
  ratify: RatifySheet,
  edit: EditSheet,
  classify: ClassifySheet,
  link: LinkSheet,
  "add-fact": AddFactSheet,
}

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
