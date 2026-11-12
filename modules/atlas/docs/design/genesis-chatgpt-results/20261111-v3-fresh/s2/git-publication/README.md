# S2 archive publication — incremental preservation

Owner-authorized preservation of `genesis-s2-resumed-review-package.zip` in the S2 results namespace. This is byte preservation, not a new semantic acceptance, runtime operation or campaign completion.

Source archive SHA-256: `7cd39199afb286e16b191bf28030bda2964ec32a7b0476ee81de0597d12abab2`.
Original archive: 1,109 files, 40,936,957 archive bytes.

## Navigation and current scope

- `../layers/`: the 13 original accepted L1–L4 bodies.
- `../accepted/`: the four original accepted-layer manifests.
- `../judgments/`: original review records restored in subsequent batches.
- `state.json`: current counts and the explicitly incomplete publication state.

Original files retain their relative paths and exact bytes. Git blob identities are calculated from the verified source archive and checked against GitHub object identities. Historical PASS, HOLD and findings keep their original scope and authorship; copying them does not issue new decisions.

**The archive publication remains incomplete.** A referenced path is not proof that its file has already been restored. Source captures, request envelopes, runtime evidence, history and nested ZIP archives must be reconciled before full preservation can be claimed. Do not consume this partial tree as a complete native package.

The initial `work.md` remains historical until its recovered replacement is preserved. Further batches must update `state.json`, preserve existing bytes, and publish against a checked branch HEAD. No force push, dev/main merge, product-code change, product test or Atlas activation is part of this preservation operation.
