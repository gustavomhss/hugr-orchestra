import { Actions } from "@orchestra/core/actions"
import { TransferQuery } from "@orchestra/protocol/groups/actions-transfer"
import { BindingID } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { apiError, bindingRef, result } from "./actions-common"

export const ActionsTransferHandler = HttpApiBuilder.group(Api, "server.actionsTransfer", (handlers) => Effect.succeed(
  handlers
    .handle("actions.transfer.info", (ctx) => result(Effect.gen(function* () {
      const actions = yield* Actions.Service
      return yield* actions.transferInfo(bindingRef(ctx), {
        kind: ctx.query.kind, id: ctx.query.id, runID: ctx.query.runID, attempt: ctx.query.attempt, path: ctx.query.path,
      })
    })))
    .handleRaw("actions.transfer.read", (ctx) => Effect.gen(function* () {
      const url = new URL(ctx.request.url, "http://localhost")
      const query = yield* Schema.decodeUnknownEffect(TransferQuery)(Object.fromEntries(url.searchParams)).pipe(
        Effect.mapError(() => apiError(new Actions.ActionsError({ kind: "invalid_input", message: "Invalid Actions transfer query" }))),
      )
      const id = yield* Schema.decodeUnknownEffect(BindingID)(decodeURIComponent(url.pathname.split("/").at(-1) ?? "")).pipe(
        Effect.mapError(() => apiError(new Actions.ActionsError({ kind: "invalid_input", message: "Invalid Actions transfer binding" }))),
      )
      const actions = yield* Actions.Service
      const target = { kind: query.kind, id: query.id, runID: query.runID, attempt: query.attempt, path: query.path }
      const binding = { id, revision: query.revision }
      const info = yield* actions.transferInfo(binding, target).pipe(Effect.mapError(apiError))
      return HttpServerResponse.stream(actions.transfer(binding, target), {
        contentType: info.contentType,
        headers: { "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(info.filename)}`,
          ...(info.size === undefined ? {} : { "content-length": String(info.size) }) },
      })
    })),
))
