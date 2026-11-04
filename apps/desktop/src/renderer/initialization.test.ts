import { describe, expect, test } from "bun:test"
import { checkedLocalServer, initializationData, initializationReady, recoverRemoteServer } from "./initialization"

describe("desktop renderer initialization", () => {
  test("desktop recovery: healthy configured remote survives sidecar failure with diagnostics preserved", async () => {
    const error = new Error("sidecar startup failed")
    const observed: unknown[] = []
    const remote = await recoverRemoteServer(JSON.stringify({ list: [
      "https://other.test", { type: "http", http: { url: "https://preferred.test", username: "user", password: "secret" } },
    ] }), "https://preferred.test", async (http) => { observed.push(http); return true })
    expect(remote?.http).toEqual({ url: "https://preferred.test", username: "user", password: "secret" })
    expect(observed).toHaveLength(1)
    expect(initializationData(Object.assign(() => { throw error }, { error }), !!remote)).toBeUndefined()
    expect(error.message).toBe("sidecar startup failed")
    expect((error as Error & { localServerStartup?: boolean }).localServerStartup).toBe(true)
  })

  test("desktop recovery: unhealthy or malformed configured remotes do not hide sidecar failure", async () => {
    expect(await recoverRemoteServer("not json", null, async () => { throw new Error("must not probe") })).toBeUndefined()
    const remote = await recoverRemoteServer(JSON.stringify({ list: ["https://offline.test"] }), null, async () => false)
    expect(remote).toBeUndefined()
    const error = new Error("sidecar startup failed")
    expect(() => initializationData(Object.assign(() => undefined, { error }), !!remote)).toThrow(error)
  })
  test("throws the original initialization error before rendering server providers", () => {
    const error = new Error("sidecar startup failed")

    try {
      initializationData(Object.assign(() => undefined, { error }))
      throw new Error("expected initialization to fail")
    } catch (failure) {
      expect(failure).toBe(error)
      expect((failure as Error & { localServerStartup?: boolean }).localServerStartup).toBe(true)
    }
  })

  test("removes Electron's remote invocation wrapper from startup errors", () => {
    const error = new Error(
      "Error invoking remote method 'await-initialization': Error: Cannot migrate session_message projections",
    )

    try {
      initializationData(Object.assign(() => undefined, { error }))
      throw new Error("expected initialization to fail")
    } catch (failure) {
      expect(failure).toBe(error)
      expect((failure as Error).message).toBe("Cannot migrate session_message projections")
    }
  })

  test("returns initialized sidecar data", () => {
    const sidecar = { url: "http://127.0.0.1:1234", username: "orchestra", password: "secret" }

    expect(initializationData(Object.assign(() => sidecar, { error: undefined }))).toBe(sidecar)
  })

  test("does not discard falsy initialization errors", () => {
    let caught: unknown
    try {
      initializationData(Object.assign(() => undefined, { error: "" }))
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    if (!(caught instanceof Error)) return
    expect(caught.message).toBe("")
    expect((caught as Error & { localServerStartup?: boolean }).localServerStartup).toBe(true)
  })

  test("checks initialization errors before rendering server providers", () => {
    const error = new Error("sidecar startup failed")

    expect(() => initializationReady(Object.assign(() => undefined, { error, loading: false }))).toThrow(error)
  })

  test("waits for pending initialization without reading it", () => {
    let reads = 0

    expect(
      initializationReady(
        Object.assign(
          () => {
            reads++
            return undefined
          },
          { error: undefined, loading: true },
        ),
      ),
    ).toBe(false)
    expect(reads).toBe(0)
  })

  test("the app skips its startup check only for a local server main already saw healthy", () => {
    expect(checkedLocalServer({ healthChecked: true }, false)).toBe("sidecar")
    expect(checkedLocalServer({ healthChecked: false }, false)).toBeUndefined()
    expect(checkedLocalServer({ healthChecked: true }, true)).toBeUndefined()
    expect(checkedLocalServer(undefined, false)).toBeUndefined()
  })
})
