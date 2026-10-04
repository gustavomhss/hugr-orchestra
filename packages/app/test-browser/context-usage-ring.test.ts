import { expect, test } from "bun:test"
import { createRequire } from "node:module"
import { createSignal } from "solid-js"
import { createComponent, render } from "solid-js/web"

// Bun compiles JSX for React. Compile both rings with Solid's own Babel preset so the test renders their real SVG.
// The ?solid specifier scopes the plugin to these imports and keeps a React-compiled copy loaded elsewhere out.
const solid = createRequire(Bun.resolveSync("vite-plugin-solid", import.meta.dir))
Bun.plugin({
  name: "solid-progress-circle",
  setup(build) {
    build.onLoad({ filter: /\/progress-circle(-v2)?\.tsx\?solid$/ }, async (args) => {
      const result = await solid("@babel/core").transformAsync(
        await Bun.file(args.path.replace(/\?solid$/, "")).text(),
        {
          filename: args.path,
          presets: [[solid("babel-preset-solid"), { generate: "dom" }]],
          parserOpts: { plugins: ["jsx", "typescript"] },
          configFile: false,
          babelrc: false,
        },
      )
      return { contents: result.code, loader: "ts" }
    })
  },
})
const { ProgressCircle }: typeof import("@opencode-ai/ui/progress-circle") = await import(
  `${Bun.resolveSync("@opencode-ai/ui/progress-circle", import.meta.dir)}?solid`
)
const { ProgressCircleV2 }: typeof import("@opencode-ai/ui/v2/progress-circle-v2") = await import(
  `${Bun.resolveSync("@opencode-ai/ui/v2/progress-circle-v2", import.meta.dir)}?solid`
)

for (const ring of [
  {
    name: "ProgressCircle",
    track: ["progress-circle-background", "progress-circle-background-overlay"],
    progress: "progress-circle-progress",
    mount: (percentage: () => number | undefined) =>
      createComponent(ProgressCircle, {
        size: 16,
        strokeWidth: 2,
        get percentage() {
          return percentage()
        },
      }),
  },
  {
    name: "ProgressCircleV2",
    track: ["progress-circle-v2-background"],
    progress: "progress-circle-v2-progress",
    mount: (percentage: () => number | undefined) =>
      createComponent(ProgressCircleV2, {
        get percentage() {
          return percentage()
        },
      }),
  },
]) {
  test(`${ring.name} draws unknown usage as a dashed track, not as an empty 0% ring`, () => {
    const host = document.createElement("div")
    const [percentage, setPercentage] = createSignal<number | undefined>(undefined)
    const dispose = render(() => ring.mount(percentage), host)
    const svg = host.querySelector("svg")
    const slot = (name: string) => host.querySelector(`[data-slot="${name}"]`)
    const geometry = () =>
      [...host.querySelectorAll("circle")].map((circle) => [
        circle.getAttribute("r"),
        circle.getAttribute("stroke-width"),
      ])
    const unknown = { size: svg?.getAttribute("width"), geometry: geometry() }

    // Unknown: every track layer is dashed into even segments that close around the ring, and no progress is drawn.
    ring.track.forEach((name) => {
      const track = slot(name)
      const circumference = 2 * Math.PI * Number(track?.getAttribute("r"))
      expect(Number(track?.getAttribute("stroke-dasharray")) * 16).toBeCloseTo(circumference)
    })
    expect(Number(slot(ring.progress)?.getAttribute("stroke-dashoffset"))).toBeCloseTo(
      Number(slot(ring.progress)?.getAttribute("stroke-dasharray")),
    )

    // A reported 0% keeps the solid track, so the two states stay distinguishable.
    setPercentage(0)
    ring.track.forEach((name) => expect(slot(name)?.hasAttribute("stroke-dasharray")).toBe(false))
    expect(Number(slot(ring.progress)?.getAttribute("stroke-dashoffset"))).toBeCloseTo(
      Number(slot(ring.progress)?.getAttribute("stroke-dasharray")),
    )
    expect({ size: svg?.getAttribute("width"), geometry: geometry() }).toEqual(unknown)

    setPercentage(30)
    ring.track.forEach((name) => expect(slot(name)?.hasAttribute("stroke-dasharray")).toBe(false))
    expect(Number(slot(ring.progress)?.getAttribute("stroke-dashoffset"))).toBeCloseTo(
      Number(slot(ring.progress)?.getAttribute("stroke-dasharray")) * 0.7,
    )

    setPercentage(undefined)
    ring.track.forEach((name) => expect(slot(name)?.hasAttribute("stroke-dasharray")).toBe(true))
    dispose()
  })
}
