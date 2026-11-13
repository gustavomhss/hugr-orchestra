import { afterEach, describe, expect, test } from "bun:test"
import { ServerConnection } from "@/context/server"
import { moveDefaultWithReplacedEntry } from "./default-server"

const key = ServerConnection.Key.make

const logged: unknown[] = []
const original = console.error

describe("moveDefaultWithReplacedEntry", () => {
  afterEach(() => {
    console.error = original
    logged.length = 0
  })

  test("a failed default write is reported after the old entry is removed", async () => {
    console.error = (...args) => {
      logged.push(args[0])
    }
    const removed: ServerConnection.Key[] = []
    const written: Array<ServerConnection.Key | null> = []
    const reported: unknown[] = []
    const error = new Error("disk full")

    await moveDefaultWithReplacedEntry({
      previous: key("old"),
      next: key("new"),
      remove: (id) => removed.push(id),
      getDefault: async () => key("old"),
      setDefault: async (id) => {
        written.push(id)
        if (id !== null) throw error
      },
      report: (failure) => reported.push(failure),
    })

    expect(removed).toEqual([key("old")])
    expect(written).toEqual([key("new"), null])
    expect(reported).toEqual([error])
    expect(logged).toEqual([error])
  })

  test("a failed clear still reports the write that left the removed server", async () => {
    console.error = (...args) => {
      logged.push(args[0])
    }
    const error = new Error("disk full")
    const reported: unknown[] = []

    await moveDefaultWithReplacedEntry({
      previous: key("old"),
      next: key("new"),
      remove: () => undefined,
      getDefault: async () => key("old"),
      setDefault: async () => {
        throw error
      },
      report: (failure) => reported.push(failure),
    })

    expect(reported).toEqual([error])
    expect(logged).toEqual([error, error])
  })

  test("a successful write is not reported", async () => {
    const written: Array<ServerConnection.Key | null> = []
    const reported: unknown[] = []

    await moveDefaultWithReplacedEntry({
      previous: key("old"),
      next: key("new"),
      remove: () => undefined,
      getDefault: async () => key("old"),
      setDefault: async (id) => {
        written.push(id)
      },
      report: (failure) => reported.push(failure),
    })

    expect(written).toEqual([key("new")])
    expect(reported).toEqual([])
  })

  test("an entry that is not the default is not rewritten", async () => {
    let written = false

    await moveDefaultWithReplacedEntry({
      previous: key("old"),
      next: key("new"),
      remove: () => undefined,
      getDefault: async () => key("other"),
      setDefault: async () => {
        written = true
      },
      report: () => {
        throw new Error("must not report")
      },
    })

    expect(written).toBe(false)
  })

  test("a failed default read is reported and does not write", async () => {
    console.error = (...args) => {
      logged.push(args[0])
    }
    const error = new Error("read failed")
    const written: Array<ServerConnection.Key | null> = []
    const reported: unknown[] = []

    await moveDefaultWithReplacedEntry({
      previous: key("old"),
      next: key("new"),
      remove: () => undefined,
      getDefault: async () => {
        throw error
      },
      setDefault: async (id) => {
        written.push(id)
      },
      report: (failure) => reported.push(failure),
    })

    expect(written).toEqual([])
    expect(reported).toEqual([error])
    expect(logged).toEqual([error])
  })

  test("a missing default read is not a failure", async () => {
    let written = false

    await moveDefaultWithReplacedEntry({
      previous: key("old"),
      next: key("new"),
      remove: () => undefined,
      setDefault: async () => {
        written = true
      },
      report: () => {
        throw new Error("must not report")
      },
    })

    expect(written).toBe(false)
  })

  test("a stale default read is not this request", async () => {
    const error = new Error("stale")
    let written = false

    await moveDefaultWithReplacedEntry({
      previous: key("old"),
      next: key("new"),
      remove: () => undefined,
      getDefault: async () => {
        throw error
      },
      setDefault: async () => {
        written = true
      },
      current: () => false,
      report: () => {
        throw new Error("must not report")
      },
    })
    await moveDefaultWithReplacedEntry({
      previous: key("old"),
      next: key("new"),
      remove: () => undefined,
      getDefault: async () => key("old"),
      setDefault: async () => {
        written = true
      },
      current: () => false,
      report: () => {
        throw new Error("must not report")
      },
    })

    expect(written).toBe(false)
  })
})
