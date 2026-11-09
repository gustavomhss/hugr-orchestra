# Terra-1 — G2.1 order-fix delta review dossier (rebuilt 2026-11-09)

**Purpose**: independent disposition of the corrected candidate `2b3657c6be5f082f1b68da4b668ea594ba70edfa`
against the original technical FIX-FIRST on `613afdcd76ad0c3f1f069a6abfd135636e241589`.
Rebuilt from preserved in-repo receipts after the ephemeric checkpoint dir was lost.

## 1. Original verdict (verbatim, preserved)

From `genesis-campaign-results/update-plan-implementation-v1/terra-1.decision.json`
(session `ses_e528fd6ffffekMvs6EMxxspiWI`, msg `msg_1b06299a8001oiQ7RxMaV4Zjnj`):

- verdict: **FIX-FIRST**, scope "G2.1 technical implementation only", candidate `613afdcd…`
- blocking defect at `update-plan.ts:75`: full-graph topological order filtered by affected set.
  Counterexample: changed `a` requires unchanged `z`; changed `b` independent → filtered order
  `[b, a]`; required `[a, b]`.
- required fix: "After deriving the affected set, topologically sort that set using required edges
  between affected artifacts, choosing the lexicographically first eligible affected key. Add a
  regression with a changed artifact whose unchanged prerequisite sorts after another changed
  independent artifact."

Original FIX-FIRST remains unchanged and binding until a corrected verdict supersedes it.

## 2. The delta (613afdcd → 2b3657c6)

`modules/atlas/packages/knowledge/src/ownership/update-plan.ts`, exact diff:

```diff
-  const remaining = new Set(receipts.keys())
-  const order: string[] = []
-  while (remaining.size > 0) {
-    const ready = [...remaining].sort().find((key) => receipts.get(key)!.dependencies.every((dependency) => !remaining.has(dependency.key)))
-    if (ready === undefined) return hold("ownership-cycle", [...remaining].sort())
-    remaining.delete(ready)
-    order.push(ready)
-  }
+  const order = dependencyOrder(receipts.keys(), receipts)
+  if (!Array.isArray(order)) return order
   const direct = new Set(changes.map((change) => change.artifact))
   const affected = new Set<string>()
   for (const key of order) {
     if (direct.has(key) || receipts.get(key)!.dependencies.some((dependency) => affected.has(dependency.key))) affected.add(key)
   }
+  // Unchanged prerequisites are already satisfied; they cannot delay lexicographic affected ordering.
+  const affectedOrder = dependencyOrder(affected, receipts)
+  if (!Array.isArray(affectedOrder)) return affectedOrder
   return {
     kind: "ownership-update-plan", manifest: manifestRef, scope, changes,
-    affected: order.filter((key) => affected.has(key)),
+    affected: affectedOrder,
     frontier: [...direct].filter((key) => !receipts.get(key)!.dependencies.some((dependency) => affected.has(dependency.key))).sort(),
     unaffected: [...receipts.keys()].filter((key) => !affected.has(key)).sort(),
   }
 }
+
+function dependencyOrder(keys: Iterable<string>, receipts: ReadonlyMap<string, OwnershipReceipt>): string[] | OwnershipRefusal {
+  const remaining = new Set(keys)
+  const order: string[] = []
+  while (remaining.size > 0) {
+    const ready = [...remaining].sort().find((key) => receipts.get(key)!.dependencies.every((dependency) => !remaining.has(dependency.key)))
+    if (ready === undefined) return hold("ownership-cycle", [...remaining].sort())
+    remaining.delete(ready)
+    order.push(ready)
+  }
+  return order
+}
```

The topological routine is now factored and reused: first on the full key set (propagation closure),
then on the affected set only (worklist ordering). The affected set is no longer derived by filtering
the full-graph order.

Also changed in the same head (see compare file list): UP-24 regression test added to
`ownership-update-plan.test.ts`; a ninth named mutation probe `update-affected-order` added to
`.github/workflows/atlas-pilot.yml` that restores the old filtered ordering and must be rejected
by UP-24; campaign evidence/receipts updated. No other implementation semantics changed.

## 3. Red → green evidence (reconciled, exact-head)

- **Red reproduction** of the defect on the original implementation with the new UP-24 oracle:
  run `42202796413` at `380e048a…` — UP-24 alone failed (expected `[a, b]`, got `[b, a]`); other
  103 assertions + typecheck passed. Receipt: `update-plan-order-red-v1.json`.
- **First (pre-fix) green** on `613afdcd`: run `42201721370` — 103 assertions, 8 mutations,
  typecheck, boundary byte-identical. This is the head Terra-1 ruled FIX-FIRST on.
- **Corrected green** on `2b3657c6`: run `42203545291` — 104 assertions pass (incl. UP-24),
  **9 named rejecting mutations** (composed-ratify, current-input, need-root, update-affected-order,
  update-dependency, update-frontier, update-input, update-unavailable, worker-ast), typecheck pass,
  generated boundary byte-identical to snapshot. Archive `13494464683`,
  sha256 `72628b53…9b659b`. Receipt: `update-plan-order-green-v1.json`.

Boundary: planner only — not host observer, recipe execution, publication, economic admission,
or global AC completion. No independent execution was performed by the reviewer; CI artifacts are
the execution evidence.

## 4. Copilot second read (lead cold-checked, not a judge)

ChatGPT (GPT-6 Astra) read snapshot `snapshot-genesis-20261109` @ `46dbbf860d` and returned:

- **CONFERE** — factored implementation satisfies the contract (propagation closure at update-plan.ts:75–81;
  affected-subgraph ordering at 82–84; per-iteration lexicographic Kahn at 93–100; unchanged
  prerequisites cannot delay).
- **CONFERE** — the 9th mutation restores the old filtered ordering and UP-24 rejects it.
- **Coverage gaps found (lead-confirmed, suite-strengthening only — not implementation defects):**
  - CE1: all UP-1..24 expected `affected` arrays are alphabetical, so a naive `[...affected].sort()`
    would pass the suite; no witness has an affected-internal edge against alphabetical order
    (e.g. `a` depends on `z`, both affected → `[z, a]`).
  - CE2: no scenario with two required prerequisites on one artifact.
  - CE5 (partial): disconnected cycle / self-reference not exercised; UP-13 is refused by the reader
    before `dependencyOrder`'s own cycle hold.

Full receipt with per-claim lead dispositions:
`genesis-campaign-results/update-plan-implementation-v1/copilot-second-read-v1.json`.

## 5. Decision requested

Return **PASS** or **FIX-FIRST** on head `2b3657c6` for the G2.1 technical implementation:

1. Does the corrected implementation satisfy the frozen contract's affected-only ordering clause
   (the original blocking defect)?
2. Are CE1/CE2/CE5 (suite-coverage observations) blocking for this head, or recorded as follow-up?
3. Limits: this judgment covers the G2.1 planner only; it does not authorize merge, production
   activation, rebuild execution, or global campaign closure.

Verdict format: `verdict`, `scope`, `candidateHead`, `defects[]` (severity, file:line, counterexample,
violatedClause, requiredFix), `gateStrength`, `limits[]`.
