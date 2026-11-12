# Docker container inventory — preparation only

Status: PREPARATION ONLY. Not implementation-ready. No runtime proof. R1–R20 stays open. Three WPs, six tasks, nine six-field blocks. No fourth WP. Review units stay at or under 400 changed lines, with a generated-client split when that diff would pass the cap. This file freezes meanings. It does not pass the signature, stub, or generated-client anchor gate.

Baseline HEAD `9f38c6f9226db4fb7527465434fea6fe879e0ad2`. `git diff --check` was clean before this write. Untracked demand files and SQLite fixtures stay as inherited.

## Routing

Execution and review agents are Grok only. The lead orchestrates and receives compact reports. The direct authenticated CLI is `grok` with model `grok-4.7`. Prior OpenRouter and OpenCode Go attempts are not used. The grounded review incorporated here is FIX-FIRST. An earlier fast critic is historical and discarded: it invented a nonexistent WP-D4 and a false missing-field claim. This file is not a final approval. A fresh review is still required. The relay stop hook is unconfigured. Arms and manual gates only.

## Documentation check, separate from invocation

On 2026-11-12 the page `https://docs.docker.com/reference/cli/docker/container/ls/` was read. No Docker binary, daemon, or network call was made. Each selected option is documented on its own: `--all` shows all containers; `--no-trunc` does not truncate output; `--size` displays total file sizes; `--format` accepts `json` and prints JSON. The `--size` prose separates the writable layer from virtual size, and the table example is human text (`35.58 kB (virtual 109.2 MB)`). The JSON example is one object per line with a string `Size` such as `0B`, not an integer byte field. The page does not show the combined argv below. No selected option is missing, so nothing is substituted. `docker system df` is not a candidate. This revision did not re-fetch that page. Aggregates, RECLAIMABLE, SHARED SIZE, and UNIQUE SIZE stay out.

## Frozen contract

Producer: individual containers only. Coverage text says containers. A successful empty listing is an empty container list, never an all-Docker-empty claim. Images, volumes, networks, and external caches are not covered. No effects, cleanup, control, or IN/OUT step.

Argv is fixed and is not a shell string. No client argv, context, or path is accepted.

`AppProcess.Service.run(ChildProcess.make("docker", ["container", "ls", "--all", "--no-trunc", "--size", "--format", "json"]), { timeout: 5000ms, maxOutputBytes: 262144, maxErrorBytes: 16384 })`

`AppProcess.Service` is `@orchestra/AppProcess` in `packages/core/src/process.ts`. `RunOptions` carries those three caps. Setting `maxOutputBytes` or `maxErrorBytes` makes `OmniSpawner.collectable` false (`packages/core/src/omni-spawner.ts`). The uncapped collect path uses `Number.MAX_SAFE_INTEGER` and forces truncation flags false, so this call must not use it. The capped call goes through `ChildProcessSpawner.spawn` inside `AppProcess.run`, on the Core omni spawner only. `combineOutput` stays unset. `stdoutTruncated` or `stderrTruncated` is partial. If `outputTruncated` is ever set, that is partial too. Do not import `child_process` or edit `script/spawn-allowlist.json`. A client abort or the 5000ms deadline does not claim to cancel daemon-side work already started.

Row meanings, not wire spellings: one row per container `ID`. Raw `Size` text, when present, is only a labelled observation in details. It is never parsed into logical bytes. Missing `Size` stays an unread observation, not zero. Virtual size, UNIQUE SIZE, and RECLAIMABLE do not fill logical, unique, or any reclaim field. There is no reclaimable field and no reclaim action. Logical stays unread because this producer has no exact integer byte source. Unique is the exact ptBR string `não colapsei` in every locale. Owner is blank. Names, labels, image names, and mounts are not session provenance and are not a byte path. Use proof is unproved. Docker `State` or `Status` is not idle, Ready, alive, or an R12 step. The named source is this argv, with its sample time. Source is not a filesystem path.

Result meanings: cached GET never starts Docker. One explicit POST starts one bounded read. Concurrent POSTs coalesce onto that in-flight read. Every failed, partial, or unavailable attempt retains the last complete inventory and its sample time. Attempt status, source, age, and gaps stay separate. Ordered precedence: (1) a missing executable before an exit code is unavailable; (2) timeout or a nonzero exit is failed, even if output is also truncated, and that truncation is diagnostic, not a successful partial; (3) otherwise exit 0 with stdoutTruncated, stderrTruncated, or outputTruncated, or more than 1000 nonempty stdout records, is partial before JSON validation, even if the capped tail is invalid, missing an ID, or a duplicate; (4) otherwise a complete buffer of at most 1000 records with malformed JSON, a missing ID, or a duplicate ID is failed; (5) otherwise a complete valid listing is complete, including a zero-line empty container list, which is not unread and not numeric zero. No failed, partial, or unavailable attempt publishes a prefix as new inventory or logical bytes.

