import { createSignal, onCleanup, onMount, Show } from "solid-js"
import video from "./comet.mp4"
import still from "./comet-still.jpg"
import "./comet-splash.css"

// The opening animation: a comet strikes the plate, the HuGR symbol forms, the wordmark slams in under it and a light
// sweeps across. It is one pre-rendered video because the media pipeline keeps playing while the app bundle compiles
// and mounts on the main thread; DOM-driven stages froze there. It covers whatever is still loading underneath, plays
// only in the windows that open with the app (the main process marks them `?splash`) and then fades out; a click or a
// key skips it. Under reduced motion it shows the video's final frame instead: the mark stays, the motion goes.
export function CometSplash() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
  const [stage, setStage] = createSignal(new URLSearchParams(location.search).has("splash") ? "playing" : "gone")
  const timers: ReturnType<typeof setTimeout>[] = []
  const later = (ms: number, run: () => void) => timers.push(setTimeout(run, ms))

  const leave = () => {
    if (stage() !== "playing") return
    setStage("leaving")
    later(340, () => setStage("gone"))
  }

  onMount(() => {
    if (stage() !== "playing") return
    // The still holds briefly; a video that stalls must never trap the user behind the splash.
    later(reduced ? 1600 : 8000, leave)
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
        <Show when={!reduced} fallback={<img src={still} alt="" onError={leave} />}>
          <video src={video} muted playsinline autoplay onEnded={leave} onError={leave} />
        </Show>
      </div>
    </Show>
  )
}
