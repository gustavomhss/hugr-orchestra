# One-shot native prepare capture

This helper has been prepared and parsed for Python syntax only. It has not run native prepare, product tests, Bun or any package/CAS mutation. Root must inspect it before invocation.

After all 13 artifacts are accepted, the final root is set and `stage_final_native.py --apply` has successfully written `stage-plan.json` and `sealed.json`, run from the Genesis S2 workspace:

```text
python runtime-work/prepare-capture-support/capture_native_prepare.py --stage-dir /workspace/scratch/7b5d6430f420/genesis-s2/runtime-work/final-staging/ACTUAL_FINAL_PACKAGE_SHA
```

This first form is read-only verification. It requires the exact seal/plan/current canonical package; all planned staged files and original files; 406 native source files and Git blob identities; dependency files and links, including the already recorded scip postinstall change; the exact Bun binary; the exact candidate and command; and no prior `.atlas`, output, logs or attempt marker. It does not execute version commands. The package protocol commit is read from its actual `protocol_ref.commit` field.

The concrete operation is invoked only by root after those checks:

```text
python runtime-work/prepare-capture-support/capture_native_prepare.py --stage-dir /workspace/scratch/7b5d6430f420/genesis-s2/runtime-work/final-staging/ACTUAL_FINAL_PACKAGE_SHA --execute --authorization-note 'Root authorizes one isolated native prepare of this exact accepted and sealed S2 package; preserve any failure and partial CAS.'
```

The script executes the exact argv and cwd already in the plan, once, with no shell. The extra note records root's operation decision; it is not a new user permission request. It neither overrides the 256000-byte input limit nor deletes, truncates or replaces mandatory sources. It does not publish, bind, call consumers or run product tests.

The operation directory receives an exclusive attempt marker, preflight receipt, stdout/stderr in full, before/after `.atlas` inventories (including file bytes/hashes), post-operation source/package integrity result, and `prepare-execution-receipt.json`. The final receipt has the exact `native_package_sha256`, current implementation/source/protocol pins, actual argv/cwd/time/exit, log references, observed CAS state and candidate ID only from an actual valid `prepared.json`. `binding_id` stays null. A successful prepare remains runtime-unaccepted. The closure renderer can consume this receipt directly.

## Preservation and limits

- Any existing attempt/output/log/receipt, or existing `.atlas`, causes refusal. Do not remove evidence to rerun. An interruption may leave the marker and logs without a final receipt; preserve and inspect that state.
- The final staging utility stores its request inside `stage-plan.json`. A separate `prepare-request.json` is optional and is not required or fabricated by this helper.
- Native identity is checked against the retained 406-file materialization manifest, whose candidate-to-Git-blob mapping came from the earlier connector-backed materialization. The exact manifest is pinned here by SHA256 `9ba791b332abab7bba4b6949aedce9363a13dbb87ab3a4aa58ad485b695bea60`. This does not invent a checkout/HEAD observation or transfer S4 binding/CI acceptance.
- Dependency and prior successful build receipts are also hash-pinned. The recorded scip package change is the only original dependency-file exception. Generated build products are inherited from that prior build; this helper executes no rebuild and claims no fresh product test.
- Read-only permissions and pre/post hashes detect ordinary drift, not adversarial concurrent mutation by another privileged process. A concurrent writer or external termination requires preservation and manual assessment, never automatic retry.
- The wrapper uses no subprocess timeout; the caller can use the host's yielded execution session to remain responsive. Native prepare is expected to fail on a mandatory oversized input under the retained implementation, but only its actual output may establish the first failing path.

`preparation-receipt.json` records the helper's syntax-only verification and exact source hash.
