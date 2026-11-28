**Key:** `s2.l2.design-tui`
**Result:** `3cc5e2635468df6e73e1b1f592d0f7b706152354530402358181031f41aecd68`
**Section:** `V2 actions and prompt admission`

For a TUI prompt or command, the adapter awaits agent selection, then model selection; the final action uses that selected session state. A truthy editor context is sent first as a synthetic input with `resume: false`, then the prompt is admitted. Prompt success means durable input admission, not completed model execution. These awaits order a single invocation, but do not provide a transaction, cross-caller lock, rollback, or retry.

This is **static evidence** describing the adapter and pinned protocol declarations. It does not establish observed server outcomes or actual prompt integration; runtime binding and actual consumers remain separate evidence gaps. The companion `s2.l1.design-tui` result is `7baaa859ebb117874e48253430260b915f4a711a26764d694039de68fba7b031`.

Addendum: The V2 selection calls are `switchAgent` followed by `switchModel`. The session model is represented as `{ providerID, id, variant }`, with the TUI adapter mapping its `modelID` to `id`. The final prompt uses the Session’s selected model; it does not include a per-prompt provider/model override.
