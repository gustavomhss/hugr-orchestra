export * as CapabilityConnectionSetup from "./setup"

import { Capability } from "@orchestra/schema/capability"
import { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { Credential } from "@orchestra/schema/credential"
import { Integration } from "@orchestra/schema/integration"
import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { CredentialTable } from "../../credential/sql"
import { Database } from "../../database/database"
import { ProjectTable } from "../../project/sql"
import type { CapabilityOperatorContract } from "../operator/contract"
import type { CapabilityRequestContract } from "../operator/request-contract"
import { CapabilityOperatorScope } from "../operator/scope"
import { CapabilityConnectionTable } from "../sql"
import { capture, decode } from "./input"
import type { CapabilityConnectionSetupContract } from "./setup-contract"

const Proof = Schema.Struct({ provider: CapabilitySetup.Provider,
  subjectID: Schema.NonEmptyString.check(Schema.isMaxLength(4096)), endpoint: Schema.String,
  integrationID: Integration.ID,
  scopeHash: Schema.String.check(Schema.isPattern(/^[0-9a-fA-F]{64}(?![\s\S])/)) })
// Connections store the fixed channel base; the verifier owns auth.test / users/@me routes.
const endpoints = Object.freeze({ slack: "https://slack.com/api", discord: "https://discord.com/api/v10" })
const SlackSubject = Schema.Tuple([
  Schema.String.check(Schema.isPattern(/^T[A-Z0-9]{1,63}(?![\s\S])/)),
  Schema.String.check(Schema.isPattern(/^[UW][A-Z0-9]{1,63}(?![\s\S])/)),
  Schema.NullOr(Schema.String.check(Schema.isPattern(/^B[A-Z0-9]{1,63}(?![\s\S])/))),
])

/** Historical receipts attest creation only, never current remote credential readiness. */
export function make(options: CapabilityConnectionSetupContract.Options) {
  const operators = Object.freeze({ ...options.operators })
  const ledger = Object.freeze({ ...options.ledger })
  const verifier = Object.freeze({ ...options.verifier })
  return Effect.gen(function* () {
    const database = yield* Database.Service
    const project = (tx: CapabilityRequestContract.Transaction | Database.Interface["db"], placement: CapabilityOperatorContract.Placement) =>
      tx.select({ id: ProjectTable.id }).from(ProjectTable).where(eq(ProjectTable.id, placement.projectID)).get().pipe(
        Effect.flatMap((row) => row ? Effect.void : Effect.fail(unavailable())))

    const connect: CapabilityConnectionSetupContract.Interface["connect"] = (placement, input) => {
      const captured = capture({ placement, input }, (value) => {
        const root = CapabilityOperatorScope.record(value, ["placement", "input"])
        const parsed = decode(CapabilitySetup.Input)(root.input)
        const label = parsed.label || parsed.provider
        if (/\s/.test(parsed.key) || label.includes(parsed.key)) throw new Error("Invalid setup data")
        return Object.freeze({ placement: CapabilityOperatorScope.placement(root.placement), input: Object.freeze({
          provider: parsed.provider, key: parsed.key, ...(parsed.label === undefined ? {} : { label: parsed.label }),
        }), label })
      })
      return Effect.gen(function* () {
        if (!captured.ok) return yield* unavailable()
        const value = captured.value
        const target = Object.freeze({ action: "connection.connect", placement: value.placement,
          resource: Object.freeze({ kind: "provider", id: value.input.provider }) })
        const binding = yield* operators.require(target)
        yield* project(database.db, value.placement)
        const validate = Effect.gen(function* () {
          if ((yield* operators.require(target)) !== binding) return yield* mismatch()
          yield* operators.validate(binding, target)
        })
        const verify = (tx: CapabilityRequestContract.Transaction) => validate.pipe(
          Effect.andThen(project(tx, value.placement)))
        const previous = yield* ledger.reconcile(target, value.input, verify).pipe(
          Effect.withSpan("CapabilityConnectionSetup.reconcile"))
        if (previous) return previous
        if (!database.inTransaction) return yield* Effect.die("Capability setup requires SQL transaction identity")
        if (yield* database.inTransaction) return yield* mismatch()
        yield* validate
        // Only a missing receipt reaches the verifier. No network occurs in the writer callback.
        const result = yield* verifier.verify(value.input)
        yield* validate
        const proof = capture(result, decode(Proof))
        if (!proof.ok || proof.value.provider !== value.input.provider ||
          proof.value.endpoint !== endpoints[value.input.provider] ||
          proof.value.integrationID !== `capability.${value.input.provider}` ||
          proof.value.subjectID !== proof.value.subjectID.trim() || proof.value.subjectID.includes(value.input.key))
          return yield* unavailable()
        if (value.input.provider === "discord" && !/^[0-9]{1,20}(?![\s\S])/.test(proof.value.subjectID)) return yield* unavailable()
        if (value.input.provider === "slack") {
          const subject = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(proof.value.subjectID).pipe(
            Option.flatMap(Schema.decodeUnknownOption(SlackSubject)))
          if (Option.isNone(subject) || JSON.stringify(subject.value) !== proof.value.subjectID) return yield* unavailable()
        }
        if (proof.value.scopeHash.toLowerCase() !== createHash("sha256").update(JSON.stringify([
          value.input.provider, proof.value.endpoint, proof.value.subjectID,
          createHash("sha256").update(value.input.key).digest("hex"),
        ])).digest("hex")) return yield* unavailable()
        return yield* ledger.commit(target, value.input, (tx) => Effect.gen(function* () {
          const credentialID = Credential.ID.create()
          const connection = Object.freeze({ id: Capability.ConnectionID.create(), provider: value.input.provider, generation: 0 })
          yield* tx.insert(CredentialTable).values({ id: credentialID, integration_id: proof.value.integrationID,
            label: value.label, value: { type: "key", key: value.input.key } }).run()
          yield* tx.insert(CapabilityConnectionTable).values({ id: connection.id, project_id: value.placement.projectID,
            directory: value.placement.location.directory, workspace_id: value.placement.location.workspaceID,
            provider: connection.provider, label: value.label, integration_id: proof.value.integrationID, credential_id: credentialID,
            subject_id: proof.value.subjectID, endpoint: proof.value.endpoint, scope_hash: proof.value.scopeHash.toLowerCase(),
            generation: connection.generation, state: "active" }).run()
          return { connection, verification: "verified" }
        }), verify).pipe(Effect.withSpan("CapabilityConnectionSetup.commit"))
      })
    }
    return Object.freeze({ connect }) satisfies CapabilityConnectionSetupContract.Interface
  })
}

export type Interface = CapabilityConnectionSetupContract.Interface

function unavailable() {
  return new Capability.Failure({ code: "connection_unavailable", message: "Capability connection is unavailable" })
}

function mismatch() {
  return new Capability.Failure({ code: "invocation_binding_mismatch", message: "Capability request binding does not match" })
}
