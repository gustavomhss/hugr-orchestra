import { Effect } from "effect"
import { isDeepStrictEqual } from "node:util"
import { Research } from "@orchestra/schema/research"
import { AppProcess } from "@orchestra/core/process"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ProbeRun } from "@orchestra/core/research-toolkit/probe/run"
import { Probe } from "@orchestra/core/research-toolkit/probe/types"
import { ResearchExecution } from "@/research/allowance"
import { ResearchTools } from "@/research/binding"
import { ResearchInquiry } from "@/research/inquiry"
import { ResearchSourceCapture } from "@/research/source-capture"
import { Tool } from "./tool"
import { ToolJsonSchema } from "./json-schema"
import DESCRIPTION from "./probe-run.txt"

// The verdicts that end a probe early, as the named failures the seat reads (J4.7, JE-AC-P5).
const FAILURE: Partial<Record<Probe.Verdict, "probe_timeout" | "probe_memory">> = { timeout: "probe_timeout", memory_exceeded: "probe_memory" }

// J4: one closed runner in a fresh jailed snapshot (core ProbeRun), charged in probe seconds (J1.10), retained as
// citable structured JSON even when it fails (J4.9), and with a hypothesis recorded against it (J4.10).
export const ProbeRunTool = Tool.define("probe_run", Effect.gen(function* () {
  const processes = yield* AppProcess.Service
  const records = yield* ResearchRecords.Service
  const execution = yield* ResearchExecution.Service
  const run = yield* ResearchTools.make
  return {
    description: DESCRIPTION,
    parameters: Probe.ProbeInput,
    jsonSchema: ToolJsonSchema.fromSchema(Probe.ProbeInput),
    execute: (input: Probe.ProbeInput, ctx: Tool.Context) => run(ctx, "probe_run", (binding, context) => Effect.gen(function* () {
      const frame = yield* ResearchExecution.Current
      const capture = yield* ResearchSourceCapture.Current
      if (!frame || !capture || !isDeepStrictEqual(frame.allowance.binding, binding))
        return yield* new Research.Error({ code: "binding_missing", message: "probe_run runs only inside its native research dispatch" })
      const allowance = frame.allowance
      // The hypothesis must be open before anything runs, so a probe never spends seconds it cannot record.
      const hypothesis = input.hypothesis ? yield* open(records, allowance, input.hypothesis) : undefined
      const result = yield* execution.probe(ctx.sessionID, typeof ctx.extra?.callKey === "string" ? ctx.extra.callKey : `${ctx.messageID}:${ctx.callID}`,
        (remainingSeconds) => ProbeRun.run(input, {
          worktree: binding.worktree, executionSessionID: binding.executionSessionID,
          dispatchID: `${binding.executionSessionID}:${allowance.dispatchCallID}`, remainingSeconds,
        }).pipe(
          Effect.provideService(AppProcess.Service, processes),
          Effect.mapError((error) => new Research.Error({ code: error.code,
            message: `${error.code}: ${error.reason}${error.options ? ` (options: ${error.options.join(", ")})` : ""}` })),
        ))
      const uri = ProbeRun.uri(binding.executionSessionID, result.probeID)
      const script = input.runner.kind === "script" ? (yield* capture({ origin: { kind: "tool-output", uri: `${uri}/script` },
        representation: "text", mediaType: "text/plain", content: input.runner.source, complete: true })).ref : undefined
      const retained: Probe.ProbeResult = script ? { ...result, script } : result
      const receipt = yield* capture({ origin: { kind: "tool-output", uri }, representation: "structured-json",
        mediaType: "application/json", content: JSON.stringify(retained), complete: true })
      const relation = !hypothesis ? undefined
        : result.verdict === "not_reproduced" ? "refutes" as const
        : input.expect && (result.verdict === "reproduced" || result.verdict === "passed") ? "supports" as const : undefined
      if (hypothesis && relation) {
        const write = (record: Research.RecordInput, slot: string) => records.record(binding, context, record, slot).pipe(
          Effect.flatMap((mutation) => mutation.record ? Effect.succeed({ id: mutation.record.id, revision: mutation.record.revision })
            : Effect.fail(new Research.Error({ code: "publication_uncertain", message: "Probe observation was not retained" }))))
        const observation = yield* write({ action: "finding", nature: "observation", conditions: [], contrary: [],
          proposition: `probe ${result.probeID} ${result.verdict}: ${hypothesis.proposition}`.slice(0, 8192),
          evidence: [{ source: receipt.ref, locator: { kind: "json", pointer: "/verdict" } }] }, "probe:observation")
        yield* write({ action: "relation", from: observation, to: hypothesis.ref, relation, reason: `probe ${result.verdict}` }, "probe:relation")
      }
      const failure = FAILURE[result.verdict]
      return {
        title: `${failure ?? result.verdict}: probe ${result.runner.kind}`,
        output: JSON.stringify({ ...(failure ? { error: failure } : {}), source: receipt.ref,
          ...(hypothesis ? { hypothesis: { ref: hypothesis.ref, resolved: relation ?? null } } : {}), ...retained }),
        metadata: { researchSource: receipt, truncated: result.stdout.truncated || result.stderr.truncated },
      }
    })).pipe(Effect.orDie),
  }
}))

const open = Effect.fnUntraced(function* (records: ResearchRecords.Interface, allowance: Research.Allowance, ref: Research.RecordRef) {
  const found = ResearchInquiry.fold(yield* records.dispatch(allowance)).hypotheses.find((item) => item.ref.id === ref.id)
  if (!found || found.status !== "open")
    return yield* new Research.Error({ code: "inquiry_state", message: `${ref.id} is not an open hypothesis of this inquiry` })
  return found
})
