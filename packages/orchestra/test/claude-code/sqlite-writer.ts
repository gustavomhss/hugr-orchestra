// Child-process oracle for the actual auxiliary transaction implementation. No model or main Session DB.
import { Effect, Schema } from "effect"
import { FSUtil } from "@orchestra/core/fs-util"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ClaudeCodeStorage } from "@/claude-code/storage"

await Effect.runPromise(Effect.gen(function* () {
  const storage = ClaudeCodeStorage.create({ fs: yield* FSUtil.Service, directory: Effect.succeed(process.argv[2]),
    empty: () => ({ owner: "child-process-test", updates: [] as string[] }),
    decode: (text) => Schema.decodeUnknownSync(Schema.Struct({ owner: Schema.Literal("child-process-test"), updates: Schema.mutable(Schema.Array(Schema.String)) }))(
      Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(text)),
  })
  // A deliberately reads the old state then pauses BEFORE its modifying transaction.
  if (process.argv[4] !== "initialize") yield* storage.read
  console.log("READY")
  yield* Effect.promise(() => Bun.stdin.text())
  yield* storage.modify((state) => { state.updates.push(process.argv[3]) })
  console.log("COMMITTED")
}).pipe(Effect.provide(LayerNode.compile(FSUtil.node))))
