import { createSignal, For, onCleanup, onMount, Show } from "solid-js"
import video from "./comet.mp4"
import font from "./michroma-wordmark.woff2"
import "./comet-splash.css"

const WORD = "HUMAN GUARDRAIL"
// Subset of Michroma (SIL OFL, see michroma-OFL.txt) holding only the wordmark's glyphs.
const FAMILY = "HuGR Wordmark"
const TEXT = { "font-family": FAMILY, "font-size": "66", "letter-spacing": "7", x: "600", y: "98", "text-anchor": "middle" } as const

// The opening animation: a comet strikes the plate and the HuGR symbol forms, then the wordmark slams in under it
// and a light sweeps across. It covers whatever is still loading underneath, plays once per window load and then
// fades out; a click skips it, and reduced motion never shows it.
export function CometSplash() {
  const [stage, setStage] = createSignal(
    matchMedia("(prefers-reduced-motion: reduce)").matches ? "gone" : "playing",
  )
  const [letters, setLetters] = createSignal<{ char: string; x: number; y: number; delay: number }[]>([])
  const timers: ReturnType<typeof setTimeout>[] = []
  const later = (ms: number, run: () => void) => timers.push(setTimeout(run, ms))
  const face = new FontFace(FAMILY, `url(${font})`)
  const loaded = face.load().then(() => document.fonts.add(face))
  let measure: SVGTextElement | undefined
  let sweep: SVGAnimateTransformElement | undefined

  const leave = () => {
    if (stage() === "leaving" || stage() === "gone") return
    setStage("leaving")
    later(340, () => setStage("gone"))
  }

  const settle = () =>
    loaded.then(() => {
      if (stage() !== "playing") return
      setStage("settled")
      later(860, () => sweep?.beginElement())
      later(1700, leave)
    }, leave)

  onMount(() => {
    if (stage() === "gone") return
    // A video that stalls must never trap the user behind the splash.
    later(6000, leave)
    // Each glyph becomes its own element so the letters can animate apart, at the place the whole word puts it.
    void loaded.then(() => {
      const word = measure
      if (!word) return
      const mid = (WORD.length - 1) / 2
      setLetters(
        [...WORD].flatMap((char, i) => {
          if (char === " ") return []
          const point = word.getStartPositionOfChar(i)
          return [{ char, x: point.x, y: point.y, delay: 220 + Math.abs(i - mid) * 34 }]
        }),
      )
    })
  })
  onCleanup(() => timers.forEach(clearTimeout))

  return (
    <Show when={stage() !== "gone"}>
      <div class="comet-splash" data-stage={stage()} onClick={leave} aria-hidden="true">
        <div class="comet-splash-stage">
          <video src={video} muted playsinline autoplay onEnded={settle} onError={leave} />
          <div class="comet-splash-word">
            <svg viewBox="0 0 1200 130">
              <defs>
                {/* Chrome: bright sky on top, a dark horizon line, icy blue ground below, like the frame. */}
                <linearGradient id="comet-splash-chrome" x1="0" y1="30" x2="0" y2="100" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stop-color="#d6e5f6" />
                  <stop offset=".38" stop-color="#b3c8e0" />
                  <stop offset=".5" stop-color="#7f98b6" />
                  <stop offset=".53" stop-color="#bcd2ea" />
                  <stop offset=".8" stop-color="#a9c3df" />
                  <stop offset="1" stop-color="#84a4ca" />
                </linearGradient>
                <linearGradient id="comet-splash-rim" x1="0" y1="30" x2="0" y2="100" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stop-color="#ffffff" />
                  <stop offset="1" stop-color="#5d86b8" />
                </linearGradient>
                {/* Light band painted on a copy of the word; SMIL slides it right to left (CSS cannot move a gradient). */}
                <linearGradient
                  id="comet-splash-shine"
                  gradientUnits="userSpaceOnUse"
                  x1="0"
                  y1="0"
                  x2="160"
                  y2="0"
                  gradientTransform="skewX(-20) translate(1400)"
                >
                  <stop offset="0" stop-color="#fff" stop-opacity="0" />
                  <stop offset=".3" stop-color="#eaf4ff" stop-opacity=".35" />
                  <stop offset=".46" stop-color="#fff" stop-opacity=".95" />
                  <stop offset=".54" stop-color="#fff" stop-opacity=".95" />
                  <stop offset=".7" stop-color="#eaf4ff" stop-opacity=".35" />
                  <stop offset="1" stop-color="#fff" stop-opacity="0" />
                  <animateTransform
                    ref={sweep}
                    attributeName="gradientTransform"
                    type="translate"
                    additive="sum"
                    from="0"
                    to="-1700"
                    dur="620ms"
                    begin="indefinite"
                    fill="freeze"
                    calcMode="spline"
                    keyTimes="0;1"
                    keySplines=".45 0 .25 1"
                  />
                </linearGradient>
                <linearGradient id="comet-splash-seam" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stop-color="#adc9e7" stop-opacity="0" />
                  <stop offset=".5" stop-color="#fff" />
                  <stop offset="1" stop-color="#adc9e7" stop-opacity="0" />
                </linearGradient>
                <filter id="comet-splash-bloom" x="-5%" y="-60%" width="110%" height="220%">
                  <feGaussianBlur stdDeviation="7" />
                </filter>
                <filter id="comet-splash-bevel" x="-5%" y="-40%" width="110%" height="180%">
                  <feGaussianBlur in="SourceAlpha" stdDeviation="1.4" result="b" />
                  <feSpecularLighting
                    in="b"
                    surfaceScale="4"
                    specularConstant=".9"
                    specularExponent="28"
                    lighting-color="#ffffff"
                    result="s"
                  >
                    <feDistantLight azimuth="235" elevation="38" />
                  </feSpecularLighting>
                  <feComposite in="s" in2="SourceAlpha" operator="in" result="sp" />
                  <feComposite in="SourceGraphic" in2="sp" operator="arithmetic" k2="1" k3=".75" result="lit" />
                  <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000814" flood-opacity=".8" />
                </filter>
              </defs>
              <g class="comet-splash-flare">
                <rect x="40" y="58" width="1120" height="16" fill="url(#comet-splash-seam)" filter="url(#comet-splash-bloom)" />
                <rect x="140" y="64.5" width="920" height="3" fill="url(#comet-splash-seam)" />
              </g>
              <text ref={measure} {...TEXT} visibility="hidden">
                {WORD}
              </text>
              <g filter="url(#comet-splash-bevel)">
                <For each={letters()}>
                  {(letter) => (
                    <text
                      class="comet-splash-letter"
                      style={{ "--delay": `${letter.delay}ms` }}
                      x={letter.x}
                      y={letter.y}
                      font-family={FAMILY}
                      font-size="66"
                      fill="url(#comet-splash-chrome)"
                      stroke="url(#comet-splash-rim)"
                      stroke-width="2.2"
                      paint-order="stroke"
                    >
                      {letter.char}
                    </text>
                  )}
                </For>
              </g>
              <text
                {...TEXT}
                fill="url(#comet-splash-shine)"
                stroke="url(#comet-splash-shine)"
                stroke-width="6"
                filter="url(#comet-splash-bloom)"
                opacity=".7"
              >
                {WORD}
              </text>
              <text {...TEXT} fill="url(#comet-splash-shine)" stroke="url(#comet-splash-shine)" stroke-width="2.2">
                {WORD}
              </text>
            </svg>
          </div>
        </div>
      </div>
    </Show>
  )
}
