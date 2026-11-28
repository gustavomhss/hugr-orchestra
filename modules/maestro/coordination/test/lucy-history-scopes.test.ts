import { expect, test } from "bun:test"
import { Effect } from "effect"
import { SessionSchema } from "@orchestra/core/session"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { run, sourcePath, sourceText } from "./fixture/lucy-engagement"
import { decoded } from "./fixture/lucy-engagement-artifacts"
import { variantAdapter } from "./fixture/lucy-engagement-variant-adapter"
import { code, completed, history, native, request, script } from "./fixture/lucy-history"

for (const profile of ["audit", "diligence"] as const) {
  test(`H08 ${profile}: forensics is a native lead skill, without sibling or native-file grants`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => {
      const provider = script([code,
        { id: "forensics", name: "skill", input: { name: "lucy-audit-forensics" } },
        { id: "positive-history", name: "review_history", input: { op: "show", path: sourcePath } },
        { id: "compliance", name: "skill", input: { name: "lucy-audit-compliance" } },
        { id: "artifact", name: "skill", input: { name: "lucy-review-artifact" } },
        { id: "read", name: "read", input: { filePath: sourcePath } },
        { id: "grep", name: "grep", input: { pattern: "sharedValue" } },
        { id: "glob", name: "glob", input: { pattern: "**/*" } },
        { id: "atlas", name: "atlas_context", input: { query: "sharedValue" } },
      ])
      return root.open((host) => Effect.gen(function* () {
        yield* host.prepareIndex()
        const report = decoded(yield* host.invoke(request("forensics-" + profile, profile)))
        yield* completed(host, report.sessionID, code.id)
        const forensic = yield* completed(host, report.sessionID, "forensics")
        expect(forensic.text).toContain('name="lucy-audit-forensics"')
        expect(forensic.text).toContain("never rate developers")
        expect((yield* history(host, report, "positive-history")).value.text).toBe(sourceText)
        const scope = yield* host.store.scope(SessionSchema.ID.make(report.sessionID))
        expect(scope?.scope.skills.allow).toContain("lucy-audit-forensics")
        expect(scope?.held).toContain("lucy-audit-forensics")
        expect(scope?.scope.tools).toContain("review_history")
        for (const name of ["lucy-audit-compliance", "lucy-review-artifact", "lucy-audit-variant"])
          expect(scope?.scope.skills.allow).not.toContain(name)
        const events = yield* native(host, report.sessionID)
        for (const id of ["compliance", "artifact", "read", "grep", "glob", "atlas"]) {
          const event = events.find((call) => call.toolCallID === id)
          expect(event?.state.status, event?.text).toBe("error")
        }
      }), variantAdapter(provider.stream))
    }))
  }, 150_000)

  for (const leaf of ["context", "spec-map", "controls", "report", ...(profile === "diligence" ? ["diligence"] : [])]) {
    test(`H08 preservation: ${profile} lead can load the exact ${leaf} leaf`, () => {
      expectSpawn(import.meta.path)
      return Effect.runPromise(run((root) => {
        const name = "lucy-audit-" + leaf
        const provider = script([code, { id: "leaf", name: "skill", input: { name } }])
        return root.open((host) => Effect.gen(function* () {
          yield* host.prepareIndex()
          const report = decoded(yield* host.invoke(request("leaf-" + profile + "-" + leaf, profile)))
          yield* completed(host, report.sessionID, code.id)
          expect((yield* completed(host, report.sessionID, "leaf")).text).toContain('name="' + name + '"')
          const scope = yield* host.store.scope(SessionSchema.ID.make(report.sessionID))
          expect(scope?.scope.skills.allow).toContain(name)
          expect(scope?.held).toContain(name)
        }), variantAdapter(provider.stream))
      }))
    }, 120_000)
  }
}

test("H08 artifact keeps its own leaf while history and audit forensic ancestry are inapplicable", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => {
    const provider = script([code,
      { id: "artifact", name: "skill", input: { name: "lucy-review-artifact" } },
      { id: "forensics", name: "skill", input: { name: "lucy-audit-forensics" } },
      { id: "diligence", name: "skill", input: { name: "lucy-audit-diligence" } },
      { id: "variant", name: "skill", input: { name: "lucy-audit-variant" } },
      { id: "history", name: "review_history", input: { op: "show", path: sourcePath } },
    ])
    return root.open((host) => Effect.gen(function* () {
      yield* host.prepareIndex()
      const report = decoded(yield* host.invoke(request("artifact-no-forensics", "artifact")))
      yield* completed(host, report.sessionID, code.id)
      expect((yield* completed(host, report.sessionID, "artifact")).text).toContain('name="lucy-review-artifact"')
      const scope = yield* host.store.scope(SessionSchema.ID.make(report.sessionID))
      expect(scope?.scope.tools).not.toContain("review_history")
      expect(scope?.scope.skills.allow).not.toContain("lucy-audit-forensics")
      const events = yield* native(host, report.sessionID)
      for (const id of ["forensics", "diligence", "variant", "history"])
        expect(events.find((event) => event.toolCallID === id)?.state.status).toBe("error")
      expect(report.notExamined).toContainEqual({ item: "artifact:behavioral-eval", reason: "owner-permission" })
      expect(report.notExamined).toContainEqual({ item: "engagement:history", reason: "profile-not-applicable" })
    }), variantAdapter(provider.stream))
  }))
}, 150_000)

for (const at of ["lens", "verify"] as const) {
  test(`H08 ${at} children preserve their source access and never inherit lead forensics/history`, () => {
    expectSpawn(import.meta.path)
    return Effect.runPromise(run((root) => {
      const provider = script([code,
        { id: "forensics", name: "skill", input: { name: "lucy-audit-forensics" } },
        { id: "history", name: "review_history", input: { op: "show", path: sourcePath } },
      ], Effect.void, { at, quote: true })
      return root.open((host) => Effect.gen(function* () {
        yield* host.prepareIndex()
        const report = decoded(yield* host.invoke(request("child-" + at, "diligence")))
        expect(report.status).toBe("completed")
        expect(provider.started.size).toBeGreaterThan(0)
        for (const id of provider.started) {
          expect(id).not.toBe(report.sessionID)
          yield* completed(host, id, code.id)
          const scope = yield* host.store.scope(SessionSchema.ID.make(id))
          expect(scope?.scope.skills.allow).not.toContain("lucy-audit-forensics")
          expect(scope?.scope.tools).not.toContain("review_history")
          const events = yield* native(host, id)
          for (const name of ["forensics", "history"])
            expect(events.find((event) => event.toolCallID === name)?.state.status).toBe("error")
        }
      }), variantAdapter(provider.stream))
    }))
  }, 150_000)
}

