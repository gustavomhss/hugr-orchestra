import { expect, mock, test } from "bun:test"

// The Electron module only resolves inside the Electron runtime; open() needs a partition session.
// Bun keeps a module mock for the rest of the test process, so it also needs the default export that later
// files reach through `import electron from "electron"` (store.ts, imported by wsl/servers.test.ts).
const electron = {
  session: { fromPartition: () => ({ setCertificateVerifyProc: () => undefined }) },
  WebContentsView: class {},
}
mock.module("electron", () => ({ ...electron, default: electron }))

const { AppDockLinux } = await import("./app-dock-linux")

type Options = Parameters<typeof AppDockLinux.create>[0]
type Win = Parameters<ReturnType<typeof AppDockLinux.create>["open"]>[1]

test("a successful open warms the native helper once per attempt without awaiting it", async () => {
  const f = fixture(() => new Promise(() => {}))

  expect(await settle(f.open())).toMatchObject({ url: "appdock://linux" })
  expect(f.calls.filter((call) => call === "native")).toEqual(["native"])

  // The already authenticated view returns through its fast path and warms again.
  expect(await settle(f.open())).toMatchObject({ url: "appdock://linux" })
  expect(f.calls.filter((call) => call === "native")).toEqual(["native", "native"])
  f.linux.closeSender(f.senderID)
})

test("a rejecting pre-warm neither rejects open nor escapes as an unhandled rejection", async () => {
  const unhandled: unknown[] = []
  const listener = (reason: unknown) => unhandled.push(reason)
  process.on("unhandledRejection", listener)
  const f = fixture(async () => {
    throw new Error("Native helper payload is not configured")
  })

  expect(await settle(f.open())).toMatchObject({ url: "appdock://linux" })
  await Bun.sleep(20)
  process.off("unhandledRejection", listener)
  expect(f.calls).toContain("native")
  expect(unhandled).toEqual([])
  f.linux.closeSender(f.senderID)
})

test("a failed open does not warm the native helper", async () => {
  const f = fixture(async () => undefined)
  f.runtime.start = async () => {
    throw new Error("Linux workspace failed to start")
  }

  await expect(f.open()).rejects.toMatchObject({ name: "RuntimeError" })
  await Bun.sleep(0)
  expect(f.calls).not.toContain("native")
  f.linux.closeSender(f.senderID)
})

function settle<T>(operation: Promise<T>) {
  return Promise.race([operation, Bun.sleep(2000).then(() => "open did not settle")])
}

function fixture(native: () => Promise<unknown>) {
  const senderID = 7
  const calls: string[] = []
  const tabs: { tabID: string; generation: number; url: string }[] = []
  const page = { url: "about:blank" }
  const contents = {
    getURL: () => page.url,
    loadURL: async (url: string) => {
      page.url = url
    },
    isLoadingMainFrame: () => false,
    executeJavaScript: async () => true,
    insertCSS: async () => "",
    getBackgroundThrottling: () => false,
    setBackgroundThrottling: () => undefined,
    focus: () => undefined,
    isDestroyed: () => false,
    isCrashed: () => false,
  }
  const win = {
    id: 1,
    isDestroyed: () => false,
    isVisible: () => true,
    isMinimized: () => false,
    on: () => undefined,
    removeListener: () => undefined,
    contentView: { children: [] },
    webContents: { id: senderID, isDestroyed: () => false, executeJavaScript: async () => undefined },
  }
  const dock = {
    open: async (...args: unknown[]) => {
      const tab = { tabID: (args[6] as { tabID: string }).tabID, generation: 1, url: String(args[2]) }
      page.url = tab.url
      tabs.push(tab)
      return tab
    },
    list: () => tabs,
    contents: () => contents,
    select: () => calls.push("select"),
    close: () => undefined,
    activate: () => undefined,
  }
  const runtime = {
    start: async () => {
      calls.push("start")
      return {
        url: "https://127.0.0.1:40123",
        fingerprint: "AB:CD",
        password: "dock-password",
        placement: { runtimeID: "runtime", runtimeEpoch: "epoch" },
      }
    },
    configureBrowser: async () => "bridge-key",
    native: () => {
      calls.push("native")
      return native()
    },
  }
  const linux = AppDockLinux.create({
    dock: dock as unknown as Options["dock"],
    runtime: runtime as unknown as Options["runtime"],
    notify: () => undefined,
  })
  return {
    senderID,
    calls,
    runtime,
    linux,
    open: () =>
      linux.open(senderID, win as unknown as Win, { x: 0, y: 0, width: 800, height: 600 }, {
        storageKey: "prewarm-profile-storage",
      }),
  }
}
