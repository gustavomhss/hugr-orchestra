import * as Effect from "effect/Effect"
import { Option } from "effect"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Daemon } from "../../services/daemon"

export default Runtime.handler(
  Commands.commands.acp,
  Effect.fn("cli.acp")(function* (input) {
    process.env.ORCHESTRA_CLIENT = "acp"
    const cwd = Option.getOrUndefined(input.cwd)
    if (cwd) process.chdir(cwd)
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const { serveAcp } = yield* Effect.promise(() => import("../../acp/serve"))
    const output = new WritableStream<Uint8Array>({
      write: (chunk) =>
        new Promise<void>((resolve, reject) => process.stdout.write(chunk, (error) => (error ? reject(error) : resolve()))),
    })
    const stdin = new ReadableStream<Uint8Array>({
      start(controller) {
        process.stdin.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
        process.stdin.on("end", () => controller.close())
        process.stdin.on("error", (error) => controller.error(error))
      },
    })
    yield* Effect.promise(() => serveAcp(client, { input: stdin, output }))
  }),
)
