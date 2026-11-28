import { expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Effect, Schema, Tracer } from "effect"
import { GitCli } from "@orchestra/core/git-cli"
import { ReviewHistory } from "@orchestra/core/review-toolkit/history"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionMessageTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { run, sourcePath } from "./fixture/lucy-engagement"
import { blobRoot, blobs, canonical, decoded, digest, reader, refused, required } from "./fixture/lucy-engagement-artifacts"
import { commit } from "./fixture/lucy-engagement-artifact-limits"
import { decodedFix, fixedText, fixRequest, fixScript } from "./fixture/lucy-fix-review"
import { fixReceipt } from "./fixture/lucy-fix-review-evidence"
import { history, request, retained } from "./fixture/lucy-history"
import { nativeCalls, variantScript } from "./fixture/lucy-variants"

const object = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))
const Settlement = Schema.Struct({
  schema: Schema.Literal("review-engagement-history-settlement-v1"),
  historyID: Schema.String, uri: Schema.String, truncated: Schema.Boolean,
  resultSha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)), resultBytes: Schema.Number,
})

/**
 * Integration supplement prepared after the first local A05 runtime candidate.
 * Its hosted baseline precedes remote production publication; the earlier frozen cases are unchanged.
 */
test("H06/H10 an imported historical predecessor remains bound to its native settlement on every public fix read and replay", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const priorProvider = variantScript({ override: (turn) => turn.kind === "entry" && turn.index === 0
      ? nativeCalls([{ id: "prior_history", name: "review_history",
          input: { op: "show", path: sourcePath, rev: root.base } }])
      : undefined })
    const provider = fixScript({ prior: priorProvider.stream })
    const gitCalls: string[][] = []
    const processes = { started: 0 }
    const tracer = Tracer.make({ span: (options) => {
      if (options.name === "ResearchProcess.run") processes.started++
      return new Tracer.NativeSpan(options)
    } })
    yield* root.open((host) => Effect.gen(function* () {
      const priorInput = request("history-fix-prior", "diligence")
      const priorOutput = yield* host.invoke(priorInput)
      const prior = decoded(priorOutput)
      expect(prior.status).toBe("completed")
      expect(prior.report?.profile).toBe("diligence")
      expect(prior.report?.findings.some((finding) => finding.evidence.kind === "quote")).toBe(true)
      expect((yield* history(host, prior, "prior_history")).value.text).toContain("ENGAGEMENT-BASE")
      const previous = yield* retained(host, prior)
      expect(previous.proofs).toHaveLength(1)
      const historical = previous.proofs[0]
      expect(historical.proof.result.complete).toBe(true)
      expect(historical.proof.result.truncated).toBe(false)

      const revision = yield* commit(root, { [sourcePath]: fixedText })
      const input = fixRequest(prior, "history-fix-followup", revision)
      const output = yield* host.invoke(input)
      const report = decodedFix(output)
      expect(report.status).toBe("completed")
      expect(report.dispositions.map((entry) => entry.disposition)).toEqual(["resolved"])
      const evidence = yield* fixReceipt(host, report)
      expect(evidence.value.prior.artifactIDs).toContain(historical.artifact.artifactID)
      expect(evidence.value.artifacts.find((artifact) => artifact.artifactID === historical.artifact.artifactID))
        .toEqual(historical.artifact)
      expect(required(evidence.bodies, historical.artifact.artifactID)).toEqual(historical.bytes)
      expect(required(evidence.bodies, evidence.value.prior.receiptArtifactID)).toEqual(previous.bytes)
      expect((yield* host.invoke(input)).text).toBe(output.text)

      // Both real Git entry points have positive controls before their zero-replay observations.
      const git = yield* GitCli.Service
      const beforeCli = gitCalls.length
      const cliControl = yield* git.run(["rev-parse", "--verify", "HEAD"], {
        cwd: root.directory, timeout: "5 seconds", maxOutputBytes: 4096,
      })
      expect(cliControl.exitCode).toBe(0)
      expect(cliControl.truncated).toBe(false)
      expect(cliControl.text().trim()).toBe(revision)
      expect(gitCalls.length).toBe(beforeCli + 1)
      const beforeProcesses = processes.started
      const processControl = yield* ReviewHistory.run({ op: "log", rev: revision },
        { repository: root.directory, executionSessionID: prior.sessionID })
      expect(processControl.argv[0]).toBe("git")
      expect(processControl.raw).toContain(revision)
      expect(processControl.truncated).toBe(false)
      expect(processes.started).toBe(beforeProcesses + 1)

      const messageID = SessionMessage.ID.make(historical.proof.assistantMessageID)
      const row = yield* host.db.select().from(SessionMessageTable)
        .where(eq(SessionMessageTable.id, messageID)).get().pipe(Effect.orDie)
      if (!row || row.type !== "assistant") return yield* Effect.die("original native assistant row is missing")
      expect(row.session_id).toBe(prior.sessionID)
      const content = Schema.decodeUnknownSync(Schema.Array(Schema.Record(Schema.String, Schema.Unknown)))(
        Reflect.get(row.data, "content"))
      const matches = content.filter((part) => part.type === "tool" && part.id === historical.proof.toolCallID)
      expect(matches).toHaveLength(1)
      const original = matches[0]
      if (!original) return yield* Effect.die("original native history part is missing")
      expect(original.name).toBe("review_history")
      const state = object(original.state)
      expect(state.status).toBe("completed")
      const structured = object(state.structured)
      const settlement = Schema.decodeUnknownSync(Settlement)(structured.review, { onExcessProperty: "error" })
      expect(settlement.historyID).toBe(historical.proof.historyID)
      expect(settlement.resultSha256).toBe(digest(canonical(historical.proof.result)))
      expect(settlement.resultBytes).toBe(Buffer.byteLength(canonical(historical.proof.result)))
      const replacement = (settlement.resultSha256[0] === "0" ? "1" : "0") + settlement.resultSha256.slice(1)
      const altered = { ...row.data, content: content.map((part) => part === original ? {
        ...part, state: { ...state, structured: { ...structured, review: { ...settlement, resultSha256: replacement } } },
      } : part) }
      expect(replacement).not.toBe(settlement.resultSha256)
      const stored = yield* blobs(blobRoot(root, host))
      const requests = root.requests.length
      const reads = gitCalls.length
      const started = processes.started

      yield* Effect.gen(function* () {
        yield* host.db.update(SessionMessageTable).set({ data: altered })
          .where(eq(SessionMessageTable.id, messageID)).run().pipe(Effect.orDie)
        const changed = yield* host.db.select().from(SessionMessageTable)
          .where(eq(SessionMessageTable.id, messageID)).get().pipe(Effect.orDie)
        expect(changed?.data).toEqual(altered)
        // The ordinary reader witnesses the exact same corrupted predecessor binding.
        refused(yield* host.call(reader, { op: "manifest", reportID: prior.reportID }), "engagement-evidence-corrupt")
        // These paths must validate the imported predecessor, not just the current fix's own bodies.
        refused(yield* host.call(reader, { op: "manifest", reportID: report.reportID }), "engagement-evidence-corrupt")
        refused(yield* host.call(reader, { op: "read", reportID: report.reportID,
          artifactID: historical.artifact.artifactID }), "engagement-evidence-corrupt")
        refused(yield* host.invoke(input), "engagement-evidence-corrupt")
        expect(root.requests.length).toBe(requests)
        expect(gitCalls.length).toBe(reads)
        expect(processes.started).toBe(started)
        expect(yield* blobs(blobRoot(root, host))).toEqual(stored)
      }).pipe(Effect.ensuring(host.db.update(SessionMessageTable).set({ data: row.data })
        .where(eq(SessionMessageTable.id, messageID)).run().pipe(Effect.orDie)))
      expect((yield* host.invoke(priorInput)).text).toBe(priorOutput.text)
      expect((yield* host.invoke(input)).text).toBe(output.text)
      const restored = yield* fixReceipt(host, report)
      expect(restored.index).toEqual(evidence.index)
      expect(restored.bytes).toEqual(evidence.bytes)
      expect(restored.bodies).toEqual(evidence.bodies)
      expect((yield* retained(host, prior)).bytes).toEqual(previous.bytes)
      expect(root.requests.length).toBe(requests)
      expect(gitCalls.length).toBe(reads)
      expect(processes.started).toBe(started)
      expect(yield* blobs(blobRoot(root, host))).toEqual(stored)
    }), { stream: provider.stream, onGit: (args) => { gitCalls.push([...args]) } }).pipe(Effect.withTracer(tracer))
  })))
}, 240_000)

