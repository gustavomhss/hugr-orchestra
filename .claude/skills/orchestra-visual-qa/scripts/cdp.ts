// usage: [CDP_PORT=9222 for dev] bun cdp.ts shot <out.png> | eval "<js>"
const [cmd, arg] = process.argv.slice(2)
const pages = await (await fetch(`http://localhost:${process.env.CDP_PORT ?? 9333}/json`)).json()
const ws = new WebSocket(pages.find((p: any) => p.type === "page").webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const call = (method: string, params = {}) =>
  new Promise<any>((res) => {
    const my = ++id
    ws.addEventListener("message", function h(e) {
      const m = JSON.parse(e.data as string)
      if (m.id === my) { ws.removeEventListener("message", h); res(m.result ?? m) }
    })
    ws.send(JSON.stringify({ id: my, method, params }))
  })
if (cmd === "shot") {
  const c = process.argv[4]?.split(",").map(Number); const r = await call("Page.captureScreenshot", c ? { format: "png", clip: { x: c[0], y: c[1], width: c[2], height: c[3], scale: c[4] ?? 1 } } : { format: "png" })
  await Bun.write(arg, Buffer.from(r.data, "base64"))
  console.log("saved", arg)
}
if (cmd === "eval") {
  const r = await call("Runtime.evaluate", { expression: arg, returnByValue: true, awaitPromise: true })
  console.log(JSON.stringify(r.result?.value ?? r, null, 1))
}
if (cmd === "key") { for (const type of ["keyDown", "keyUp"]) await call("Input.dispatchKeyEvent", { type, key: arg, code: arg, windowsVirtualKeyCode: arg === "Escape" ? 27 : 0 }) }
ws.close()
