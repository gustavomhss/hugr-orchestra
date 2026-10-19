import { Actions } from "@orchestra/schema/actions"
import { Effect } from "effect"
import { check } from "./assertions"
import { actionPath, decodeLocation, nativeCalls, seedBinding } from "./actions-fixture"
import { jobID, logText, root, runID } from "./actions-native-data"
import { http } from "./dsl"
import type { Scenario } from "./types"

const query = { kind: "jobLog", id: jobID, runID, attempt: "4" }

export const actionsTransferScenarios: Scenario[] = [
  http.protected.get("/api/actions/transfer/{bindingID}/info", "actions.transfer.info.job-log")
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath("/api/actions/transfer/{bindingID}/info", ctx.state.ref, {}, query), headers: ctx.headers() }))
    .jsonEffect(200, (body, ctx) => Effect.gen(function* () {
      const info = decodeLocation(Actions.TransferInfo, body, ctx.state)
      check(info.filename === `job-${jobID}-attempt-4.log` && info.contentType === "text/plain", "transfer metadata must retain job and pinned attempt")
      check(info.size === undefined, "unobserved log size must stay absent")
      const calls = yield* nativeCalls(ctx.state)
      check(calls.some((call) => call.endpoint === `${root}/actions/runs/${runID}/attempts/4`), "transfer ownership must prove native run/attempt")
      check(calls.every((call) => call.metadata), "transfer metadata must not open raw output")
    }), "status"),
  // Full-body capture is deliberate: fixture is tiny UTF-8, so this proves EOF and every byte.
  http.protected.get("/api/actions/transfer/{bindingID}", "actions.transfer.read.job-log")
    .seeded(seedBinding)
    .at((ctx) => ({ path: actionPath("/api/actions/transfer/{bindingID}", ctx.state.ref, {}, query), headers: ctx.headers() }))
    .status(200, (ctx, result) => Effect.gen(function* () {
      check(result.contentType.includes("text/plain") && result.text === logText, "raw HTTP stream must return complete exact tiny native log")
      check(Buffer.byteLength(result.text) === Buffer.byteLength(logText) && Buffer.byteLength(result.text) < 64, "transfer fixture must remain bounded")
      const calls = yield* nativeCalls(ctx.state)
      const raw = calls.filter((call) => !call.metadata)
      check(raw.length === 1 && raw[0].method === "GET" && raw[0].endpoint === `${root}/actions/jobs/${jobID}/logs`, "raw route must reach production native byte transport once")
    }), "status"),
]
