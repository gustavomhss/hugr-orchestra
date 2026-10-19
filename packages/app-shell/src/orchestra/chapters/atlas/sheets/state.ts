import { createStore } from "solid-js/store"
import type { AtlasMemberId } from "../atlas-model"
import type { AtlasOutput } from "../atlas-types"

// Every sheet (dialog) a view can open, by kind, with what it needs. One sheet shows at a time for the whole
// chapter, like the mock's single #dialog; AtlasSheetHost (host.tsx) renders it.
export type AtlasSheet =
  | { kind: "ratify"; key: string }
  | { kind: "edit"; key: string }
  | { kind: "classify"; key: string }
  | { kind: "link"; key: string }
  | { kind: "add-fact"; path: string }
  | { kind: "verify"; scope: string }
  | { kind: "promote-all" }
  | { kind: "promote-result" }
  | { kind: "reconcile" }
  | { kind: "mine" }
  | { kind: "producers" }
  | { kind: "hotset" }
  | { kind: "republish" }
  | { kind: "respawn"; member: AtlasMemberId; unit: string }
  | { kind: "rule"; member: AtlasMemberId; lesson: string; unit: string }
  | { kind: "territory"; unit: string }
export type AtlasSheetKind = AtlasSheet["kind"]
export type AtlasSheetProps<K extends AtlasSheetKind> = { sheet: Extract<AtlasSheet, { kind: K }>; onClose: () => void }
export type AtlasPromoteResult = Exclude<AtlasOutput<"promote">, { state: "empty" }>
// The last `atlas promote` run (the mock's A.state.promote): Review shows its counts and each row's outcome.
// `staged` holds the keys that were staged candidates before the run.
export type AtlasPromoteRecord = { run: AtlasPromoteResult; staged: string[] }

const [state, setState] = createStore<{ sheet?: AtlasSheet; promote?: AtlasPromoteRecord }>({})

export const atlasSheetState = state
export const openAtlasSheet = (sheet: AtlasSheet) => setState("sheet", sheet)
export const closeAtlasSheet = () => setState("sheet", undefined)
export const keepPromoteRun = (record: AtlasPromoteRecord) => setState("promote", record)
export const resetAtlasSheets = () => setState({ sheet: undefined, promote: undefined })
