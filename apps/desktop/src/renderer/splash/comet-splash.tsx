import { createSignal, onCleanup, onMount, Show } from "solid-js"
import video from "./comet.mp4"
import "./comet-splash.css"

// The opening animation: a comet strikes the plate, the HuGR symbol forms, the wordmark slams in under it and a light
// sweeps across. It is one pre-rendered video because the media pipeline keeps playing while the app bundle compiles
// and mounts on the main thread; DOM-driven stages froze there. It covers whatever is still loading underneath, plays
// only in the windows that open with the app (the main process marks them `?splash`) and then fades out; a click or a
// key skips it, and reduced motion never shows it.
export function CometSplash() {
  const [stage, setStage] = createSignal(
    new URLSearchParams(location.search).has("splash") && !matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "playing"
      : "gone",
  )
  const timers: ReturnType<typeof setTimeout>[] = []
  const later = (ms: number, run: () => void) => timers.push(setTimeout(run, ms))

  const leave = () => {
    if (stage() !== "playing") return
    setStage("leaving")
    later(340, () => setStage("gone"))
  }

  onMount(() => {
    if (stage() !== "playing") return
    // A video that stalls must never trap the user behind the splash.
    later(8000, leave)
    // Keys would otherwise reach the app's focused field unseen behind the splash.
    window.addEventListener("keydown", leave, { once: true })
  })
  onCleanup(() => {
    timers.forEach(clearTimeout)
    window.removeEventListener("keydown", leave)
  })

  return (
    <Show when={stage() !== "gone"}>
      <div class="comet-splash" data-stage={stage()} onClick={leave} aria-hidden="true">
        <video src={video} muted playsinline autoplay onEnded={leave} onError={leave} />
      </div>
    </Show>
  )
}
