import path from "path"
import { createHash } from "crypto"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { Relay } from "@orchestra/core/relay"
import { RelayHookInstall } from "@orchestra/core/relay-hook-install"
import {
  RelayConflictError,
  RelayInvalidError,
  RelayNotFoundError,
  RelayUnavailableError,
} from "@orchestra/protocol/groups/relay-document"
import { RelayHookDecision } from "@orchestra/protocol/groups/relay-hook"
import { AuthoringHook } from "@orchestra/relay/authoring/hook"
import type { AuthoringStore } from "@orchestra/relay/authoring/store"
import { RelayJson } from "@orchestra/relay/json"
import { LedgerRead } from "@orchestra/relay/ledger/read"
import { Effect, Layer, Schema } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"
import { Principal } from "../principal"
import { RelayDocuments } from "../relay-documents"

export const RelayHookHandler = HttpApiBuilder.group(Api, "server.relay.hook", (handlers) =>
  Effect.gen(function* () {
    const documents = yield* RelayDocuments.Service
    // hooks.json is written with the process-global FSUtil, captured here like the agent file routes do.
    const fs = yield* FSUtil.Service
    const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      RelayDocuments.respond(
        effect.pipe(
          Effect.provideService(FSUtil.Service, fs),
          Effect.catchIf(
            (error): error is Extract<E, RelayHookInstall.Refused> => error instanceof RelayHookInstall.Refused,
            (error) => Effect.fail(refused(error)),
          ),
        ),
      )
    // The published version of a hook document, compiled to the export an install pins, and its sha256.
    const pinned = (documentID: string, version: string | undefined) =>
      documents.use((store) => pin(store, documentID, version))

    return handlers
      .handle("relay.hook.list", () => run(Effect.flatMap(binding, RelayHookInstall.read)))
      .handle("relay.hook.install", (ctx) =>
        run(
          Effect.gen(function* () {
            const changed = yield* RelayHookInstall.install({
              ...(yield* binding),
              ...(yield* pinned(ctx.payload.document, ctx.payload.version)),
              document: ctx.payload.document,
              principal: Principal.of(ctx.request),
            })
            return yield* receipt(changed)
          }),
        ),
      )
      .handle("relay.hook.update", (ctx) =>
        run(
          Effect.gen(function* () {
            const bound = yield* binding
            const current = (yield* RelayHookInstall.read(bound)).installs.find(
              (item) => item.installID === ctx.params.installID,
            )
            if (!current)
              return yield* new RelayHookInstall.Refused({
                reason: "install-missing",
                message: `No installed hook ${ctx.params.installID}.`,
              })
            const changed = yield* RelayHookInstall.update({
              ...bound,
              ...(yield* pinned(current.document, ctx.payload.version)),
              installID: ctx.params.installID,
              principal: Principal.of(ctx.request),
            })
            return yield* receipt(changed)
          }),
        ),
      )
      .handle("relay.hook.enable", (ctx) =>
        run(
          binding.pipe(
            Effect.flatMap((bound) =>
              RelayHookInstall.setEnabled({
                ...bound,
                installID: ctx.params.installID,
                enabled: true,
                principal: Principal.of(ctx.request),
              }),
            ),
            Effect.flatMap(receipt),
          ),
        ),
      )
      .handle("relay.hook.disable", (ctx) =>
        run(
          binding.pipe(
            Effect.flatMap((bound) =>
              RelayHookInstall.setEnabled({
                ...bound,
                installID: ctx.params.installID,
                enabled: false,
                principal: Principal.of(ctx.request),
              }),
            ),
            Effect.flatMap(receipt),
          ),
        ),
      )
      .handle("relay.hook.order", (ctx) =>
        run(
          binding.pipe(
            Effect.flatMap((bound) => RelayHookInstall.reorder({ ...bound, installIDs: ctx.payload.installIDs })),
            Effect.map((installs) => ({ installs })),
          ),
        ),
      )
      .handle("relay.hook.uninstall", (ctx) =>
        run(
          binding.pipe(
            Effect.flatMap((bound) =>
              RelayHookInstall.uninstall({
                ...bound,
                installID: ctx.params.installID,
                principal: Principal.of(ctx.request),
              }),
            ),
            Effect.flatMap(receipt),
          ),
        ).pipe(Effect.as(HttpApiSchema.NoContent.make())),
      )
      .handle("relay.hook.decisions", (ctx) => run(decisions(ctx.params.installID)))
      .handle("relay.hook.repair", (ctx) =>
        run(
          Effect.gen(function* () {
            const repaired = yield* RelayHookInstall.repair(yield* binding)
            // hooks.json has no ledger of its own; the repair is logged with who asked for it.
            yield* Effect.logWarning("relay hooks.json repaired", {
              backup: repaired.backup,
              principal: Principal.of(ctx.request),
            })
            return repaired
          }),
        ),
      )
  }),
).pipe(Layer.provide(RelayDocuments.layer))