Parse policy: classify with that ordered precedence before decoding. Only a complete untruncated buffer of at most 1000 nonempty stdout records proceeds to full JSON validation. Split that buffer on newlines and allow one trailing empty line. Every other line must be one JSON object with a string `ID`. A bad line, a missing `ID`, or a repeated `ID` then fails the attempt and does not keep a prefix. A partial row cap counts nonempty records and does not decode an over-limit malformed tail. The partial gap names truncation or the row cap. No gap is stored as zero bytes.

Admission follows `docs/specs/activity/FIRST-WAVE-CONTRACT.md` rules 1, 2, 4, 5, and 7 for `instanceID`, monotonic decimal `snapshotRevision` compared without `Number`, active server and category context, strictly newer revisions, and age that does not reset on an equal revision. Docker GET does not reconcile by spawning. A snapshot-only GET does not advance the revision. Committing a complete, failed, partial, or unavailable attempt advances it once. Another `instanceID` does not populate the current context. These are the same admission duties. They are not permission for workers to invent Schema or Protocol spellings.

The next seam, inside D1-A and gating D2-A and D3-A, is still unpassed: approved canonical Schema, Protocol, and Core signatures, compilable stubs, and generated Client anchors. Dependent tests and all implementation wait on that approval. This file does not record it.

## Acceptance ownership

D1-A asserts collector results for A02, A03, A04, A172, A173, A174, and A219: unread is not zero, dash, or an omitted field; a partial or cut line is not a closed account; the 5000ms and byte caps are not widened; a failed or unavailable run is not an empty container list; a complete zero-line run is an empty container list.

D2-A asserts the HTTP boundary for those same result meanings, plus idle GET spawning nothing, coalesced POST, auth failure staying failure, and no effect or IN/OUT body. It does not own the tab clause of S16.

D3-A asserts A01–A13, A83–A88, A152–A174, A176, A216, A218, A219, A316, A345–A348, and S16. A01: a shown size observation carries the argv source and age, while logical stays unread. A02–A04 and A345–A348: unread logical and unread age remain visible. A05–A07 and A218: the Docker surface invents no pressure remainder, residence, frequency, rate, or df health word. A08: the client sums nothing. A09–A13 and A153–A154: Docker owner stays blank across selection and tabs. A83–A88 and A216: the unique column is present and is exactly `não colapsei`. A152 and S16: no effect control and no `manter`, `quarentena`, or `mover` step. A155–A158: no aggregate plan object and no model note. A159: a filter miss is not an empty machine. A160: no bar. A161: the eight English tabs stay `Trees`, `Worktrees`, `Cache`, `Docker`, `Temporary`, `Logs`, `IN/OUT`, `Quarantine`. A162–A171: the first sample is unread, and a late tick raises age without clearing the previous observation. A172–A174: partial is not a closed walk. A176 and A316: the age tick is a local clock and does not scan. A219: failure is not drawn as an empty machine.

Outstanding, not waived and not claimed done: the real footprint, frequency, residence, machine-pressure, rate, and df producers behind A05–A07 and A218; A09 outside the Docker column; A175; A177; A207–A209; A277–A279; R7 idle and proof; R3–R10; R12 except S16; R13–R18; images, volumes, networks, external caches, IN/OUT, and Quarantine.

## Writes

D1, after the seam is approved, writes the Core collector and its Core test. It does not edit the disk roots, the allowlist, or the page. D2 is lead-only on schema, protocol group, activity handler, and `bun run generate` from `packages/client`, with no hand edits under `src/generated` or `src/generated-effect`. D3 writes the Docker panel and its app-shell test, imports no Core or Server, and does not change `reading.ts` tabs or the English `orchestra.monitor.notCollapsed` value. Acceptance files are disjoint. Implementation order is D1-B, then D2-B, then D3-B.

## WP-D1 Core collector

