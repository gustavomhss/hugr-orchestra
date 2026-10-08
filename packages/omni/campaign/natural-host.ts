// Controlled host plumbing only. v10-natural-exit builds its adapter from unchanged production modules.
// No exit hook, forced exit, watchdog, or unref belongs in this child. Parent owns failure cleanup.
import { createServer } from "node:http"
import { writeFileSync } from "node:fs"

export async function naturalHost(input: {
  listen: () => Promise<{ url: URL; stop: (close?: boolean) => Promise<void> }>
  activate: () => Promise<unknown>
  dispose: () => Promise<void>
}) {
  const listener = await input.listen()
  const requests: string[] = []
  const control = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`)
    if (req.method !== "POST" || !["/write", "/dispose"].includes(req.url ?? "")) {
      res.writeHead(404).end()
      return
    }
    const action = req.url === "/write" ? input.activate() : (async () => {
      console.log("NATURAL_EVENT " + JSON.stringify({ event: "dispose-started", pid: process.pid }))
      await listener.stop(true)
      await input.dispose()
      return { disposed: true }
    })()
    void action.then((result) => {
      res.setHeader("content-type", "application/json")
      res.end(JSON.stringify(result))
      if (req.url !== "/dispose") return
      // Bun may exit before a Node-compatible server.close callback runs. Disposal has already completed.
      const evidence = { event: "disposed", pid: process.pid, requests, resources: process.getActiveResourcesInfo() }
      writeFileSync(process.env.NATURAL_DISPOSED!, JSON.stringify(evidence))
      console.log("NATURAL_EVENT " + JSON.stringify(evidence))
      // Mutation changes only the event-loop boundary, after the very same real disposal.
      if (process.env.NATURAL_MUTATION === "timer") setInterval(() => {}, 1000)
      control.close()
      control.closeIdleConnections()
    }, (error: unknown) => {
      console.error("NATURAL_FAILURE " + String(error))
      process.exitCode = 1
      res.writeHead(500).end(String(error))
      control.close()
    })
  })
  await new Promise<void>((resolve) => control.listen(0, "127.0.0.1", resolve))
  const address = control.address()
  if (!address || typeof address === "string") throw new Error("Natural host control has no TCP address")
  console.log("NATURAL_READY " + JSON.stringify({ pid: process.pid, product: listener.url.href, control: `http://127.0.0.1:${address.port}`, runtime: process.versions }))
}
