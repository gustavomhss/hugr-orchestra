import { createSignal, onCleanup, onMount, Show } from "solid-js"
import video from "./comet.mp4"
import still from "./comet-still.jpg"
import "./comet-splash.css"

// The opening animation: a comet strikes the plate, the HuGR symbol forms, the wordmark slams in under it and a light
// sweeps across. It is one pre-rendered video because the media pipeline keeps playing while the app bundle compiles
// and mounts on the main thread; DOM-driven stages froze there. It covers whatever is still loading underneath, plays
// only in the windows that open with the app (the main process marks them `?splash`), holds its last frame until the
// app has mounted and then fades out; a click or a key skips it. Under reduced motion it shows the video's final frame
// instead: the mark stays, the motion goes.
export function CometSplash() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
  const [stage, setStage] = createSignal(new URLSearchParams(location.search).has("splash") ? "playing" : "gone")
  const [played, setPlayed] = createSignal(false)
  const [mounted, setMounted] = createSignal(false)
  const timers: ReturnType<typeof setTimeout>[] = []
  const later = (ms: number, run: () => void) => timers.push(setTimeout(run, ms))
  const root = document.getElementById("root")!
  // The app's loading screens carry `data-app-loading`; once the root holds anything else, the app is on screen.
  const observer = new MutationObserver(() => {
    if (root.childElementCount === 0 || root.querySelector("[data-app-loading]")) return
    observer.disconnect()
    setMounted(true)
    if (played()) leave()
  })

  const leave = () => {
    if (stage() !== "playing") return
    setStage("leaving")
    observer.disconnect()
    later(340, () => setStage("gone"))
  }
  const finish = () => {
    setPlayed(true)
    if (mounted()) leave()
  }

  onMount(() => {
    if (stage() !== "playing") return
    observer.observe(root, { childList: true, subtree: true })
    // The still holds briefly; a video that stalls counts as played, so only the app's own loading keeps the splash.
    later(reduced ? 1600 : 8000, finish)
    // Keys would otherwise reach the app's focused field unseen behind the splash.
    window.addEventListener("keydown", leave, { once: true })
  })
  onCleanup(() => {
    timers.forEach(clearTimeout)
    observer.disconnect()
    window.removeEventListener("keydown", leave)
  })

  return (
    <Show when={stage() !== "gone"}>
      <div class="comet-splash" data-stage={stage()} onClick={leave} aria-hidden="true">
        <Show when={!reduced} fallback={<img src={still} alt="" onError={finish} />}>
          <video src={video} muted playsinline autoplay onEnded={finish} onError={finish} />
        </Show>
      </div>
    </Show>
  )
}