- **Axioms:** The only producer is the fixed container argv through `AppProcess.Service.run` with the three caps, so collectable is false. Missing authority or a missing executable is unavailable, never an empty list or zero. Owner stays blank. Unique collapse is not claimed.
- **DoD:** D1-A includes the unpassed seam: canonical signatures, compilable stubs, and generated Client anchors must be approved before its dependent tests. Cold critic and hosted red come next. D1-B starts only after that red. This file does not mark the seam passed.
- **Completeness criteria:** D1-A covers A02, A03, A04, A172, A173, A174, and A219, plus unavailable, failed, partial, complete, and complete zero-line. Images, volumes, networks, effects, and external caches stay out.
- **Invariants:** No shell string, client argv, context, path, `child_process` import, or allowlist edit. GET and snapshot recall do not spawn. Failed, partial, and unavailable attempts keep the last complete inventory and sample time. Truncation and the 1000-row cap are partial, not empty. The deadline is not described as cancelling daemon-side work.
- **Success criteria:** Hosted red shows the missing capped seam. After D1-B, the same oracles keep failure off an empty list and off zero, keep owner blank, and emit no control method.
- **Quality standards:** Core `bun typecheck`. Tests only through `bun run test:ci`. No `any`, import alias, or star import. Split review units at 400 lines. Preparation is not green evidence.

### Task D1-A Acceptance and seam

- **Axioms:** A missing anchor or module fails the oracle. It is not a successful empty container list. Workers do not invent wire spellings beside this contract.
- **DoD:** Approve canonical Schema, Protocol, and Core signatures, compilable stubs, and generated Client anchors before writing dependent Core tests. Then obtain a cold critic and `bun run test:ci` red. This file does not record that approval.
- **Completeness criteria:** Assert A02, A03, A04, A172, A173, A174, and A219. Explicit combined cases: exit 0 with truncation and an invalid tail is partial; exit 0 at the row cap with a malformed tail is partial; nonzero exit or deadline plus truncation is failed; a complete untruncated malformed listing is failed. Include missing executable as unavailable and a complete zero-line listing. No case calls a live daemon.
- **Invariants:** Fixtures do not delete containers or touch inherited untracked files. The tests pass the three caps and do not accept an uncapped collect result as success.
- **Success criteria:** The retained red baseline is what D1-B must turn green without weakening asserts or skipping the seam approval.
- **Quality standards:** Call the real module path. Do not stub a fake success. Keep each review unit at or under 400 lines, splitting anchors from tests if needed.

### Task D1-B Implementation

- **Axioms:** The call is the frozen `AppProcess.Service.run` and `ChildProcess.make` argv, with timeout 5000ms, `maxOutputBytes` 262144, and `maxErrorBytes` 16384, on the Core omni spawner.
- **DoD:** Implement only that seam after D1-A red. Core typecheck. Turn the hosted D1-A suite green on its declared OS lane.
- **Completeness criteria:** Follow the ordered precedence exactly. A missing executable is unavailable. Timeout or a nonzero exit is failed even when truncated. Exit 0 with truncation or more than 1000 nonempty records is partial before JSON validation and emits no logical bytes. Only a complete untruncated buffer of at most 1000 records fails for malformed JSON, a missing ID, or a duplicate ID. A complete valid listing, including zero lines, is complete.
- **Invariants:** Recall performs no spawn. Owner is blank. Unique is not filled from size text. No control method is exported. Disk roots stay unchanged.
- **Success criteria:** The former red command is green. A missing executable stays unavailable, not an empty inventory.
- **Quality standards:** Same gates as D1-A. No protocol redesign in this task. At or under 400 lines per review unit.

## WP-D2 Authenticated API and generated client

- **Axioms:** Extend the existing `ActivityGroup`, which API Authorization already wraps. The client depends on the generated client, never on Core or Server. Wire spellings come from the approved D1-A seam.
- **DoD:** D2-A waits until that seam and its generated anchors are approved, then captures hosted red before D2-B. D2-B implements the handler against those signatures and regenerates only from `packages/client`.
- **Completeness criteria:** Idle GET and explicit POST stay distinct. Auth failure stays failure. Failed, partial, and unavailable results are not HTTP 200 with an empty container list. A complete zero-line body is an empty container list.
- **Invariants:** No filesystem path parameter, cleanup route, boot-time spawn, or Docker call from GET. Concurrent POSTs share one run. Disk root ids stay cache, logs, and temporary.
- **Success criteria:** HTTP tests go red before the handler behavior exists and green after, including auth rejection, coalescing, and retention of the last complete inventory.
- **Quality standards:** Typecheck schema, protocol, server, and client. `bun run generate` from `packages/client`. `bun run test:ci` for the server file. Split generated output into its own review unit when it would exceed 400 lines.

### Task D2-A Acceptance

- **Axioms:** Real HTTP must exercise codec and auth. A mocked handler does not prove them. This task does not design a second contract.
- **DoD:** Start only after the D1-A seam is approved. Add server HTTP tests, a cold critic, and hosted red before handler behavior edits. This file does not mark that gate passed.
- **Completeness criteria:** Cover idle GET, coalesced POST, auth rejection, unavailable, failed, partial, and complete zero-line. Assert no effect field and no IN/OUT body. Leave the S16 tab clause to D3-A.
- **Invariants:** Tests do not start Docker and do not restart the owner app. Use the existing activity HTTP harness.
- **Success criteria:** The red log cites the test file and command and locks the transport oracles above, without claiming S16 or the whole product.
- **Quality standards:** No copied production logic. At or under 400 lines.

