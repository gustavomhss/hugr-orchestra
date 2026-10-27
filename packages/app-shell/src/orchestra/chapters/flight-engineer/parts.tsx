import { For, type JSX } from "solid-js"
import { keycaps } from "./model"

export const mac = typeof navigator === "object" && /Mac/i.test(navigator.platform)

// An accelerator as key caps, in the same <kbd> style the overlay uses.
export function Keys(props: { accelerator: string }) {
  return (
    <span class="fe-keys">
      <For each={keycaps(props.accelerator, mac)}>{(cap) => <kbd>{cap}</kbd>}</For>
    </span>
  )
}

const paths = {
  microphone: '<rect x="6" y="1.8" width="4" height="7.4" rx="2"/><path d="M3.5 7.5a4.5 4.5 0 009 0M8 12v2.2"/>',
  speaker: '<path d="M2.5 6.2h2.4L8 3.5v9L4.9 9.8H2.5z"/><path d="M10.5 5.6a3.4 3.4 0 010 4.8M12.2 3.8a6 6 0 010 8.4"/>',
  key: '<circle cx="5.2" cy="8" r="2.6"/><path d="M7.8 8h5.7M11.5 8v2.2"/>',
  model: '<path d="M8 1.8l1.5 3.7 3.7 1.5-3.7 1.5L8 12.2 6.5 8.5 2.8 7l3.7-1.5z"/>',
  shield: '<path d="M8 1.8l5 2v4c0 3-2.2 5-5 6.2-2.8-1.2-5-3.2-5-6.2v-4z"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  search: '<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2L13.5 13.5"/>',
  back: '<path d="M9.5 3.5L5 8l4.5 4.5"/>',
} as const

export function Glyph(props: { name: keyof typeof paths }) {
  return (
    <svg
      class="fe-glyph"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      innerHTML={paths[props.name]}
    />
  )
}

// A level meter: scaleX keeps the 15 Hz updates off the layout path.
export function Meter(props: { label: string; level: number; detail?: string }) {
  return (
    <div class="fe-meter">
      <div class="fe-meter-head">
        <strong>{props.label}</strong>
        <small>{props.detail}</small>
      </div>
      <div class="fe-meter-track" aria-hidden="true">
        <i style={{ transform: `scaleX(${Math.min(1, Math.max(0.02, props.level))})` }} />
      </div>
    </div>
  )
}

export function Note(props: { tone?: "bad"; children: JSX.Element }) {
  return (
    <p class="fe-note" data-tone={props.tone} role={props.tone === "bad" ? "alert" : "status"}>
      {props.children}
    </p>
  )
}
