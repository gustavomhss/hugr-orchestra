# L1: shared DTO and event schema contracts

Key: `s1.api.schema-contracts`. Source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Observations concern the inspected definitions and their encoded/decoded shapes.

## Primitive and location contracts

`packages/schema/src/schema.ts` defines branded `AbsolutePath` and `RelativePath` strings. Branding alone does not validate an absolute path, enforce a root, or authorize file access. `DateTimeUtcFromMillis` decodes finite epoch-millisecond numbers to Effect UTC DateTime values and encodes them back to milliseconds. The `optional` helper uses optional keys and filters undefined on encoding; callers must distinguish a missing property from a supplied value according to the actual schema.

`SessionID` accepts strings starting with `ses`; its constructor emits `ses_` plus a descending identifier. This is looser than a claim that every accepted session ID must have the exact `ses_` prefix. Message and event IDs have their own `msg_` and `evt_` prefix checks. Schema constraints, rather than naming intuition, are the authority.

`Location.Ref` contains directory and an optional workspace ID. `Location.Info` contains location/project context. `Location.response(A)` wraps data together with location. This matters to generation: `{location, data}` is retained as an envelope, while the generator can unwrap an exact single-field `{data: A}` response.

## Session and message records

`Session.Info` carries session identity and parentage, project/location, agent/model and subagent policy, cost/token information, created/updated/archived times, title, subpath, and revert state. Its current annotation is `SessionV2.Info`. `Prompt` and `PromptInput.Prompt` are separate contracts: the canonical prompt includes richer file metadata, while the prompt admission input has its own attachment shape. They must not be collapsed by name alone.

`SessionInput.Admitted` contains the admitted sequence, message and session IDs, canonical prompt, optional prompt context, delivery, creation time, and optional promoted sequence. The delivery union is `steer | queue`. The DTO represents admission; it is not a guarantee that a model turn completed.

`SessionMessage.Message` is a tagged union covering agent/model switches, user, synthetic, system, shell, assistant, and compaction messages. Assistant content includes text, reasoning, and tool parts. Tool states include pending, running, completed, and error, with optional provider-execution facts. These declarations describe representable records; they do not prove that a provider or tool was invoked in this session.

## Event identity and persistence distinctions

`Event.define` constructs an envelope with `id`, `type`, `data`, optional metadata, optional location, and optional durable aggregate ID, sequence, and version. `Event.inventory` freezes its definition inventory. The separate `Event.latest` selects the latest durable version for each type and rejects ambiguous duplicate latest definitions; `Event.durable` rejects duplicate durable `type.version` keys.

The Session event module separates durable facts from live deltas. Text, reasoning, tool-input, and compaction deltas belong to the complete session event definitions but not to `DurableDefinitions`. Their corresponding completed records carry final values. Step ended/failed definitions use durable version 2; many other session facts remain version 1. `Step.Ended.usageKnown` is optional to preserve historical absence as unknown, rather than interpreting absence as zero usage.

`event-manifest.ts` has distinct server-public, complete public, and durable inventories. The durable manifest also includes domains beyond Session, including Maestro, Relay Hook, and Research. “Public event” therefore does not mean “persisted event,” and the global live event contract must not be substituted for a session replay contract. No event counts are asserted from test expectations as measured runtime facts.

## Evidence and limits

Full reads: `schema.ts`, `session-id.ts`, `session.ts`, `prompt.ts`, `prompt-input.ts`, `session-input.ts`, `session-delivery.ts`, `session-message.ts`, `event.ts`, `session-event.ts`, `session-status-event.ts`, `event-manifest.ts`, `durable-event-manifest.ts`, `location.ts`, and `model.ts`. Exact representative excerpts appear in `review-evidence.md`. The remaining Schema production modules are captured and literally indexed, with their internal semantics left unclaimed in `coverage.json`.

The compatibility, contract-hygiene, and event-manifest tests were read as source only. This packet does not assert that every current schema meets every guide rule, that all historical rows decode, or that schema generation/tests passed. Legacy persistence migration and domain-service behavior require the relevant Core sources and later accepted work.
