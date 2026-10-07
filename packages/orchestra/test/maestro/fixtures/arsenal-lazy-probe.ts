import { expect, test } from "bun:test"
import { plugin } from "bun"

const loaded: string[] = []
const filter = /[\\/]maestro-arsenal[\\/]src[\\/]index\.ts$/
plugin({
  name: "arsenal-lazy-positive-control",
  setup(build) {
    build.onLoad({ filter }, async (input) => {
      loaded.push(input.path)
      return { contents: await Bun.file(input.path).text(), loader: "ts" }
    })
  },
})

test("fresh native boot and selected acquisition", async () => {
  expect(filter.test("/workspace/packages/maestro-arsenal/src/index.ts")).toBe(true)
  expect(filter.test("C:\\workspace\\packages\\maestro-arsenal\\src\\index.ts")).toBe(true)
  expect(filter.test("/workspace/packages/not-maestro-arsenal/src/index.ts")).toBe(false)
  const { AppRuntime } = await import("@/effect/app-runtime")
  const { Effect } = await import("effect")
  await AppRuntime.runPromise(Effect.void)
  const boot = [...loaded]
  const { Arsenal } = await import("@orchestra/maestro-arsenal")
  const capabilities = (await Arsenal.list()).length
  console.log(JSON.stringify({ boot, acquired: loaded, capabilities }))
}, 90000)
