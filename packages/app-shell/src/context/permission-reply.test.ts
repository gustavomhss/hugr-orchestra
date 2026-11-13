import { afterEach, expect, test } from "bun:test"
import { noteFailedPermissionReply } from "./permission-reply"

const logged: unknown[] = []
const original = console.error

afterEach(() => {
  console.error = original
  logged.length = 0
})

test("a failed permission reply is forgotten and reported", () => {
  console.error = (...args) => {
    logged.push(args[0])
  }
  const forgotten: string[] = []
  const reported: unknown[] = []
  const error = new Error("offline")

  noteFailedPermissionReply({
    permissionID: "perm-1",
    error,
    forget: (id) => forgotten.push(id),
    report: (failure) => reported.push(failure),
  })

  expect(forgotten).toEqual(["perm-1"])
  expect(reported).toEqual([error])
  expect(logged).toEqual([error])
})
