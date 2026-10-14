import { describe, expect, test } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { Schema } from "effect"
import type { ActionsPending } from "./commands"
import { fixture, located } from "./commands.fixture"

const outcomes: readonly { state: Actions.Operation["state"]; error?: string }[] = [
  { state: "rejected", error: "operation_rejected" },
  { state: "expired", error: "operation_expired" },
  { state: "sending", error: "outcome_unknown" },
  { state: "outcome_unknown", error: "outcome_unknown" },
  { state: "prepared", error: "outcome_unknown" },
  { state: "accepted" },
  { state: "confirmed" },
]
const phases: readonly ("prepare" | "execute")[] = ["prepare", "execute"]

describe("Actions definitive and ambiguous receipts", () => {
  phases.forEach((phase) => {
    outcomes.filter((item) => phase !== "prepare" || item.state !== "prepared").forEach((item) => {
      test(`${phase} ${item.state}: classify receipt consistently on initial response and refresh`, async () => {
        using scope = fixture("github", async (request) => {
          const path = new URL(request.url).pathname
          if (phase === "prepare" && path === "/api/actions/operation/ab_native" && request.method === "POST") {
            const intent = Schema.decodeUnknownSync(Actions.OperationIntent)(await request.json())
            scope.intents.push(intent)
            const operation = Actions.Operation.make({ id: Actions.OperationID.make("aop_native"), bindingID: intent.binding.id, clientID: intent.clientID,
              kind: intent.kind, target: intent.target, state: item.state, createdAt: 1, expiresAt: 100, updatedAt: 2, reason: "credential secret" })
            scope.receipts.push(operation)
            return located(operation)
          }
          if (phase !== "execute" || !path.endsWith("/retry")) return
          const prepared = scope.receipts.at(-1)
          if (!prepared) throw new Error("missing admitted receipt")
          const operation: Actions.Operation = { ...prepared, state: item.state, updatedAt: 2, reason: "credential secret" }
          scope.receipts.push(operation)
          return located({ operation })
        })
        scope.commands.dialog({ kind: "retry", runID: "101" })
        await scope.commands.submit({ provider: "github", mode: "all" })
        expect(scope.state.operation?.state).toBe(item.state)
        expect(scope.state.commandError?.kind).toBe(item.error)
        expect(scope.state.operation?.reason).toBeUndefined()
        expect(scope.requests.filter((request) => request.method === "POST")).toHaveLength(phase === "prepare" ? 1 : 2)
        await scope.commands.refreshReceipt()
        expect(scope.state.operation?.state).toBe(item.state)
        expect(scope.state.commandError?.kind).toBe(item.error)
        expect(scope.state.submitting).toBe(false)
        expect(JSON.stringify(scope.state.commandError ?? {})).not.toContain("secret")
        if (item.error === "outcome_unknown") {
          expect(scope.remembered.at(-1)?.operationID).toBe("aop_native")
          await scope.commands.submit({ provider: "github", mode: "all" })
          expect(scope.intents).toHaveLength(1)
          expect(scope.requests.filter((request) => request.method === "POST")).toHaveLength(phase === "prepare" ? 1 : 2)
          return
        }
        expect(scope.remembered.at(-1)).toBeUndefined()
      })
    })

    test(`${phase} definite rejection keeps sanitized native error across receipt reads`, async () => {
      using scope = fixture("github", (request) => {
        const path = new URL(request.url).pathname
        if (phase === "prepare" ? path !== "/api/actions/operation/ab_native" : !path.endsWith("/retry")) return
        const prepared = scope.receipts.at(-1)
        if (phase === "execute" && !prepared) throw new Error("missing admitted receipt")
        if (prepared) scope.receipts.push({ ...prepared, state: "rejected", reason: "credential secret" })
        return Response.json({ _tag: "ActionsError", kind: "permission_denied", disposition: "definitely_rejected",
          ...(prepared ? { operationID: prepared.id } : {}), message: "credential secret" }, { status: 400 })
      })
      scope.commands.dialog({ kind: "retry", runID: "101" })
      await scope.commands.submit({ provider: "github", mode: "all" })
      expect(scope.state.commandError?.kind).toBe("permission_denied")
      const failure = scope.state.commandError
      await scope.commands.refreshReceipt()
      expect(scope.state.commandError).toEqual(failure)
      expect(scope.state.operation?.state).toBe(phase === "execute" ? "rejected" : undefined)
      expect(scope.remembered.at(-1)).toBeUndefined()
      expect(scope.state.operation?.reason).toBeUndefined()
      expect(JSON.stringify(scope.state.commandError)).not.toContain("secret")
      expect(scope.requests.filter((request) => request.method === "POST")).toHaveLength(phase === "prepare" ? 1 : 2)
    })
  })

  outcomes.filter((item) => item.state === "rejected" || item.state === "expired").forEach((item) => {
    test(`restored ${item.state} resolves uncertainty with a safe terminal error`, async () => {
      const pending: ActionsPending = { clientID: "restored-command", binding: { id: Actions.BindingID.make("ab_native"), revision: 7 }, operationID: Actions.OperationID.make("aop_native") }
      const operation: Actions.Operation = { id: pending.operationID ?? Actions.OperationID.make("aop_native"), bindingID: pending.binding.id, clientID: pending.clientID,
        kind: "run.retry", target: { runID: "101" }, state: item.state, createdAt: 1, expiresAt: 100, updatedAt: 2, reason: "credential secret" }
      using scope = fixture("github", () => located(operation), pending)
      expect(scope.state.commandError?.kind).toBe("outcome_unknown")
      await scope.commands.refreshReceipt()
      expect(scope.state.commandError?.kind).toBe(item.error)
      expect(scope.remembered.at(-1)).toBeUndefined()
      expect(scope.requests.map((request) => request.method)).toEqual(["GET"])
    })

    test(`sent ${item.state} lease never resends when a later receipt returns prepared`, async () => {
      using scope = fixture("github", (request) => {
        if (!new URL(request.url).pathname.endsWith("/retry")) return
        const prepared = scope.receipts.at(-1)
        if (!prepared) throw new Error("missing admitted receipt")
        const operation: Actions.Operation = { ...prepared, state: item.state, updatedAt: 2 }
        scope.receipts.push(operation)
        return located({ operation })
      })
      scope.commands.dialog({ kind: "retry", runID: "101" })
      await scope.commands.submit({ provider: "github", mode: "all" })
      expect(scope.state.commandError?.kind).toBe(item.error)
      expect(scope.remembered.at(-1)).toBeUndefined()
      const prepared = scope.receipts[0]
      if (!prepared) throw new Error("missing admitted receipt")
      scope.receipts.push(prepared)
      await scope.commands.refreshReceipt()
      expect(scope.state.operation?.state).toBe("prepared")
      expect(scope.state.commandError?.kind).toBe("outcome_unknown")
      await scope.commands.submit({ provider: "github", mode: "all" })
      expect(scope.intents).toHaveLength(1)
      expect(scope.requests.filter((request) => new URL(request.url).pathname.endsWith("/retry"))).toHaveLength(1)
      expect(scope.remembered.at(-1)?.clientID).toBe(prepared.clientID)
    })
  })

  test("an unsent prepared lease retains its safe denial and permits one later explicit send", async () => {
    using scope = fixture("github", (request) => {
      if (new URL(request.url).pathname !== "/api/actions/operation/ab_native" || request.method !== "POST") return
      scope.state.capabilities = { status: "ready", value: [{ operation: "run.retry", state: "unavailable", observedAt: 1 }] }
    })
    scope.commands.dialog({ kind: "retry", runID: "101" })
    await scope.commands.submit({ provider: "github", mode: "all" })
    expect(scope.state.commandError?.kind).toBe("capability_unavailable")
    await scope.commands.refreshReceipt()
    expect(scope.state.commandError?.kind).toBe("capability_unavailable")
    expect(scope.requests.filter((request) => new URL(request.url).pathname.endsWith("/retry"))).toHaveLength(0)
    scope.state.capabilities = { status: "ready", value: [] }
    await scope.commands.submit({ provider: "github", mode: "all" })
    expect(scope.intents).toHaveLength(1)
    expect(scope.requests.filter((request) => new URL(request.url).pathname.endsWith("/retry"))).toHaveLength(1)
    expect(scope.state.operation?.state).toBe("accepted")
    expect(scope.state.commandError).toBeUndefined()
  })

  test("an earlier unsent admission denial cannot relabel a later native rejection", async () => {
    using scope = fixture("github", (request) => {
      const path = new URL(request.url).pathname
      if (path === "/api/actions/operation/ab_native" && request.method === "POST") {
        scope.state.capabilities = { status: "ready", value: [{ operation: "run.retry", state: "unavailable", observedAt: 1 }] }
        return
      }
      if (!path.endsWith("/retry")) return
      const prepared = scope.receipts.at(-1)
      if (!prepared) throw new Error("missing admitted receipt")
      const operation: Actions.Operation = { ...prepared, state: "rejected", updatedAt: 2 }
      scope.receipts.push(operation)
      return located({ operation })
    })
    scope.commands.dialog({ kind: "retry", runID: "101" })
    await scope.commands.submit({ provider: "github", mode: "all" })
    expect(scope.state.commandError?.kind).toBe("capability_unavailable")
    scope.state.capabilities = { status: "ready", value: [] }
    await scope.commands.submit({ provider: "github", mode: "all" })
    expect(scope.state.commandError?.kind).toBe("operation_rejected")
    await scope.commands.refreshReceipt()
    expect(scope.state.commandError?.kind).toBe("operation_rejected")
    expect(scope.intents).toHaveLength(1)
  })
})