### Task D2-B Implementation

- **Axioms:** Handler behavior uses the approved signatures. Cached GET does not call `AppProcess.Service.run`. POST does, once per coalesced flight.
- **DoD:** Change only the handler and a regenerate if the public API text changes. Typecheck. Make D2-A hosted green.
- **Completeness criteria:** A body without a sample has no numeric zero. Errors use the activity errors the group already declares. Attempt status stays separate from the retained inventory.
- **Invariants:** The handler does not import `child_process`. The omni-backed `AppProcess` layer is the one already provided to Core. No new allowlist entry.
- **Success criteria:** Generated `orchestra.activity` methods match the approved endpoints, idle GET does not spawn, and the HTTP suite is green.
- **Quality standards:** Do not hand-edit generated files. The lead is the sole writer of these shared files. At or under 400 lines per review unit.

## WP-D3 Docker tab

- **Axioms:** Tab labels stay the English `reading.ts` constants. The unique cell is exactly `não colapsei`. Owner renders blank. Logical stays unread. Raw size text is details, not a second total.
- **DoD:** D3-A waits for the approved generated anchors, then red and a cold critic, before page edits. D3-B renders server readings only after those anchors exist. This file does not mark that gate passed.
- **Completeness criteria:** Assert A01–A13, A83–A88, A152–A174, A176, A216, A218, A219, A316, A345–A348, and S16, with the oracles in Acceptance ownership. A05–A07 and A218 are absence asserts only.
- **Invariants:** Mount and frame do not POST. Do not copy the worktree refresh-on-mount. No Core or Server import. IN/OUT and Quarantine keep the unavailable fallback. No `manter`, `quarentena`, or `mover` step.
- **Success criteria:** UI tests go red, then green. A filter miss does not say the machine is empty. First paint without a sample says unread or unavailable, not zero. A later complete zero-line snapshot says the container list is empty.
- **Quality standards:** App-shell `bun typecheck` and `bun run test:ci` on the new UI file. No epic-wide suite. At or under 400 lines. Rendered inspection stays a later manual gate.

### Task D3-A Acceptance

- **Axioms:** The test renders the Docker tab. A projection-only check does not prove mount behavior. The test consumes the approved client anchors and does not invent fields.
- **DoD:** Start only after the D1-A seam is approved. Author the UI test, cold critic, and hosted red before editing `page.tsx`.
- **Completeness criteria:** Assert every id listed on WP-D3, including A09 and S16. Assert eight English tabs, the literal `não colapsei`, blank owner, unread logical, labelled raw size text, no mutating control, and no request on first paint.
- **Invariants:** Do not change the English `notCollapsed` catalog entry. Worktree rows keep their current key. Do not mark footprint, frequency, pressure, idle, or proof as implemented.
- **Success criteria:** Red evidence shows today's unavailable fallback failing the new oracles, while existing worktree tests still apply.
- **Quality standards:** Match current activity test style. At or under 400 lines. No browser daemon in this preparation.

### Task D3-B Implementation

- **Axioms:** Show server source name, age, attempt status, and the raw size observation. Do not derive bytes, owner, unique, proof, or a plan step in the client.
- **DoD:** Add the Docker panel after the generated client exists and D3-A is red. Typecheck and make D3-A green.
- **Completeness criteria:** Each UI id on WP-D3 has its assertion owner in D3-A. The tab set stays the same eight English names. A complete empty container list is the only empty success.
- **Invariants:** Only the explicit read control may POST. A frame tick only advances age from timestamps already received. Failure keeps the previous complete observation visible with its age.
- **Success criteria:** The tab shows unavailable or unread until a reading arrives. Unique remains `não colapsei`. Logical remains unread. No effect and no IN/OUT step appear.
- **Quality standards:** No `any`, aliased import, star import, or generated edit. At or under 400 lines. Leave R1–R20 open.

## Gates

Local `bun typecheck` per touched package. Tests only with `bun run test:ci`. Full suite once per epic. A public HttpApi change requires `bun run generate` from `packages/client`. Source review is not a green test. Manual gates only.

Independent Grok preparation review APPROVE, no findings, in /tmp/activity-grok-docker-status-review.artifact.json. The five original findings and the status-precedence gap are closed in this text.
This is not code or runtime approval. Canonical anchors, compilable stubs, a cold critic, and hosted red remain pending.
