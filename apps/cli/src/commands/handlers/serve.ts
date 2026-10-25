import { NodeHttpServer } from "@effect/platform-node"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { PermissionSaved } from "@orchestra/core/permission/saved"
import { SessionV2 } from "@orchestra/core/session"
import { Context, Layer, Option } from "effect"
import * as Effect from "effect/Effect"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { createServer } from "node:http"
import { createRoutes } from "@orchestra/server/routes"
import { AppDockSocket } from "@orchestra/app-dock/socket-transport"
import { Commands } from "../commands"
import { ProductHost } from "../../host"
import { Runtime } from "../../framework/runtime"
import { Daemon } from "../../services/daemon"

const SHUTDOWN_GRACE_MS = 2_000

export default Runtime.handler(
  Commands.commands.serve,
  Effect.fn("cli.serve")(function* (input) {
    return yield* Effect.scoped(
      Effect.gen(function* () {
        // The runtime interrupts on SIGTERM and SIGINT and runs the finalizers; this bounds a finalizer that hangs,
        // as the desktop kills its child a few seconds after SIGTERM.
        const deadline = () => void setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref()
        process.once("SIGTERM", deadline)
        process.once("SIGINT", deadline)
        const daemon = yield* Daemon.Service
        // A desktop-owned child gets a per-launch password in env and never touches the daemon's password file.
        const password = process.env.ORCHESTRA_SERVER_PASSWORD || (yield* daemon.password())
        const listening = yield* listen(input.hostname, input.port, password, hosts())
        const address = listening.address
        // Closing the server waits for every open connection, and the event stream never ends on its own. Scope
        // finalizers run in reverse, so this drops the connections before the server closes.
        yield* Effect.addFinalizer(() => Effect.sync(() => listening.server.closeAllConnections?.()))
        if (input.register) yield* daemon.register(address)
        console.log(`server listening on ${HttpServer.formatAddress(address)}`)
        // V1 transcripts on this database are copied to V2 once, after health already answers.
        yield* Effect.gen(function* () {
          const database = yield* Database.Service
          const imported = yield* SessionV2.SessionLegacyImport.run(database.db)
          if (imported > 0) console.log(`imported ${imported} V1 session transcripts`)
        }).pipe(
          Effect.provide(AppNodeBuilder.build(LayerNode.group([Database.node]))),
          Effect.catchCause((cause) => Effect.logError("V1 session import failed", cause)),
          Effect.forkScoped,
        )
        return yield* Effect.never
      }),
    )
  }),
)

function listen(hostname: string, port: Option.Option<number>, password: string, host: ReturnType<typeof hosts>) {
  if (Option.isSome(port)) return bind(hostname, port.value, password, host)
  const next = (port: number): ReturnType<typeof bind> =>
    bind(hostname, port, password, host).pipe(
      Effect.catch((error) => (port === 65_535 ? Effect.fail(error) : next(port + 1))),
    )
  return next(4096)
}

function bind(hostname: string, port: number, password: string, host: ReturnType<typeof hosts>) {
  const server = createServer()
  return Layer.build(
    HttpRouter.serve(createRoutes({ password, host }), { disableListenLog: true, disableLogger: true }).pipe(
      Layer.provideMerge(NodeHttpServer.layer(() => server, { port, host: hostname })),
      Layer.provide(AppNodeBuilder.build(LayerNode.group([Credential.node, PermissionSaved.node]))),
    ),
  ).pipe(Effect.map((context) => ({ address: Context.get(context, HttpServer.HttpServer).address, server })))
}

// The Dock tools exist only when the desktop that owns this child handed it a Dock channel.
function hosts() {
  return ProductHost.contributions(AppDockSocket.fromEnv())
}
