import { test } from "bun:test"
import { plugin } from "bun"

const loaded: string[] = []
plugin({
  name: "arsenal-lazy-positive-control",
  setup(build) {
    build.onLoad({ filter: /\/maestro-arsenal\/src\/index\.ts$/ }, async (input) => {
      loaded.push(input.path)
      return { contents: await Bun.file(input.path).text(), loader: "ts" }
    })
  },
})

test("fresh native boot and selected acquisition", async () => {
  const { AppRuntime } = await import("@/effect/app-runtime")
  const { Effect } = await import("effect")
  await AppRuntime.runPromise(Effect.void)
  const boot = [...loaded]
  const { Arsenal } = await import("@opencode-ai/maestro-arsenal")
  const capabilities = (await Arsenal.list()).length
  console.log(JSON.stringify({ boot, acquired: loaded, capabilities }))
}, 90000)
