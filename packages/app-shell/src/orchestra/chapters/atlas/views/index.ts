import { lazy } from "solid-js"
import type { Component } from "solid-js"
import type { AtlasModel } from "../atlas-model"
import type { AtlasRoute, AtlasViewId } from "../atlas-route"

export type AtlasViewProps = { route: AtlasRoute; model: AtlasModel }
export type AtlasInspectorProps = AtlasViewProps & { factKey: string }

// Each view task adds its own line here: `<view>: lazy(() => import("./<view>")),` (views/<view>.tsx default-exports
// a Component<AtlasViewProps>). A view without a line shows the frame's "not built yet" note.
export const atlasViews: Partial<Record<AtlasViewId, Component<AtlasViewProps>>> = {
  overview: lazy(() => import("./overview")),
}

// The fact inspector beside the list views (task A24 replaces `undefined` with lazy(() => import("./inspector"))).
export const atlasInspector: Component<AtlasInspectorProps> | undefined = undefined
