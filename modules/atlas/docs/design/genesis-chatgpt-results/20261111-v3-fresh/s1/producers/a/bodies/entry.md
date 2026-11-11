# Core L1 entry, authority and complete source-family disposition

Layer: **L1 — pinned factual basis**. Need: `entry`. Scope: `orchestra.s1`.
Source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`.

## Scope and factual entry

This is producer A's L1 factual basis for the pinned Core population, prepared for cumulative later understanding. It contains no L2–L4 acceptance claim. Core is the reusable platform/domain package consumed by server, apps, SDK and product modules. The repository README requires Schema → Core and Protocol → Server boundaries, forbids Core importing Client/Server, and declares explicit public subpaths. The captured package manifest has 437 exports, no bare `.` export and no wildcard key; this count was parsed from pinned bytes. Product behavior is exposed through those subpaths and composition ports, not an inferred all-purpose Core entry. [1,2]

Use `session-admission` for identity and accepted input, `session-execution` for active local work, `persistence` for events/database, and `context` for model-visible history. `tools`, `security`, `capability` and `configuration` identify distinct authority boundaries. `project`, `runtime`, `models`, `extensions`, `automation`, `research`, `economy` and `boundaries` describe the remaining coherent Core needs. Those names mean the stable `s1.core.*` keys. Navigation is consultation, not a hidden L1 build dependency.

## Population disposition

The frozen assigned population contains **1,441 entries**. The deterministic coverage ledger lists every path once, with original Git blob, family, kind, read status, depth, reason, need and proposed artifact. It includes **814 Core src entries**, **584 Core test entries**, and **43 other assigned entries**. These are inventory observations from the supplied pinned population, not a fresh remote census. Family counts include source, docs and validation members:

| Family | Assigned entries | L1 artifact entry |
| --- | ---: | --- |
| actions | 155 | `s1.core.automation` |
| agent | 10 | `s1.core.extensions` |
| architecture-history | 9 | `s1.core.entry` |
| atlas | 1 | `s1.core.boundaries` |
| backend-toolkit | 59 | `s1.core.research` |
| board | 38 | `s1.core.automation` |
| capability | 170 | `s1.core.capability` |
| config | 62 | `s1.core.configuration` |
| control-plane | 3 | `s1.core.boundaries` |
| database | 89 | `s1.core.persistence` |
| documentation | 3 | `s1.core.entry` |
| economy | 5 | `s1.core.economy` |
| event | 11 | `s1.core.persistence` |
| identity | 15 | `s1.core.extensions`, `s1.core.security` |
| instruction | 21 | `s1.core.extensions` |
| location | 10 | `s1.core.project` |
| package | 12 | `s1.core.entry` |
| permission | 9 | `s1.core.security` |
| plugin-host | 63 | `s1.core.extensions` |
| process | 58 | `s1.core.runtime` |
| project | 56 | `s1.core.project`, `s1.core.runtime` |
| provider | 76 | `s1.core.models` |
| rag-studio | 1 | `s1.core.boundaries` |
| relay | 19 | `s1.core.boundaries` |
| research | 71 | `s1.core.research` |
| runtime | 41 | `s1.core.runtime` |
| scheduled-task | 11 | `s1.core.automation` |
| session | 90 | `s1.core.context`, `s1.core.models`, `s1.core.persistence`, `s1.core.session-admission`, `s1.core.session-execution` |
| system-context | 11 | `s1.core.context` |
| tool | 114 | `s1.core.extensions`, `s1.core.runtime`, `s1.core.tools` |
| tool-safety | 36 | `s1.core.security` |
| util | 32 | `s1.core.runtime` |
| validation-support | 80 | `s1.core.entry` |

Decisive implementation/control-flow and normative reads back the claims actually made in the other bodies. An unread substantive implementation is explicitly classified `representative_family_boundary`, never silently converted to support or semantic acceptance. Exact operation-specific leaf behavior remains a deeper-read obligation. This bounded L1 grouping covers the entry, authority and lifecycle questions; it does not certify every line of every member.

Historical migrations retain compatibility authority under the inspected migration engine. Generated schema/export/support files remain tied to their generators and owning contracts. The vendored Copilot family remains an upstream compatibility boundary. Tests, fixture trees, assets and harnesses have grouped validation disposition; their existence proves no executed result. Runtime pins and bundled text are change-sensitive inputs even when their leaf content is not interpreted here. Historical phase plans, runtime-closure qualification documents and old V2 sketches are retained as historical/normative inputs to compare with current code, never promoted by filename to current behavior or a fresh PASS. [1,3]

## Source and authority rules

All captured repository bytes came through GitHub connector `fetch_file` at `1cde2ff7a71bcf7aecb5d030917b577165135d38` and are stored unmodified beneath `sources/`. `capture-manifest.json` binds each to commit, observed Git blob, SHA-256 and byte count. Git blob identity was independently recomputed from the bytes. `review-evidence.md` carries exact source slices and an artifact-to-excerpt map. Repository documents are normative/intent evidence only where expressly labeled; executable branches support implementation observations. Conflicts remain visible, including old Bash non-sandbox wording versus conditional confinement, binary read breadth, and per-request rejection guidance versus current rejection fan-out.

Root AGENTS says repo docs and `.orchestra/skills` are not shipped runtime instructions; needed runtime guidance belongs in prompts or shipped seat skills. Its Session rules explicitly keep execution local, context algebra Core-owned and context producers with their domains. The generated module README is useful ownership/navigation evidence but does not override current implementation. [1,3]

## Verification boundary and open work

Performed: connector capture, canonical Git-object/SHA-256/size checks, source inspection, line-anchor reconciliation, per-entry population reconciliation and artifact/excerpt binding checks. No product tests, provider calls, shell tools inside Orchestra, database migrations, external mutations, remote commits or Atlas publication were performed. The producer's local Python only processed evidence and authored this transport fragment. Hash validity is not semantic acceptance; independent judges and principal packaging are separate steps.

Unresolved limits include runtime/OS qualification, unread leaf-specific semantics, native engine/provider boundaries outside Core, historical document reconciliation beyond the cited conflicts, and the observed implementation gaps called out per body. All source-reading status remains visible. This unit is a source-supported L1 candidate, not an accepted complete S1 delivery or live Atlas publication.

## Source anchors

- **1.** `packages/core/README.md:742921238462659e1a5a314f2e0238102c6e9f3a` — public entry, architecture and generated domain inventory, lines 1–88.
- **2.** `packages/core/package.json:8ee8ebb666051c9b5ee0fcd4a54bceb3a2cb3c43` — scripts and explicit exports (437 keys parsed from captured manifest), lines 1–453.
- **3.** `AGENTS.md:ef3b523b0c00aed722582b870c1919188edc4c4f` — shipping, terminal and Session scope instructions, lines 146–154,182–192,207–217.
