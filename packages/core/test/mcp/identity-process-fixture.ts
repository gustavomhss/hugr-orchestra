// Hosted child only: fresh JS process, real Cipher/flock and no shared helper cache.
import path from "node:path"
import { Context, Effect, Layer } from "effect"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { CredentialCipher } from "@orchestra/core/credential/cipher"
import { EffectFlock } from "@orchestra/core/util/effect-flock"

const { McpIdentity } = await import("../../src/mcp/identity")
const directory = process.argv[2]
const filename = process.argv[3]
const authority = JSON.parse(process.argv[4])
const result = await Effect.runPromise(
  Effect.gen(function* () {
    const layer = McpIdentity.layerWith({ filename }).pipe(
      Layer.provide(
        AppNodeBuilder.build(LayerNode.group([Global.node, CredentialCipher.node, EffectFlock.node]), [
          [
            Global.node,
            Global.layerWith({
              home: directory,
              data: path.join(directory, "data"),
              state: path.join(directory, "state"),
              config: path.join(directory, "global"),
            }),
          ],
        ]),
      ),
    )
    const service = Context.get(yield* Layer.build(layer), McpIdentity.Service)
    return yield* service.identify(authority, "probe")
  }).pipe(Effect.scoped, Effect.result),
)
if (result._tag === "Failure") {
  console.log(JSON.stringify({ error: { tag: result.failure._tag, message: result.failure.message } }))
  process.exitCode = 1
}
if (result._tag === "Success") console.log(JSON.stringify({ id: result.success.id }))
