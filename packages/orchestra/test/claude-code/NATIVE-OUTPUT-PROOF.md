# Native SDK output capability proof

This is an acceptance probe of the pinned Claude Agent SDK, not a Lean parser or
an enabled Orchestra integration. It uses the real SDK subprocess and native Bash;
only the loopback HTTP model is scripted. No paid model, host credentials or live
Orchestra runtime is involved.

## Pin and execution

- Orchestra baseline: `ad40b080e9b77fe8f2ff9a36fb0b2cecfa33d3d8` (`dev`).
- SDK: `@anthropic-ai/claude-agent-sdk@0.3.289`, already pinned in package/lockfile.
- Fixture: `test/claude-code/native-output.test.ts`.
- From repository root:
  `bun run test:ci orchestra test/claude-code/native-output.test.ts --os both --timeout 120000`.
- [CI 37878300315](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37878300315):
  seven tests, 144 assertions per lane, Linux and Windows. Test-source Git blob:
  `2de7001ccb93615e751d04f975d5cff71ea8789f`.

## Observed contract

1. A synchronous `PostToolUse` response with `updatedToolOutput` changes native
   Bash text in the immediately following provider request. It is not merely a
   display/mirror change. The complete tool result is compared against an
   independent same-directory baseline with the fixture's known noise removed.
2. Warnings survive. In this fixture both streams are merged into `stdout`;
   Windows also supplies a cwd-reset note in `stderr`. That host-added text and
   the SDK's framing remain exact. The proposal retains all other object fields.
3. Actual SDK resume sends the same validated result. Neither continuation nor
   resumed request messages contain the fixture's original noise elsewhere.
4. Controlled process exit 7 invokes `PostToolUseFailure`; the provider receives
   the exact baseline failure and `is_error: true`.
5. Native `grep` exit 1 invokes **PostToolUse**, with
   `returnCodeInterpretation: "No matches found"`. Thus this callback alone does
   **not** certify numeric exit zero.
6. A bare-string native replacement is rejected. A competing identity rewrite
   supersedes the reduction in the tested registration. Both hooks receive the
   original object. Proposal success alone cannot certify applied savings.
7. The large fixture records `persistedOutputSize: 160045`, an inline stdout of
   29999 UTF-8 bytes, and a smaller SDK-rendered model preview. It submits no
   rewrite; persistence metadata does not prove full capture recovery.

## Oracle calibration

Temporary mutations were uploaded through the same CI runner, then removed:

- [37877880999](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37877880999):
  identity replacement failed the next-request noise check (earlier oracle).
- [37878544896](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37878544896):
  duplicated kept text failed complete provider-result equality.
- [37878668851](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37878668851):
  original copied into `additionalContext` failed the provider noise check.
- [37878795746](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37878795746):
  injected sibling user-message noise failed the whole-request oracle. This is
  an oracle calibration, not a claim that the unmodified SDK emitted that message.

The final three mutations restored the exact test blob listed above. Focused
strict TypeScript checking used the pinned SDK, Bun 1.3.13 and Node 24.12.2
declarations; it caught and corrected an SSE union-property access. This is not a
full application-package typecheck; that local worktree has no installed toolchain.

After restoration, [CI 37879047115](https://github.com/gustavomhss/hugr-orchestra/actions/runs/37879047115)
again passed all seven tests and 144 assertions on each Linux/Windows lane.
An independent cold review approved the strengthened oracle and these scoped claims.

## Explicit reach

These tests do not establish authoritative numeric exit/capture facts for
arbitrary commands, background execution, cancellation or timeout variants,
persisted-file contents, Orchestra's own durable mirror, policy enforcement,
real-model behavior, or macOS compatibility. They do not enable Lean filtering.
Native host adapters must continue to require their own trusted execution facts;
the SDK adapter must decline when its Observation facts are not established.
