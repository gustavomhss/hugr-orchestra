import { render } from "solid-js/web"
import { CometSplash } from "./splash/comet-splash"

// The splash renders from this small entry so it paints at once. The app bundle is several MB and compiling it holds
// the main thread for seconds, so it starts only after the splash's first frame is on screen. A hidden or minimized
// window never runs animation frames, so a timer starts the app there.
render(() => <CometSplash />, document.getElementById("splash")!)
void new Promise((start) => {
  requestAnimationFrame(() => setTimeout(start))
  setTimeout(start, 200)
}).then(() => import("./index"))
