import { Ic } from "./ui"

// The add button in the top right and the view controls in the bottom left: fit, zoom, the zoom level and the keys.
export function CanvasControls(props: {
  add: string
  fit: string
  zoomIn: string
  zoomOut: string
  keys: string
  zoom: number
  onAdd: () => void
  onFit: () => void
  onZoom: (factor: number) => void
  onKeys: () => void
}) {
  return (
    <>
      <div class="wf-rail">
        <button
          type="button"
          class="mx-btn icon"
          aria-label={props.add}
          title={props.add}
          onClick={() => props.onAdd()}
        >
          <Ic name="plus" />
        </button>
      </div>
      <div class="wf-controls">
        <button
          type="button"
          class="mx-btn icon"
          aria-label={props.fit}
          title={props.fit}
          onClick={() => props.onFit()}
        >
          <Ic name="fit" />
        </button>
        <button
          type="button"
          class="mx-btn icon"
          aria-label={props.zoomIn}
          title={props.zoomIn}
          onClick={() => props.onZoom(1.2)}
        >
          <Ic name="zoomIn" />
        </button>
        <button
          type="button"
          class="mx-btn icon"
          aria-label={props.zoomOut}
          title={props.zoomOut}
          onClick={() => props.onZoom(1 / 1.2)}
        >
          <Ic name="zoomOut" />
        </button>
        <span class="mx-btn wf-zoom" aria-live="polite">
          {Math.round(props.zoom * 100)}%
        </span>
        <button
          type="button"
          class="mx-btn icon"
          aria-label={props.keys}
          title={props.keys}
          onClick={() => props.onKeys()}
        >
          <Ic name="keys" />
        </button>
      </div>
    </>
  )
}
