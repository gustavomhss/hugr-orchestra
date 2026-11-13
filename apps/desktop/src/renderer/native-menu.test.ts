import { afterEach, expect, test } from "bun:test"
import { publishNativeTranslations } from "./native-menu"

const logged: unknown[] = []
const original = console.error

afterEach(() => {
  console.error = original
  logged.length = 0
})

test("a failed native-menu write is reported", async () => {
  console.error = (...args) => {
    logged.push(args[0])
  }
  const reported: unknown[] = []
  const error = new Error("ipc closed")

  await publishNativeTranslations({
    write: async () => {
      throw error
    },
    report: (failure) => reported.push(failure),
  })

  expect(reported).toEqual([error])
  expect(logged).toEqual([error])
})

test("a successful native-menu write is not reported", async () => {
  let written = false

  await publishNativeTranslations({
    write: async () => {
      written = true
    },
    report: () => {
      throw new Error("must not report")
    },
  })

  expect(written).toBe(true)
})
