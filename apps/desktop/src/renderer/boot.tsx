import { render } from "solid-js/web"
import { CometSplash } from "./splash/comet-splash"

// The splash renders from this small entry so it paints at once. The app bundle is several MB and compiling it holds
// the main thread for seconds, so it starts only after the splash's first frame is on screen.
render(() => <CometSplash />, document.getElementById("splash")!)
requestAnimationFrame(() => setTimeout(() => void import("./index")))
