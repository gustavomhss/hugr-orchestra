# B3/v4 — complemento literal D15 e D18

Fonte `1cde2ff7a71bcf7aecb5d030917b577165135d38`; protocolo `ee2521a5b966bd505cc95bd1c733e09e12f33531`. Leitura estrita dos dois arquivos autorizados; sem alteração de claim, produto ou camada superior. Este arquivo fornece os literais adicionais solicitados pela mesma dupla, sem conceder PASS.

Corpo atual: 38080 bytes, SHA256 `12248d1cc39a27b1655f1a683f02cd1af864f87945300a86b0ee4326227a4edd`. Dossiê D13–D18 preservado: 33794 bytes, SHA256 `fb2dd55acba3dd59decadbc2e575e253bee6e95052d8f76ce79b2fe3b9743dac`. Os trechos já enviados desse dossiê continuam vinculantes.

## D15

Cláusula retida: “Public and durable-only inventories differ.” O intervalo inclui integralmente a construção de `Definitions` e a construção de `DurableOnlyDefinitions`, permitindo a comparação literal dos membros.

Path `packages/schema/src/maestro-event.ts`; blob `e4792cc8bbbdf6d11b8caf503fbd09b0b2688fb2`; 28276 bytes; SHA256 fonte `d1d4ff601b422f55e6579f06b79805af24bdccda295fdcaa70b038afef0cdb8c`.

Linhas 737–768; 868 bytes; SHA256 do intervalo `685d0020cea2c7df5a6dd1e1217f0c0724af4cf287501aaee3072c4b65651adf`.
```ts
export const Definitions = Event.inventory(
  Approval.Presented,
  Approval.Decided,
  Approval.Consumed,
  Approval.Reserved,
  Approval.ReservedV2,
  Approval.ConsumedV2,
  Admission.Decided,
  PlanRevision.Recorded,
  PlanRevision.RecordedV2,
  PlanRevision.RecordedV3,
  Context.Recorded,
  Context.RecordedV2,
  Clarification.Decided,
  Scope.Decided,
  Held.Entered,
  Validation.Recorded,
  Validation.RecordedV2,
  Validation.RecordedV3,
  Review.Received,
  Review.ReceivedV2,
  Authorization.Granted,
  Dispatch.Reserved,
  Dispatch.ReservedV2,
  Task.Bound,
  Task.WorkflowBound,
  WorkResult.Decided,
)

/** Maestro events stored and replayed by the host but never part of the public event surface. */
export const DurableOnlyDefinitions = Event.inventory(Task.WorkflowReviewHeld, Task.WorkflowRebound,
  Task.WorkflowReviewFindings, Task.ResumeAdmitted)
```

## D18

Cláusula retida: “The decoder checks shape/eligibility/count arithmetic but cannot establish the truth of supplied metrics.” O primeiro intervalo contém a função `decode` completa: condição inicial com `return undefined`, chamada `counts(root.bytes)` e recusa quando `bytes` é inválido. O segundo contém `counts` e seu uso por `estimated`.

Path `packages/schema/src/lean-metrics.ts`; blob `ece2b32793cf3de837103ef42e34814b64287837`; 6213 bytes; SHA256 fonte `4e8243211ee2df7b02689db54c57c61134d43f347a9154c7d31fb06e0744568b`.