// hooks.json is keyed by `Global.data` and the project ID, and Relay's data root is `<Global.data>/relay/<projectID>`.
const binding = Effect.gen(function* () {
  const relay = yield* Relay.Service
  const location = yield* Location.Service
  return { data: path.dirname(path.dirname(relay.paths.root)), projectID: location.project.id }
})

/**
 * An install pins the published version only: `version`, when sent, must be the one published now, so republishing
 * changes nothing until an explicit update.
 */
const pin = Effect.fnUntraced(function* (
  store: AuthoringStore.Interface,
  documentID: string,
  version: string | undefined,
) {
  const document = yield* store.get(documentID)
  const published = document.activeVersionId
  if (!published || (version !== undefined && version !== published))
    return yield* RelayDocuments.refusal(
      "Only the published version of a hook can be installed; publish it first",
      409,
      "not-published",
    )
  const body = yield* store.version(documentID, published)
  if (!AuthoringHook.isHook(body))
    return yield* RelayDocuments.refusal("This document is a workflow, not a hook", 400, "not-a-hook")
  const snapshot = yield* AuthoringHook.compile(body)
  const text = yield* RelayJson.compact(snapshot).pipe(
    Effect.mapError(() =>
      RelayDocuments.refusal("The hook export is not JSON Relay can record", 400, "snapshot-invalid"),
    ),
  )
  return { version: published, snapshot, sha256: createHash("sha256").update(text).digest("hex") }
})

// Every lifecycle change is receipted in the install's ledger. The change is already written, so a receipt that
// cannot be recorded is reported rather than passed off as a clean success.
const receipt = Effect.fnUntraced(function* (changed: RelayHookInstall.Changed) {
  const relay = yield* Relay.Service
  yield* relay.record(changed.install.installID, changed.receipt).pipe(
    Effect.mapError(
      () =>
        new RelayUnavailableError({
          code: "receipt-unrecorded",
          message: `The hook change was saved, but its ${changed.receipt.event} receipt could not be recorded.`,
        }),
    ),
  )
  return changed.install
})

const decisions = Effect.fnUntraced(function* (installID: string) {
  // Install IDs name ledger directories; anything else cannot name one.
  if (!INSTALL_ID.test(installID))
    return yield* new RelayNotFoundError({ code: "install-missing", message: `No hook ledger for ${installID}.` })
  const relay = yield* Relay.Service
  const invalid = (message: string) => new RelayConflictError({ code: "ledger-invalid", message })
  const entries = yield* LedgerRead.entries(path.join(relay.paths.hooks, installID, "ledger.jsonl")).pipe(
    Effect.catchTag("LedgerRead.Missing", () => Effect.succeed([])),
    Effect.mapError((error) => invalid(`The hook ledger cannot be read: ${error.reason}`)),
  )
  return yield* Effect.forEach(entries.filter((entry) => entry.event === "hook-decision").slice(-DECISIONS), (entry) =>
    Schema.decodeUnknownEffect(RelayHookDecision)(entry).pipe(
      Effect.mapError((error) => invalid(`A hook decision in the ledger is malformed: ${error.message}`)),
    ),
  )
})

function refused(error: RelayHookInstall.Refused) {
  const fields = { code: error.reason, message: error.message }
  if (error.reason === "install-missing") return new RelayNotFoundError(fields)
  if (error.reason === "snapshot-invalid") return new RelayInvalidError(fields)
  if (UNAVAILABLE.has(error.reason)) return new RelayUnavailableError(fields)
  return new RelayConflictError(fields)
}

const INSTALL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/
const DECISIONS = 500
const UNAVAILABLE = new Set<RelayHookInstall.Reason>([
  "profile-project-invalid",
  "profile-state-root-acquisition",
  "profile-read-acquisition",
  "profile-write-acquisition",
])
