# Event persistence, projection and database contracts

Layer: **L1 — pinned factual basis**. Need: `evidence`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Observed implementation

Core opens SQLite with WAL, `synchronous=NORMAL`, a 5,000 ms busy timeout, a 64,000 KiB cache setting, foreign keys enabled and a passive checkpoint before applying migrations. The release file is `orchestra.db` under `Global.Path.data`; `ORCHESTRA_DB` may select an absolute path, a data-root-relative filename or `:memory:`. File stores receive a namespace derived from the resolved filename; memory stores receive independent random identities. These choices are source behavior, not measured durability/performance guarantees. [1]

Migration startup distinguishes an empty database, an existing `session` table, and a nonempty unknown database. Empty initialization creates the generated schema and journals known migrations in an immediate transaction. Existing stores reject unknown journaled migration IDs, back up through `VACUUM INTO` before pending migrations, and retain the newest three backups. Each unapplied migration rereads its journal entry under an immediate transaction before running and recording completion. Legacy Drizzle journals are converted by known name or timestamp mapping; an unrecognized timestamp fails. [2]

Durable EventV2 publication uses an immediate transaction to validate aggregate identity/sequence, run registered projectors, run the optional local commit hook, advance the sequence row, and insert the event with a seal. Its replay path resolves a known durable versioned definition. Replay first rejects an owner mismatch when `strictOwner` is enabled. It then reconciles an already seen sequence against the stored event ID, versioned type and payload: an exact match returns without applying, while divergence fails. Only after that reconciliation does non-strict replay with another recorded owner return without applying. The next-sequence check applies only to requests that pass those earlier branches. Consequently, a new discontinuous sequence from another owner in non-strict replay returns before gap validation, whereas an old divergent sequence from that owner fails before the owner-based return. These are source-level consequences, not executed scenarios. The `claim` method updates an aggregate's replay owner; it is not a Session execution lease. [3]

`persist:false` is an explicit exception: it projects locally without appending the event or advancing the sequence and notifies without a durable envelope. A local commit hook cannot be combined with it. Projectors are currently registered by event type, with a source TODO to bind exact type plus version before incompatible historical payloads are supported. Consumers must not infer that arbitrary schema evolution is replay-safe. [3]

The durable subscription registers a sliding wake channel before reading history, then rereads stored aggregate events after wakes and advances its sequence from persisted events. The generic in-process `all` and typed buses are unbounded; a separate bounded adapter exists. Durable replay, in-memory notification and finite aggregate history are distinct surfaces. Session storage decodes persisted message projections and returns typed decode errors on the primary history paths. [3,4]

Event seals hash canonical row content chained to a predecessor; verification accepts bounded windows of at most 2,048 rows and 8 MiB. Seals are integrity evidence, not authentication of the producer, permission to replay, or execution ownership. [5]

## Normative intent and limits

The database README treats the data path, migration identities/order and generated schema locations as user-data contracts. `migration.gen.ts` and `schema.gen.ts` are generated through the package migration command and checked against `schema.json`; individual domain SQL definitions remain with their owners. Never infer a migration is disposable because it is historical. [6]

This package inspected the migration engine and current Session tables, not every historical migration or driver edge case. Existing-user restoration, cross-process locking and seal-negative controls require the repository's authorized CI/runtime evidence. No migration, SQL engine or product test ran here.

## Source anchors

- **1.** `packages/core/src/database/database.ts:aa519134efff085e960affd9be376b0dc92456e1` — Database layer, path, releasePath, lines 17–67.
- **2.** `packages/core/src/database/migration.ts:b3d38c72425f3bae7f5730140070b251a8a4c8e7` — apply, applyExisting, backup, applyOnly, lines 13–168.
- **3.** `packages/core/src/event.ts:fa7a39a0c039770d36523723e75c1f228e1142f0` — commitDurableEvent, replay, claim, durable, lines 124–165,187–205,290–435,449–460,527–563,621–699.
- **4.** `packages/core/src/session/store.ts:1e44d051f1a51b816bfeb96ce46dbc0747d07aff` — read-side service, lines 15–105.
- **5.** `packages/core/src/event/seal.ts:92fb956062247720c457eb443e0f271a04261a44` — sealRow, hashRow, verification bounds, lines 10–17,68–100,113–174.
- **6.** `packages/core/src/database/README.md:272a4d3d363f4871b5288d8fb879b9d9b9710d65` — schema and migration maintenance contract, lines 7–38.
