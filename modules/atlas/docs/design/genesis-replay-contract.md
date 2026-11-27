# Protected genesis exact-response replay

Status: frozen recovery design; neither continuation nor publication is established by this document.
Source: failed production 42012088507 at `15c81581f5e158822f7019d51acb52ebbb9763b4`.

## Offline proof before further provider calls

- Validate the complete external production chain through the existing codec before preparing replay.
  Preserve restored staging/CAS and independent original command responses; reject duplicate prompt hashes
  rather than guessing which request to reuse. An unresolved dispatch is not a response.
- A replay-only command accepts the regenerated prompt on stdin, matches its exact SHA-256 and UTF-8 byte
  length to one original dispatch, validates the stored response hash, then delivers the original stdout,
  stderr and exit code once. Unknown prompts, corruption, duplicate delivery and unresolved requests fail
  closed. There is no provider executable or network fallback in this command.
- The original compiled command client and mining driver still parse and admit the response. No conversion
  of raw responses into pre-admitted facts and no alternate admission/write door is introduced.
- Run the real driver against a detached checkout of the exact original source and its verified indexes.
  Preserve the final recovered staging independently, but seed replay with the **initial** checkpoint
  snapshot. This recreates the driver's in-pass grounded set: starting with final staging instead would
  invoke the incumbent-protection policy and silently skip rebuilding that state. Compiled runtime/template
  inputs must be unchanged from that source. Recreated
  plan bytes must equal the original checkpoint plan. Do not export regenerated full prompts.
- The replay-only control expects all 103 original responses and the one unresolved dispatch to be
  encountered by the real eight-worker pool, an explicit interruption at rank 98, identical final staging
  and no unmatched prompts. Unresolved is an expected control outcome, never a successful mine outcome.
  Both positive delivery and refusing controls must execute; provider-call absence follows from the replay
  command having no provider/network/spawn surface, not from an uncalibrated empty log.
  The actual-source proof rebuilds the pinned original CLI and runs as a distinct restricted Linux UID
  in a kernel-created network namespace with `no_new_privs`, an empty credential-free environment and
  a fresh private home. Checkout authentication is not persisted. Route observations are
  calibrated against the real non-isolated runner before requiring an empty isolated routing table.
  This delegates egress isolation to the OS rather than pretending a JavaScript syntax scan is complete.
  The original source and standalone dependencies live in an independent clone, with reviewed helpers
  staged separately; the restricted process does not traverse the primary checkout or its shared Git data.
  A runner-owned, traversal-only `/tmp` sandbox avoids private runner ancestors. Authoritative network
  observations and collector code stay outside the restricted user's writable trees. After the workload,
  the restricted UID publishes permissions on its own checked descriptors; the runner collects into a
  fresh private tree using non-following descriptor reads with UID/type/link checks. No post-workload root
  copy or ownership mutation is permitted. The runner independently audits collected staging, plan, native
  report and complete CAS hashes against the frozen receipt; workload exit status must also be zero.
- `checkpoint-replay-source.json` independently freezes this campaign's complete producer identity,
  repository/workflow/event, original workflow/configuration receipts, exact 295-envelope terminus,
  104/103 dispatch/completion populations, unresolved request, plan, native report and complete CAS
  inventory. Expected identity is not derived from whichever chain happens to be downloaded.
- Reproduction compares the complete native evidence-report object and exact CAS membership and bytes,
  not selected counters or a checkpoint-file subset. Reconstructed files are preserved before later
  assertions so a failed diagnostic cannot erase the actual replay result.

## Frozen helper seam

`script/atlas-genesis/checkpoint-replay.mjs` exports:

- `prepareReplay(records, identity, destination)`: validate before creating a fresh restored directory;
  preserve original responses, write a hash-bound `replay.json` manifest and an empty usage directory.
- `verifyReplayPlan(directory, arm, bytes)`: require exact original plan bytes for that arm.
- `readReplay(directory, prompt)`: return `{kind: "completion", exitCode, stdout: Buffer, stderr: Buffer}`
  or `{kind: "in-flight"}`; reject unknown or previously delivered prompts and corrupted responses. Usage
  receipts contain hashes/request identity and disposition, never prompt/response bytes.
- `replaySummary(directory)`: return original `dispatched`, `completed`, `inFlight`, and observed `delivered`,
  `encounteredInFlight`, `unmatched`, `providerCalls: 0`. These are replay-only command metrics, not quality.
- CLI `command <directory>` reads stdin and uses `readReplay`; unresolved prints a fixed nonzero refusal.

Initial acceptance lives in `script/atlas-genesis/checkpoint-replay.test.mjs`: exact bytes/single delivery,
concurrent exclusivity, faithful fresh restoration, ambiguous-prompt and byte-length refusals, original
nonzero/binary outputs, real compiled multi-fact parsing/unresolved refusal, manifest/response alteration
and corrupt-chain refusal. A cold suite critic added these cases before implementation was accepted.
The actual response-hash check is also mutation-probed; removing it must falsify its own corruption oracle.
The actual-source control is an additional required acceptance item, not replaced by those fixtures.

## Continuation boundary

Replay-only proof does not authorize a new provider attempt. Production continuation must separately
account for the unresolved request, original calls, reused responses, remaining site budget and any new
attempt, while retaining the unchanged model/effort/timeout, sequential arms and single staging writer.
The historical root error classification remains unavailable; timing alone must not be called its cause.
No automatic resume, retry, increased pool width or publication waiver is implemented by replay-only work.
