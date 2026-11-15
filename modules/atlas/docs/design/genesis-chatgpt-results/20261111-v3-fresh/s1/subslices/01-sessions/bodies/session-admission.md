# Session identity and durable prompt admission

Layer: **L1 — pinned factual basis**. Need: `component`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

`SessionV2` is a process-global facade over storage, events, project resolution and execution routing. `create` chooses a new ID when omitted and returns a stored Session immediately when the supplied ID already exists. Existing identity wins even if the new call requests different creation fields. A concurrent creation that loses `SessionProjector.SessionAlreadyProjected` similarly adopts the recorded Session. A new Session resolves and records its project, emits `Created`, then runs `session-start` hooks; hook outcome does not undo the created Session. [1]

`prompt` generates or uses a message ID, evaluates prompt hooks before durable admission, resolves the prompt, and defaults delivery to `steer`. Hooks are skipped when that ID already names an input or historical projected message; admission then reconciles identity. A new refusal becomes `PromptBlockedError` and is not admitted. `SessionInput.admit` publishes durable `PromptAdmitted`, requires an aggregate sequence and its projection, and returns the stored admission receipt. Only after admission does the facade call `execution.wake`, unless `resume:false` requests admission alone. Exact retry can therefore issue another advisory wake without inserting another input. [1,2]

Retry equivalence compares Session ID, encoded canonical prompt JSON and delivery mode. Conflicting reuse becomes `PromptConflictError`. `promptContext` and creation time participate in projection consistency, rather than in caller retry equivalence. Historical user messages are reconciled only after checking the original durable `Prompted` event, because the projection by itself does not retain delivery. An exact historical retry creates a promoted inbox row; divergence fails. [1,2]

`session_input` stores a message ID, Session foreign key, prompt, optional prompt context, delivery, admitted sequence, optional promoted sequence and creation time. It has distinct indexes for pending delivery, admitted sequence and promoted sequence. Input admission and model visibility are different states: the `PromptAdmitted` projector creates the inbox row; the `Prompted` projector updates promotion and writes the visible user-message projection inside EventV2's event transaction. [2,3,4]

`promoteSteers` selects pending steer rows up to a supplied admission cutoff in sequence order. `promoteNextQueued` selects one oldest pending queue row. Each publishes `Prompted`; this module does not choose provider execution or replay side effects. [2]

## Normative intent and limits

Root AGENTS and the current-slice portion of the Session specification require durable admission before advisory execution and distinguish steer from queue. Those requirements agree with the inspected paths. The specification also contains older V1 bridge/API material, so its entire document is not treated as a current route inventory. [5]

Creation/admission are not proof of a completed model turn, durable execution ownership, exactly-once external effects, or automatic recovery after process death. The observable admission receipt answers “was this input accepted?”; execution and result evidence must be obtained separately. This L1 source reading did not run concurrent retry, storage or HTTP tests.

## Source anchors

- **1.** `packages/core/src/session.ts:402a192a69bcad6a4b08c695657e24ff5e335f93` — Service layer, create, promptHooks, prompt, lines 264–417,491–518.
- **2.** `packages/core/src/session/input.ts:d945b00cf43d03b923cc90d51970d47e2dd3a9c2` — admit, reconcileHistorical, equivalent, promotion, lines 48–160,163–252,291–390.
- **3.** `packages/core/src/session/sql.ts:21b589483ae47f8d924cc58b8d2377525d381cc0` — SessionMessageTable, SessionInputTable, SessionContextEpochTable, lines 133–191.
- **4.** `packages/core/src/session/projector.ts:e5d7ca7d65d1da035a136557b08e2a264c788da5` — Prompted and PromptAdmitted projectors, lines 283–310.
- **5.** `docs/specs/v2/session.md:e3574b87bc3b12c0eca603f96821a16ec89399fc` — Current V2 Core Slice, lines 3–52.
