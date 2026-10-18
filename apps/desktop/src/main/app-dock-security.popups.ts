// The popup scenarios of the App Dock native harness (app-dock-security.test.ts), which bundles this
// module and runs them inside its Electron child, and the window and wait primitives they share with it.
type Frame = { executeJavaScript: (code: string) => Promise<any> }
type Bounds = { x: number; y: number; width: number; height: number }
type Tab = { tabID: string; generation: number }
export type PopupHarness = {
  ipcWin: Electron.BrowserWindow
  webContents: { getAllWebContents: () => Electron.WebContents[] }
  base: string
  bounds: Bounds
  execute: (phase: string, frame: Frame, code: string) => Promise<any>
  invoke: (frame: Frame, channel: string, args: unknown[]) => Promise<any>
}

export const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}
export const attached = (win: Electron.BrowserWindow, contents: Electron.WebContents | undefined) =>
  (win.contentView as unknown as { children: { webContents?: Electron.WebContents }[] }).children.some(
    (child) => child.webContents === contents,
  )
export const attachedContents = (win: Electron.BrowserWindow) =>
  (win.contentView as unknown as { children: { webContents?: Electron.WebContents }[] }).children
    .map((child) => child.webContents)
    .find(Boolean)
export const waitFor = async (predicate: () => boolean | Promise<boolean>, label: string) => {
  const deadline = Date.now() + 5_000
  while (!(await predicate())) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${label}`)
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
}

// U32. Only the tab on screen may raise a popup. A popup from a background tab, or from any tab while the
// Dock is hidden, is refused as blocked: no WebContents is created and no tab is announced or attached.
// The tab on screen keeps its popups, which open as the selected tab.
export async function backgroundPopups(harness: PopupHarness) {
  const ipcWin = harness.ipcWin
  const invoke = (channel: string, args: unknown[]) => harness.invoke(ipcWin.webContents.mainFrame, channel, args)
  const u32Start = (await events(harness)).length
  const u32Profile = "popup-background-profile"
  const u32Opener: Tab = await invoke("app-dock-open", [harness.base, harness.bounds, u32Profile])
  const u32OpenerContents = attachedContents(ipcWin)
  const u32Front: Tab = await invoke("app-dock-open", [harness.base, harness.bounds, u32Profile])
  const u32FrontContents = attachedContents(ipcWin)
  check(u32OpenerContents && u32FrontContents && u32OpenerContents !== u32FrontContents, "U32 App Dock views missing")
  check(!attached(ipcWin, u32OpenerContents), "U32 opener is not a background tab")
  const u32Live = () =>
    JSON.stringify(
      harness.webContents
        .getAllWebContents()
        .filter((item) => !item.isDestroyed())
        .map((item) => item.id)
        .sort((left, right) => left - right),
    )
  const u32Open = async (from: Electron.WebContents, url: string) => {
    await waitFor(
      async () => (await harness.execute("view:u32-opener-ready", from, "document.readyState === 'complete'")) === true,
      "U32 opener load",
    )
    await harness.execute("view:u32-window-open", from, `window.open(${JSON.stringify(url)}); undefined`)
  }
  const u32Refused = async (from: Electron.WebContents, opener: Tab, url: string) => {
    const before = u32Live()
    await u32Open(from, url)
    const refused = await waitEvent(
      harness,
      u32Start,
      (event) => event.type === "navigation-error" && event.payload.url === url,
      `U32 refusal ${url}`,
    )
    check(
      refused.payload.code === "blocked" &&
        JSON.stringify(refused.payload.identity) === JSON.stringify(identity(opener)),
      `U32 popup ${url} was not refused as blocked for its opener`,
    )
    check(u32Live() === before, `U32 refused popup ${url} created a view`)
  }
  await u32Refused(u32OpenerContents!, u32Opener, `${harness.base}/popup-target?u32=background`)
  check(
    ipcWin.contentView.children.length === 1 && attached(ipcWin, u32FrontContents),
    "U32 popup from a background tab displaced the tab on screen",
  )
  await invoke("app-dock-hide", [identity(u32Front)])
  check(attachedContents(ipcWin) === undefined, "U32 hide left a view attached")
  await u32Refused(u32FrontContents!, u32Front, `${harness.base}/popup-target?u32=hidden`)
  check(attachedContents(ipcWin) === undefined, "U32 popup attached a view while the Dock was hidden")
  check(
    !(await events(harness))
      .slice(u32Start)
      .some((event) => event.type === "tab-opened" || event.type === "tab-opened-background"),
    "U32 a refused popup announced a tab",
  )

  await invoke("app-dock-select", [identity(u32Front), harness.bounds])
  check(attached(ipcWin, u32FrontContents), "U32 selecting the front tab did not attach it")
  const u32FrontURL = `${harness.base}/popup-target?u32=front`
  await u32Open(u32FrontContents!, u32FrontURL)
  const u32Opened = await waitEvent(
    harness,
    u32Start,
    (event) => event.type === "tab-opened" && event.payload.url === u32FrontURL,
    "U32 front popup tab-opened",
  )
  let u32PopupContents: Electron.WebContents | undefined
  await waitFor(() => {
    u32PopupContents = harness.webContents
      .getAllWebContents()
      .find((item) => !item.isDestroyed() && item.getURL() === u32FrontURL)
    return u32PopupContents !== undefined
  }, "U32 front popup WebContents")
  check(
    ipcWin.contentView.children.length === 1 && attached(ipcWin, u32PopupContents),
    "U32 the front tab's popup is not the one attached, selected tab",
  )
  for (const opened of [u32Opened.payload, u32Front, u32Opener]) await invoke("app-dock-close-tab", [opened.tabID])
  return "popups from a background tab or a hidden Dock are refused as blocked with no view; the tab on screen still opens its popup as the selected tab"
}

// U33. U28 left both windows at the 20 inactive view cap, with its tab a1 in the background of the first.
// A popup never makes room for itself: it is refused as blocked, whether a background tab or the tab on
// screen opens it.
export async function popupsAtCapacity(
  harness: PopupHarness,
  ipcWinB: Electron.BrowserWindow,
  activeContents: Electron.WebContents,
  activeContentsB: Electron.WebContents,
) {
  const u33Start = (await events(harness)).length
  const u33Live = () =>
    JSON.stringify(
      harness.webContents
        .getAllWebContents()
        .filter((item) => !item.isDestroyed())
        .map((item) => item.id)
        .sort((left, right) => left - right),
    )
  const u33Before = u33Live()
  const u33Background = harness.webContents
    .getAllWebContents()
    .find((item) => !item.isDestroyed() && item.getURL() === `${harness.base}/ticker?capacity=a1`)
  check(u33Background && !attached(harness.ipcWin, u33Background), "U33 background tab missing")
  for (const [from, url] of [
    [u33Background!, `${harness.base}/popup-target?u33=background`],
    [activeContents, `${harness.base}/popup-target?u33=active`],
  ] as const) {
    await harness.execute("view:u33-window-open", from, `window.open(${JSON.stringify(url)}); undefined`)
    await waitFor(
      async () =>
        (await events(harness))
          .slice(u33Start)
          .some((event) => event.type === "navigation-error" && event.payload.url === url) ||
        harness.webContents.getAllWebContents().some((item) => !item.isDestroyed() && item.getURL() === url),
      `U33 popup outcome ${url}`,
    )
    check(u33Live() === u33Before, `U33 popup ${url} at the view cap evicted a tab or opened a view`)
    check(
      (await events(harness))
        .slice(u33Start)
        .some(
          (event) => event.type === "navigation-error" && event.payload.code === "blocked" && event.payload.url === url,
        ),
      `U33 popup ${url} at the view cap was not refused as blocked`,
    )
  }
  check(
    !(await events(harness))
      .slice(u33Start)
      .some((event) => event.type === "tab-opened" || event.type === "tab-opened-background") &&
      attached(harness.ipcWin, activeContents) &&
      attached(ipcWinB, activeContentsB),
    "U33 a popup at the view cap announced a tab or displaced an active one",
  )
  return "at the 20 inactive view cap, popups from a background or the active tab are refused; nothing is evicted"
}

const events = (harness: PopupHarness): Promise<any[]> =>
  harness.execute("event-read", harness.ipcWin.webContents, "window.__appDockEvents")

async function waitEvent(harness: PopupHarness, after: number, predicate: (event: any) => boolean, label: string) {
  let found: any
  await waitFor(async () => {
    found = (await events(harness)).slice(after).find(predicate)
    return found !== undefined
  }, label)
  return found
}

const identity = (tab: Tab) => ({ tabID: tab.tabID, generation: tab.generation })