Linhas 27–70; 3368 bytes; SHA256 do intervalo `3193d0a2a05e91f9b3ee8d7610758f3b93231bdf2384bfa293e8ecc9633e765a`.
```ts
/** Frozen decoder signature; metrics author fills validation with the actual persisted record contract. */
export const decode: (value: unknown) => Decision | undefined = (value) => {
  try {
    const root = record(value, ["version", "scope", "owner", "orchestraProfile", "model", "engine", "itemID", "producer",
      "eligible", "status", "reason", "filterProfile", "bytes", "tokens", "durationMs"])
    if (!root || root.version !== 1 || root.scope !== "standard-registry"
      || typeof root.engine !== "string" || !LeanEngine.accepted.includes(root.engine)
      || (root.itemID !== undefined && (typeof root.itemID !== "string" || !LeanCoverage.ids.some((id) => id === root.itemID)))
      || (root.producer !== "native-shell" && root.producer !== "native-tool" && root.producer !== "unverified")
      || typeof root.eligible !== "boolean" || (root.eligible && root.producer === "unverified")
      || (root.status !== "applied" && root.status !== "normalized" && root.status !== "passthrough")
      || !text(root.reason) || typeof root.durationMs !== "number" || !Number.isFinite(root.durationMs) || root.durationMs < 0
      || (root.orchestraProfile !== undefined && !text(root.orchestraProfile))
      || (root.filterProfile !== undefined && !text(root.filterProfile))) return undefined
    const mappedItem = typeof root.filterProfile === "string" ? LeanCoverage.forProfile(root.filterProfile) : undefined
    if (root.itemID !== undefined && mappedItem !== undefined && root.itemID !== mappedItem) return undefined
    const owner = record(root.owner, ["projectID", "location", "sessionID", "callID"])
    const model = record(root.model, ["provider", "id"])
    const bytes = counts(root.bytes)
    const token = record(root.tokens, ["kind", "counter", "before", "after", "saved"])
    if (!owner || !text(owner.projectID) || !text(owner.location, 4096) || !text(owner.sessionID) || !text(owner.callID)
      || !model || !text(model.provider) || !text(model.id) || !bytes || !token) return undefined
    const tokens: Decision["tokens"] | undefined = token.kind === "unavailable" && Object.keys(token).length === 1
      ? Object.freeze({ kind: "unavailable" })
      : token.kind === "estimated" && token.counter === "chars-per-token-4"
        ? estimated(token) : undefined
    if (!tokens) return undefined
    if (root.status === "passthrough") {
      if (bytes.saved !== 0 || (tokens.kind === "estimated" && tokens.saved !== 0)) return undefined
    } else if (!root.eligible || root.producer === "unverified" || bytes.saved <= 0) return undefined
    return Object.freeze({
      version: 1, scope: "standard-registry", engine: root.engine as LeanEngine.ID,
      owner: Object.freeze({ projectID: owner.projectID, location: owner.location, sessionID: owner.sessionID, callID: owner.callID }),
      model: Object.freeze({ provider: model.provider, id: model.id }),
      ...(root.orchestraProfile === undefined ? {} : { orchestraProfile: root.orchestraProfile }),
      ...(root.filterProfile === undefined ? {} : { filterProfile: root.filterProfile }),
      ...(root.itemID === undefined ? {} : { itemID: root.itemID as LeanCoverage.ItemID }),
      producer: root.producer, eligible: root.eligible, status: root.status, reason: root.reason,
      bytes, tokens, durationMs: root.durationMs,
    })
  } catch {
    return undefined
  }
}
```

Linhas 87–98; 825 bytes; SHA256 do intervalo `11ab4fa47fda2de128b6a0341722eec32135e9abd47aab6444d6ab823f5e54d0`.
```ts
function counts(value: unknown): Decision["bytes"] | undefined {
  const part = record(value, ["before", "after", "saved"])
  if (!part || typeof part.before !== "number" || typeof part.after !== "number" || typeof part.saved !== "number"
    || !Number.isSafeInteger(part.before) || part.before < 0 || !Number.isSafeInteger(part.after) || part.after < 0
    || !Number.isSafeInteger(part.saved) || part.saved !== part.before - part.after) return undefined
  return Object.freeze({ before: part.before, after: part.after, saved: part.saved })
}

function estimated(token: Record<string, unknown>): Decision["tokens"] | undefined {
  const part = counts({ before: token.before, after: token.after, saved: token.saved })
  return part ? Object.freeze({ kind: "estimated", counter: "chars-per-token-4", ...part }) : undefined
}
```

