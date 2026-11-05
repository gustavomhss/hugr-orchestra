import { CredentialCipher } from "@orchestra/core/credential"
import { Effect, Layer } from "effect"
import { FabricIdentityPreparation } from "../../src/identity-preparation"
import { layer } from "./context"
import { setup } from "./identity-attempt"

export const layers = (filename: string) => Layer.merge(layer(filename), CredentialCipher.layer)
export function preparedSetup(root: import("@orchestra/schema/schema").AbsolutePath, now?: () => number) {
  return Effect.gen(function* () {
    const s = yield* setup(root, { now })
    const attempt = yield* s.run(s.attempts.begin(s.input))
    const options = { operators: s.operators, root, profile: s.host, now }
    const preparation = yield* FabricIdentityPreparation.make(options)
    const selection = { context: s.info.context, attempt }
    return { ...s, attempt, options, preparation, selection }
  })
}
