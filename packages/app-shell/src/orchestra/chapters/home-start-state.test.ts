import { expect, test } from "bun:test"
import { HOME_COPY, HOME_COPY_BR } from "../../i18n/orchestra-chapters/home"
import { HOME_EXAMPLE_KEYS, needsModel } from "./home-start-state"

test("the model step waits for the provider catalog and yields to a connected model or a skip", () => {
  // Catalog not loaded yet: never a false "connect" prompt.
  expect(needsModel({ providersReady: false, connected: false, skipped: false })).toBe(false)
  expect(needsModel({ providersReady: true, connected: false, skipped: false })).toBe(true)
  expect(needsModel({ providersReady: true, connected: true, skipped: false })).toBe(false)
  expect(needsModel({ providersReady: true, connected: false, skipped: true })).toBe(false)
})

test("the three examples are real copy in English and Portuguese", () => {
  expect(HOME_EXAMPLE_KEYS).toHaveLength(3)
  for (const key of HOME_EXAMPLE_KEYS) {
    expect(HOME_COPY[key]?.trim()).toBeTruthy()
    expect(HOME_COPY_BR[key]?.trim()).toBeTruthy()
    expect(HOME_COPY_BR[key]).not.toBe(HOME_COPY[key])
  }
})
