import { expect, test } from "bun:test"
import { listenDeepLinks } from "../src/pages/layout/deep-links"
import { listenForDeepLinks } from "../../desktop/src/renderer/deep-links"

test("desktop bridge waits for shell readiness and acknowledges live links without remount replay", async () => {
  const delivered: string[] = []
  const initial = Promise.withResolvers<string[]>()
  const calls: string[] = []
  let receive!: (urls: string[]) => void
  const stop = listenForDeepLinks(window, {
    consumeInitialDeepLinks: () => { calls.push("ready"); return initial.promise },
    onDeepLink(callback) { receive = callback; return () => {} },
  })
  expect(calls).toEqual([])
  const remove = listenDeepLinks(window, (urls) => delivered.push(...urls))
  receive(["orchestra://live"])
  initial.resolve(["orchestra://initial"])
  await initial.promise
  await Promise.resolve()
  expect(delivered).toEqual(["orchestra://initial", "orchestra://live"])
  receive(["orchestra://later"])
  expect(delivered).toEqual(["orchestra://initial", "orchestra://live", "orchestra://later"])
  remove()
  receive(["orchestra://between-mounts"])
  stop()
  const remounted: string[] = []
  const cleanup = listenDeepLinks(window, (urls) => remounted.push(...urls))
  expect(remounted).toEqual(["orchestra://between-mounts"])
  cleanup()
})
