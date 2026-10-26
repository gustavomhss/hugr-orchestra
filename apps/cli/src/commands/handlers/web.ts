import { EOL, networkInterfaces } from "os"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import { HttpServer } from "effect/unstable/http"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Spawn } from "../../services/process"
import { serveForever } from "./serve"

export default Runtime.handler(
  Commands.commands.web,
  Effect.fn("cli.web")(function* (input) {
    if (!process.env.ORCHESTRA_SERVER_PASSWORD) process.stdout.write("!  ORCHESTRA_SERVER_PASSWORD is not set; the server uses the saved service password." + EOL)
    const hostname = input.mdns && input.hostname === "127.0.0.1" ? "0.0.0.0" : input.hostname
    return yield* serveForever({
      hostname,
      port: input.port,
      register: false,
      cors: input.cors,
      onListening: (address, root) =>
        Effect.gen(function* () {
          if (!root) return yield* Effect.fail(new Error("The web interface is not built in this install. Build apps/web or set ORCHESTRA_WEB_UI_DIR."))
          const port = HttpServer.formatAddress(address).match(/:(\d+)$/)?.[1] ?? ""
          if (input.mdns) yield* Effect.promise(() => import("../../mdns").then((mdns) => mdns.publish(Number(port), input["mdns-domain"])))
          const lines = accessLines(hostname, port, input.mdns ? `${input["mdns-domain"]}:${port}` : undefined)
          process.stdout.write(lines.join(EOL) + EOL)
          yield* openBrowser(hostname === "0.0.0.0" ? `http://localhost:${port}` : `http://${hostname}:${port}`)
        }),
    })
  }),
)

/** What a person needs to reach the server: the local URL, plus every network address when it listens on all of them. */
export function accessLines(hostname: string, port: string, mdns?: string) {
  if (hostname !== "0.0.0.0") return [`  Web interface:    http://${hostname}:${port}`]
  return [
    `  Local access:      http://localhost:${port}`,
    ...networkIPs().map((ip) => `  Network access:    http://${ip}:${port}`),
    ...(mdns ? [`  mDNS:              ${mdns}`] : []),
  ]
}

function networkIPs() {
  return Object.values(networkInterfaces()).flatMap((nets) =>
    (nets ?? [])
      // Internal and non-IPv4 addresses are not reachable from another machine, and 172.x is Docker's bridge.
      .filter((net) => !net.internal && net.family === "IPv4" && !net.address.startsWith("172."))
      .map((net) => net.address),
  )
}

const openBrowser = (url: string) => {
  const command: readonly [string, ...string[]] =
    process.platform === "darwin" ? ["open", url] : process.platform === "win32" ? ["cmd", "/c", "start", "", url] : ["xdg-open", url]
  return Spawn.run(command).pipe(Effect.ignore)
}
