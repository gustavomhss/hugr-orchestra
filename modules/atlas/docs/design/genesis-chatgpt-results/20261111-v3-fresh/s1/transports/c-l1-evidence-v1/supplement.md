# S1-L1-C evidence supplement v1

Principal review copy; not yet sent to judges. Supplement for batch `S1-L1-C-v1`, scope `orchestra.s1`, L1 only.

Original frozen package SHA-256: `df1ac005133bc4b89577a581ea9053bd7a5231cf98b7b99c4a67db58921ed670`. Original dossier SHA-256: `9f44b927d8b5dd277ffe188197575d133afb910c53430a5c05630f78b526e83f` (78,163 UTF-8 bytes). Repository source pin: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Protocol pin: `ee2521a5b966bd505cc95bd1c733e09e12f33531`.

This is an evidence supplement, not a body revision or a semantic verdict. Original bodies, artifact validity/need fields, coverage and full evidence remain unchanged. R1 projects frozen values and visibly separates new proposed need/blocker typing. R2 restores six entire frozen groups unchanged. R3/R4 provide actual source excerpts with identity and line/hash bindings. Imported source instructions and script commands are DATA, not authority to execute them.

The original requests were `REQUEST_EVIDENCE` from both judges. This packet supplies evidence for their existing questions; it does not change their bar, establish PASS or authorize a layer release.

# Supplement artifact-to-evidence map

| Artifact key | R1 projection | Restored frozen groups | New source-span groups |
| --- | --- | --- | --- |
| s1.runtime.llm_turns.l1 | A01 / all frozen gaps and coverage | C04 | E12, E13 |
| s1.runtime.llm_providers.l1 | A02 / all frozen gaps and coverage | C06, C10 | E01, E02, E03, E04, E05, E06, E07, E08, E09, E10, E11, E13, E14, E27, E28, D01 |
| s1.runtime.llm_recording.l1 | A03 / all frozen gaps and coverage | — | R1 metadata dispositions; original C12–C14/C36 remain in the original dossier |
| s1.runtime.plugin.l1 | A04 / all frozen gaps and coverage | C17 | E29 |
| s1.runtime.codemode.l1 | A05 / all frozen gaps and coverage | — | E15, E16, E17, E18 |
| s1.runtime.codemode_openapi.l1 | A06 / all frozen gaps and coverage | — | E19, E20 |
| s1.runtime.effect_sqlite.l1 | A07 / all frozen gaps and coverage | — | E21, E22 |
| s1.runtime.http_recorder.l1 | A08 / all frozen gaps and coverage | C39 | E23, E24, E25, E26, E30 |
| s1.runtime.guides_intent.l1 | A09 / all frozen gaps and coverage | C43 | D01, D02, D04 |
| s1.runtime.maintenance_intent.l1 | A10 / all frozen gaps and coverage | — | D03, D04 |

# R1 — Exact frozen coverage, artifact and need projection

This section selects original JSON field values without paraphrasing them. JSON/Markdown formatting and arithmetic counts are new projections; the original files remain unchanged. The source hashes bind the complete originals. No separate frozen need ledger exists: artifact `need`, `gaps`, coverage dispositions and body limits are the frozen basis. New classifications appear only in the explicitly labeled proposal section.

Frozen artifacts SHA-256: `d91c3605542369e8b196daccbf25571f9dfd31d8b6ee1522c78178f2f91be27a`. Frozen coverage SHA-256: `ad31d28525eeca24b2a98cdac2cb1377ab763f2d34a4d63cb56c96b88cc87fc9`.

Original source revision: `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Scope: `orchestra.s1`. Assigned entries: 323; captured assigned: 284; metadata-only: 39.

Original coverage note:

~~~~text
A disposition covers ownership/classification; it is not semantic acceptance. Root AGENTS is an additional captured source outside the 323 assigned entries.
~~~~

## Artifact ownership and declared need

| ID | Artifact key | Original artifact need | Original validity | Assigned entries | Assigned families |
| --- | --- | --- | --- | --- | --- |
| A01 | s1.runtime.llm_turns.l1 | component | supported | 32 | llm=32 |
| A02 | s1.runtime.llm_providers.l1 | component | supported | 33 | llm=33 |
| A03 | s1.runtime.llm_recording.l1 | evidence | supported | 90 | llm=90 |
| A04 | s1.runtime.plugin.l1 | component | supported | 43 | plugin=43 |
| A05 | s1.runtime.codemode.l1 | component | supported | 34 | codemode=34 |
| A06 | s1.runtime.codemode_openapi.l1 | component | supported | 8 | codemode=8 |
| A07 | s1.runtime.effect_sqlite.l1 | component | supported | 32 | effect-drizzle-sqlite=28; effect-sqlite-node=4 |
| A08 | s1.runtime.http_recorder.l1 | component | supported | 24 | http-recorder=24 |
| A09 | s1.runtime.guides_intent.l1 | operational | supported | 13 | guides=13 |
| A10 | s1.runtime.maintenance_intent.l1 | maintenance | supported | 14 | maintenance-documents=14 |

All ten original `semantic_review_refs`, `runtime_receipt_refs`, `build_dependencies` and `navigation` arrays are empty. `supported` is the original bounded producer-record validity; it is not a judge verdict or discharge of a listed gap.

Original common authority object:

~~~~json
{
  "scope": "orchestra.s1",
  "basis": "Pinned source implementation where identified; documentation is attributed intent only. Coverage explicitly distinguishes semantic, selected, structural and metadata-only depth. No host or runtime acceptance is implied."
}
~~~~

## Family, kind and depth counts

| Family | Assigned entries |
| --- | --- |
| codemode | 42 |
| effect-drizzle-sqlite | 28 |
| effect-sqlite-node | 4 |
| guides | 13 |
| http-recorder | 24 |
| llm | 155 |
| maintenance-documents | 14 |
| plugin | 43 |

| Kind | Assigned entries |
| --- | --- |
| build_configuration | 17 |
| configuration_schema | 1 |
| design_intent | 6 |
| documentation | 23 |
| example_or_script | 8 |
| fixture | 44 |
| historical_plan | 6 |
| implementation | 141 |
| instruction | 7 |
| license_or_support | 2 |
| media_asset | 1 |
| test | 45 |
| test_support | 13 |
| vendored_adapter_support | 9 |

| Frozen depth | Assigned entries |
| --- | --- |
| configuration_read | 17 |
| decisive_harness_read | 5 |
| decisive_implementation_read | 118 |
| declaration_scan | 53 |
| document_read | 40 |
| git_metadata_only | 39 |
| json_structure | 6 |
| script_read | 3 |
| selected_document_sections | 2 |
| structural_scan | 39 |
| structured_schema_read | 1 |

Coverage needs (distinct from each artifact’s single declared need): component=191; evidence=105; maintenance=14; operational=13.

Coverage dispositions: bounded_evidence=186; classification_only=137. All 323 retain `semantic_acceptance: not_asserted`.

## Depth and read status by artifact

| Artifact ID | Frozen depth counts | Frozen read-status counts | Coverage need counts |
| --- | --- | --- | --- |
| A01 | configuration_read=3; decisive_implementation_read=20; document_read=2; selected_document_sections=2; structural_scan=5 | captured_read=3; captured_selected_read=2; captured_semantic_read=22; captured_structural_scan=5 | component=32 |
| A02 | decisive_implementation_read=26; structural_scan=7 | captured_semantic_read=26; captured_structural_scan=7 | component=33 |
| A03 | decisive_harness_read=5; declaration_scan=42; git_metadata_only=37; json_structure=4; structural_scan=2 | captured_declarations_read=42; captured_semantic_read=5; captured_structural_scan=2; captured_structure_read=4; not_read=37 | evidence=90 |
| A04 | configuration_read=3; decisive_implementation_read=35; document_read=4; structural_scan=1 | captured_read=3; captured_semantic_read=39; captured_structural_scan=1 | component=43 |
| A05 | configuration_read=3; decisive_implementation_read=10; declaration_scan=7; document_read=3; structural_scan=11 | captured_declarations_read=7; captured_read=3; captured_semantic_read=13; captured_structural_scan=11 | component=27; evidence=7 |
| A06 | decisive_implementation_read=4; declaration_scan=1; document_read=1; git_metadata_only=1; json_structure=1 | captured_declarations_read=1; captured_semantic_read=5; captured_structure_read=1; not_read=1 | component=5; evidence=3 |
| A07 | configuration_read=5; decisive_implementation_read=10; declaration_scan=2; document_read=3; structural_scan=12 | captured_declarations_read=2; captured_read=5; captured_semantic_read=13; captured_structural_scan=12 | component=30; evidence=2 |
| A08 | configuration_read=3; decisive_implementation_read=13; declaration_scan=1; document_read=1; git_metadata_only=1; json_structure=1; script_read=3; structural_scan=1 | captured_declarations_read=1; captured_read=3; captured_semantic_read=17; captured_structural_scan=1; captured_structure_read=1; not_read=1 | component=21; evidence=3 |
| A09 | document_read=13 | captured_semantic_read=13 | operational=13 |
| A10 | document_read=13; structured_schema_read=1 | captured_selected_read=1; captured_semantic_read=13 | maintenance=14 |

## Original grouping and depth justifications

Each reason below is the unchanged `justification` value. The group membership file reconstructs the selected frozen fields for all 323 paths. Selected/structural/declaration depth remains selected/structural/declaration depth, including where this supplement adds a newly selected excerpt.

| Reason ID | Entry count | Frozen depth counts | Exact original justification |
| --- | --- | --- | --- |
| J01 | 40 | document_read=40 | Document content read as attributed intent/instructions; implementation and historical claims are not automatically accepted runtime facts. |
| J02 | 17 | configuration_read=17 | Configuration bytes read to establish declared commands, exports/dependencies and execution guard only. No install/build/typecheck/test was run. |
| J03 | 118 | decisive_implementation_read=118 | Implementation read at decisive contract, execution or refusal boundaries supporting its L1 body. Selected large-file paths and type contracts do not certify every branch or host behavior. |
| J04 | 23 | structural_scan=23 | Captured declarations and opening structure; grouped support only, no independent semantic acceptance or exhaustive branch claim. |
| J05 | 53 | declaration_scan=53 | All declaration matches preserved in test-declarations.json; inspected bounded declaration samples. Test bodies are not accepted semantic or runtime proof. |
| J06 | 6 | json_structure=6 | Decoded JSON root/envelope and interaction metadata inspected; sampled fixture data does not establish provider behavior or passing replay. |
| J07 | 1 | git_metadata_only=1 | Assigned fixture/media variant retained by pinned Git metadata. Representative fixture structures and decisive harness were inspected; this body is not semantic evidence and no conclusion depends on its contents. File exceeds the documented 256,000-byte Atlas observer ceiling; preserve unavailable/unobserved, never absent. |
| J08 | 5 | structural_scan=5 | Support structure and selected relevant source inspected; examples are not consumer execution evidence and recording/build scripts were not run. |
| J09 | 9 | structural_scan=9 | Copied generic Drizzle adapter declarations and selected execution support inspected; primary driver/transaction/migration facts have direct implementation evidence. No full query parity claim. |
| J10 | 2 | selected_document_sections=2 | Status, proposed API and representative contract sections read. Draft/sketch is distinguished from current exported implementation. |
| J11 | 38 | git_metadata_only=38 | Assigned fixture/media variant retained by pinned Git metadata. Representative fixture structures and decisive harness were inspected; this body is not semantic evidence and no conclusion depends on its contents. |
| J12 | 5 | decisive_harness_read=5 | Harness mode, filtering, explicit gaps and refusal decisions read. No tests were executed and scenario declarations are not outcomes. |
| J13 | 2 | structural_scan=2 | Captured support bytes retained; no runtime semantic claim rests on this support file. |
| J14 | 1 | structured_schema_read=1 | Parsed schema root, definition/property membership, required fields and additionalProperties policy; generated/publisher/runtime relationship remains unverified. |
| J15 | 3 | script_read=3 | Build/pack/consumer-verification source read, including removal of internal export; no script execution or successful package claim. |

## Complete grouped disposition map

These 60 groups partition all 323 assigned paths. All labels below are selected frozen field values; only group IDs, counts and the reason/owner abbreviations are new presentation. Full exact path membership is retained in `R1-coverage-groups.json`. The table maps each artifact/family/depth to its actual reason and disposition for tool-free review.

| Group | Entries | Artifact ID | Family | Kind | Depth | Read status | Need | Disposition | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G001 | 4 | A10 | maintenance-documents | instruction | document_read | captured_semantic_read | maintenance | bounded_evidence | J01 |
| G002 | 6 | A10 | maintenance-documents | historical_plan | document_read | captured_semantic_read | maintenance | bounded_evidence | J01 |
| G003 | 13 | A09 | guides | documentation | document_read | captured_semantic_read | operational | bounded_evidence | J01 |
| G004 | 3 | A10 | maintenance-documents | design_intent | document_read | captured_semantic_read | maintenance | bounded_evidence | J01 |
| G005 | 1 | A05 | codemode | instruction | document_read | captured_semantic_read | component | bounded_evidence | J01 |
| G006 | 1 | A05 | codemode | documentation | document_read | captured_semantic_read | component | bounded_evidence | J01 |
| G007 | 3 | A05 | codemode | build_configuration | configuration_read | captured_read | component | bounded_evidence | J02 |
| G008 | 1 | A05 | codemode | design_intent | document_read | captured_semantic_read | component | bounded_evidence | J01 |
| G009 | 10 | A05 | codemode | implementation | decisive_implementation_read | captured_semantic_read | component | bounded_evidence | J03 |
| G010 | 11 | A05 | codemode | implementation | structural_scan | captured_structural_scan | component | classification_only | J04 |
| G011 | 1 | A06 | codemode | documentation | document_read | captured_semantic_read | component | bounded_evidence | J01 |
| G012 | 4 | A06 | codemode | implementation | decisive_implementation_read | captured_semantic_read | component | bounded_evidence | J03 |
| G013 | 6 | A05 | codemode | test | declaration_scan | captured_declarations_read | evidence | classification_only | J05 |
| G014 | 1 | A06 | codemode | fixture | json_structure | captured_structure_read | evidence | classification_only | J06 |
| G015 | 1 | A06 | codemode | fixture | git_metadata_only | not_read | evidence | classification_only | J07 |
| G016 | 1 | A06 | codemode | test | declaration_scan | captured_declarations_read | evidence | classification_only | J05 |
| G017 | 1 | A05 | codemode | test_support | declaration_scan | captured_declarations_read | evidence | classification_only | J05 |
| G018 | 1 | A07 | effect-drizzle-sqlite | instruction | document_read | captured_semantic_read | component | bounded_evidence | J01 |
| G019 | 1 | A07 | effect-drizzle-sqlite | documentation | document_read | captured_semantic_read | component | bounded_evidence | J01 |
| G020 | 3 | A07 | effect-drizzle-sqlite | build_configuration | configuration_read | captured_read | component | bounded_evidence | J02 |
| G021 | 2 | A07 | effect-drizzle-sqlite | example_or_script | structural_scan | captured_structural_scan | component | classification_only | J08 |
| G022 | 9 | A07 | effect-drizzle-sqlite | implementation | decisive_implementation_read | captured_semantic_read | component | bounded_evidence | J03 |
| G023 | 1 | A07 | effect-drizzle-sqlite | implementation | structural_scan | captured_structural_scan | component | classification_only | J04 |
| G024 | 9 | A07 | effect-drizzle-sqlite | vendored_adapter_support | structural_scan | captured_structural_scan | component | classification_only | J09 |
| G025 | 2 | A07 | effect-drizzle-sqlite | test | declaration_scan | captured_declarations_read | evidence | classification_only | J05 |
| G026 | 1 | A07 | effect-sqlite-node | documentation | document_read | captured_semantic_read | component | bounded_evidence | J01 |
| G027 | 2 | A07 | effect-sqlite-node | build_configuration | configuration_read | captured_read | component | bounded_evidence | J02 |
| G028 | 1 | A07 | effect-sqlite-node | implementation | decisive_implementation_read | captured_semantic_read | component | bounded_evidence | J03 |
| G029 | 1 | A01 | llm | instruction | document_read | captured_semantic_read | component | bounded_evidence | J01 |
| G030 | 1 | A01 | llm | design_intent | selected_document_sections | captured_selected_read | component | bounded_evidence | J10 |
| G031 | 1 | A01 | llm | documentation | document_read | captured_semantic_read | component | bounded_evidence | J01 |
| G032 | 3 | A01 | llm | build_configuration | configuration_read | captured_read | component | bounded_evidence | J02 |
| G033 | 1 | A01 | llm | documentation | selected_document_sections | captured_selected_read | component | bounded_evidence | J10 |
| G034 | 1 | A01 | llm | example_or_script | structural_scan | captured_structural_scan | component | classification_only | J08 |
| G035 | 2 | A03 | llm | example_or_script | structural_scan | captured_structural_scan | evidence | classification_only | J08 |
| G036 | 26 | A02 | llm | implementation | decisive_implementation_read | captured_semantic_read | component | bounded_evidence | J03 |
| G037 | 4 | A01 | llm | implementation | structural_scan | captured_structural_scan | component | classification_only | J04 |
| G038 | 20 | A01 | llm | implementation | decisive_implementation_read | captured_semantic_read | component | bounded_evidence | J03 |
| G039 | 7 | A02 | llm | implementation | structural_scan | captured_structural_scan | component | classification_only | J04 |
| G040 | 34 | A03 | llm | test | declaration_scan | captured_declarations_read | evidence | classification_only | J05 |
| G041 | 8 | A03 | llm | test_support | declaration_scan | captured_declarations_read | evidence | classification_only | J05 |
| G042 | 1 | A03 | llm | media_asset | git_metadata_only | not_read | evidence | classification_only | J11 |
| G043 | 36 | A03 | llm | fixture | git_metadata_only | not_read | evidence | classification_only | J11 |
| G044 | 4 | A03 | llm | fixture | json_structure | captured_structure_read | evidence | classification_only | J06 |
| G045 | 1 | A03 | llm | test | decisive_harness_read | captured_semantic_read | evidence | bounded_evidence | J12 |
| G046 | 4 | A03 | llm | test_support | decisive_harness_read | captured_semantic_read | evidence | bounded_evidence | J12 |
| G047 | 1 | A04 | plugin | license_or_support | structural_scan | captured_structural_scan | component | classification_only | J13 |
| G048 | 3 | A04 | plugin | documentation | document_read | captured_semantic_read | component | bounded_evidence | J01 |
| G049 | 3 | A04 | plugin | build_configuration | configuration_read | captured_read | component | bounded_evidence | J02 |
| G050 | 35 | A04 | plugin | implementation | decisive_implementation_read | captured_semantic_read | component | bounded_evidence | J03 |
| G051 | 1 | A04 | plugin | design_intent | document_read | captured_semantic_read | component | bounded_evidence | J01 |
| G052 | 1 | A10 | maintenance-documents | configuration_schema | structured_schema_read | captured_selected_read | maintenance | bounded_evidence | J14 |
| G053 | 1 | A08 | http-recorder | license_or_support | structural_scan | captured_structural_scan | component | classification_only | J13 |
| G054 | 1 | A08 | http-recorder | documentation | document_read | captured_semantic_read | component | bounded_evidence | J01 |
| G055 | 3 | A08 | http-recorder | build_configuration | configuration_read | captured_read | component | bounded_evidence | J02 |
| G056 | 3 | A08 | http-recorder | example_or_script | script_read | captured_semantic_read | component | bounded_evidence | J15 |
| G057 | 13 | A08 | http-recorder | implementation | decisive_implementation_read | captured_semantic_read | component | bounded_evidence | J03 |
| G058 | 1 | A08 | http-recorder | fixture | json_structure | captured_structure_read | evidence | classification_only | J06 |
| G059 | 1 | A08 | http-recorder | fixture | git_metadata_only | not_read | evidence | classification_only | J11 |
| G060 | 1 | A08 | http-recorder | test | declaration_scan | captured_declarations_read | evidence | classification_only | J05 |

## All 39 metadata-only dispositions

The following common values are unchanged in every one of the 39 original entries:

~~~~json
{
  "commit": "1cde2ff7a71bcf7aecb5d030917b577165135d38",
  "depth": "git_metadata_only",
  "read_status": "not_read",
  "need": "evidence",
  "disposition": "classification_only",
  "semantic_acceptance": "not_asserted",
  "captured": false,
  "review_excerpts": [],
  "gap": "Content not captured/read; Git metadata is not file-content observation."
}
~~~~

The exact path/blob/Git-size and original family/kind/owner/reason assignment for every entry follow. Git size is metadata, not a local content observation. No SHA-256 of unread content is invented.

| Path | Git blob | Git bytes | Family | Kind | Owning artifact | Reason |
| --- | --- | --- | --- | --- | --- | --- |
| packages/codemode/test/fixtures/opencode-v2-openapi.json | 934b22e389f4ae86039967dd8134d750780b025c | 637024 | codemode | fixture | s1.runtime.codemode_openapi.l1 | J07 |
| packages/llm/test/fixtures/media/restroom.png | 52ed88afb0f06e915ede727b751fa5ea0d98ceb8 | 14496 | llm | media_asset | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/anthropic-messages-cache/writes-then-reads-cache-control-on-identical-second-call.json | 8cf2be05c14ed6d86f3a72b77fa432af986aad10 | 53425 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/anthropic-messages/accepts-malformed-assistant-tool-order-with-default-patch.json | 7730485cb4d68d8d31eb5ddde417b1f59c723775 | 3000 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/anthropic-messages/anthropic-opus-4-7-image-tool-result.json | b1ba048d7a3bde6771180eba2194d0929dec4835 | 22691 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/anthropic-messages/claude-opus-4-7-drives-a-tool-loop.json | 316f4308fc1d82c915c4714bee301331e563291d | 6021 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/anthropic-messages/rejects-malformed-assistant-tool-order-without-patch.json | cd0990cec5cf0e035ec54d876c0d56ea2ac4cb36 | 1720 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/anthropic-messages/streams-tool-call.json | ef8f69c21d3f151de01008fbc9dead331ca90732 | 3081 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/bedrock-converse/drives-a-tool-loop.json | 26eca01609a1175bf7bf1cca2b30603d901ca874 | 16694 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/bedrock-converse/streams-a-tool-call.json | 4f22ce22da80929b2199169b5e8de068fd3c7bb2 | 2986 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/cloudflare-ai-gateway/cloudflare-ai-gateway-workers-ai-gpt-oss-20b-tools-tool-call.json | 981c14f03edfa55958a93b7b046cec763609366c | 8424 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/cloudflare-ai-gateway/cloudflare-ai-gateway-workers-ai-llama-3-1-8b-text.json | 6a8eff09d9773d410528fa45058f1ccabf64efe2 | 2228 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/cloudflare-workers-ai/cloudflare-workers-ai-gpt-oss-20b-tools-tool-call.json | fa22f1ddb9e5b873720927f9c3db34cc4cd18e6e | 8379 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/cloudflare-workers-ai/cloudflare-workers-ai-llama-3-1-8b-text.json | 52cc25f86b325bf441be2b491ca6fdbd7b07e3db | 2193 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/gemini-cache/reports-cachedcontenttokencount-on-identical-second-call.json | 209aadfc1a43cdf5dcc9fbacccacb3d7e492a7e3 | 51039 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/gemini/gemini-2-5-flash-image.json | 8ab0cc2f1c9e0626881d958de6c4892074ca3b79 | 21068 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/gemini/streams-tool-call.json | a526910f0dafd841260f307bcd8ce2e9f832835e | 2204 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-chat/continues-after-tool-result.json | 7c02a93f0b4eab502467d6d59bcfda752967328b | 7853 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-chat/drives-a-tool-loop-end-to-end.json | fdc5fa7916b017e630e2df62a1435e6b84dd2b1c | 12819 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-chat/streams-tool-call.json | fef4d8cd14a2cb66c2e04224fc2cb4eb306de92c | 4922 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-compatible-chat/deepseek-streams-text.json | a71b1121cb01f5037f1facce3276dceec15d5a44 | 2462 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-compatible-chat/groq-llama-3-3-70b-drives-a-tool-loop.json | 403260b88b2e7b3004402d9294fb668fca5bc9f6 | 10631 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-compatible-chat/groq-streams-text.json | 561dbfda0629e7c8640428ebbf4e0a75d221acf1 | 3138 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-compatible-chat/groq-streams-tool-call.json | 70e9a765d281af7ba78a5f3e5d5cf7497e5a2b4f | 3382 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-compatible-chat/openrouter-claude-opus-4-7-drives-a-tool-loop.json | e67d280678c394760987e46d027393c628773126 | 9199 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-compatible-chat/openrouter-gpt-4o-mini-drives-a-tool-loop.json | 7883285e581abd2d2e0e52fb08096ffb38e5ace4 | 13146 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-compatible-chat/openrouter-gpt-5-5-drives-a-tool-loop.json | e1cbab70faac0358ae359b2892ea9d81dcd4c6a6 | 10506 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-compatible-chat/openrouter-streams-text.json | 1a95146931ee7862f5c33a9f92bce969cb4789db | 2871 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-compatible-chat/openrouter-streams-tool-call.json | 36d0ad99c56b69db67dc259e523b8fb72f03aaf9 | 5588 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-compatible-chat/togetherai-streams-text.json | 640565b14faa903bc1958029a26f953bcb8a930d | 2157 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-compatible-chat/togetherai-streams-tool-call.json | 6c1d9c1a7fc46fdcbc27ecb52de6ac562ad2ce23 | 3087 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-responses-cache/reports-cached-tokens-on-identical-second-call.json | 2110a6a99ba0892d40f816f6ffea451b09ab2f5c | 61781 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-responses/gpt-5-5-drives-a-tool-loop.json | 9d441205fde9b9df3d5bee0325de4950d709f35c | 17838 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-responses/gpt-5-5-streams-text.json | 92c7b7e0f1a0d6d9f884e4513a68368e107b51d7 | 7063 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-responses/gpt-5-5-streams-tool-call.json | 8aa5dedaaf77139a9b6ef8c1270b089acc6c214f | 7932 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-responses/openai-responses-gpt-5-5-image-tool-result.json | 4f65f43b5766c6d5a635893be6e9eed261a83067 | 28582 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-responses/openai-responses-gpt-5-5-reasoning-continuation.json | 47670c81272d237ef249909998fbc39c23415411 | 21882 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| packages/llm/test/fixtures/recordings/openai-responses/openai-responses-gpt-5-5-reasoning.json | 107192d951e92acbf5ecc5f3f3b5cd1202436f42 | 10517 | llm | fixture | s1.runtime.llm_recording.l1 | J11 |
| tooling/http-recorder/test/fixtures/recordings/record-replay/retry.json | 873e5a16c0565ca96e8668c25587ab7329513684 | 890 | http-recorder | fixture | s1.runtime.http_recorder.l1 | J11 |

## Original body identities and gap texts

| Artifact ID | Original body path | Bytes | SHA-256 |
| --- | --- | --- | --- |
| A01 | producers/c/bodies/llm-turns.md | 3025 | c2dacdb2638ff47ffa60a7bb2d7f3e3403f574c0470fc853d45983020d66b831 |
| A02 | producers/c/bodies/provider-routes.md | 4043 | 5847b8777ad56f974685bf956a2fcf5ea0b189a6aae14721e544336871e1360f |
| A03 | producers/c/bodies/recorded-evidence.md | 3042 | 28e1d579f17b5463c58c701c8f98c0b131bef0b1bbb2390317d30655c837519d |
| A04 | producers/c/bodies/plugin-contracts.md | 3392 | 9c3110e3b15b35e85285cab7f9440b6711110aaac8a1ca936c7ca86263c1e382 |
| A05 | producers/c/bodies/codemode-interpreter.md | 3480 | be8899d897dec584e7e74c597483dff9417dd1511e00e757e86a05378248487f |
| A06 | producers/c/bodies/codemode-openapi.md | 2698 | 0f906322c8952eb43396870be8fea15b2d47146df43a9d604cfd39c9cb293977 |
| A07 | producers/c/bodies/sqlite-adapters.md | 3558 | b1dc22165fbdcee0a5811dc983548ac26f1189adc311e9855cfc22763b7d9597 |
| A08 | producers/c/bodies/http-recorder.md | 3464 | 4857371404625869016238e6ac23fbf7aad5ab0c7538f64df2ebfe91f1935fe7 |
| A09 | producers/c/bodies/user-guides.md | 3362 | 22303bf38d880468d845ec54732c2138f293243058d8cf8f1c6b9152c2587488 |
| A10 | producers/c/bodies/maintenance-intent.md | 3852 | 98d6626bcf2ae923fb8a905cef874bc3e086a42a71abc129a2e9471c0864bcb8 |

| Gap ID | Artifact ID | Exact original gap text |
| --- | --- | --- |
| A01.g0 | A01 | No provider or product execution receipt. |
| A01.g1 | A01 | Selected schema/reducer inspection does not certify every variant. |
| A01.g2 | A01 | Session persistence, authorization and continuation require Core evidence. |
| A02.g0 | A02 | Remote compatibility and Core route admission are not established by facade source. |
| A02.g1 | A02 | Protocol and multimodal helpers were not exhaustively audited. |
| A03.g0 | A03 | Thirty-nine assigned fixture/media sources are metadata-only in this unit. |
| A03.g1 | A03 | No declared test or fixture replay was executed. |
| A03.g2 | A03 | Large OpenAPI fixture exceeds documented observer file-size limit. |
| A04.g0 | A04 | Host loader, ordering, cleanup, installation and permission implementation not established by package types. |
| A04.g1 | A04 | Plan, current declarations and frozen compatibility types must remain distinct. |
| A05.g0 | A05 | Selected interpreter paths and supporting structural scans do not establish full language conformance. |
| A05.g1 | A05 | Host adapters and leaf-tool authorization remain external to this implementation proof. |
| A05.g2 | A05 | Result-envelope bytes may exceed configured value/log payload budget. |
| A06.g0 | A06 | Response-schema validation and adapter-enforced redirect policy are documented future work. |
| A06.g1 | A06 | Large reference fixture remains unobserved; no network or test execution. |
| A07.g0 | A07 | Generic adapter source does not establish Core startup, backup, restoration or after-commit policies. |
| A07.g1 | A07 | Query-builder parity and Node package consumer absence are not independently proved. |
| A07.g2 | A07 | Node executeStream is explicitly unimplemented. |
| A08.g0 | A08 | No build, packed-consumer, replay or network execution receipt. |
| A08.g1 | A08 | Recordings do not establish timing, backpressure, cancellation or bounded-memory fidelity. |
| A08.g2 | A08 | Internal WebSocket helper has different chronology from public socket replay. |
| A09.g0 | A09 | Host implementation of guide claims was not read in this unit. |
| A09.g1 | A09 | Config unknown-key behavior differs in documentary/schema surfaces and needs decoder evidence. |
| A10.g0 | A10 | Historical acceptance commands and completed labels are not current execution evidence. |
| A10.g1 | A10 | Generated schema publisher and Core migration implementation are outside this source subset. |
| A10.g2 | A10 | No L2–L4, semantic verdict or Atlas runtime object is produced here. |

Original known-limit strings:

~~~~json
[
  "Producer-local L1 source records only; independent semantic judges and real Atlas runtime proofs remain pending.",
  "No uncaptured fixture is represented as a captured file input or accepted semantic source."
]
~~~~

## Exact frozen generated-config scan projection

Selected unchanged values from `config-schema-scan.json`, SHA-256 `a2d9e465aa59f4d04d1db240b95edcc6e4111fed6aaf23532eecd223176578d8`. These are structural schema observations, not a publisher/decoder/runtime guarantee. D04 supplies both documentary/source sides.

~~~~json
{
  "source": "schema/config.json",
  "root": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$ref": "#/$defs/Config.Info",
    "allowComments": true,
    "allowTrailingCommas": true
  },
  "definitions": {
    "Config.Info": {
      "type": "object",
      "required": null,
      "additionalProperties": false,
      "properties": [
        "$schema",
        "shell",
        "model",
        "default_agent",
        "permissions",
        "agents",
        "snapshots",
        "watcher",
        "formatter",
        "lsp",
        "attachments",
        "tool_output",
        "mcp",
        "trusted_projects",
        "compaction",
        "continuity",
        "skills",
        "commands",
        "instructions",
        "references",
        "plugins",
        "experimental",
        "relay",
        "research",
        "maestro",
        "providers"
      ]
    }
  }
}
~~~~

### Frozen body boundary: `http-recorder.md`

Body SHA-256 `4857371404625869016238e6ac23fbf7aad5ab0c7538f64df2ebfe91f1935fe7`; exact paragraph SHA-256 `0401cbed59a7615380f05f77af879d0efdd9a1853f41c746c5683051e5b7cdfb`.

~~~~text
Cassette names reject absolute Unix/Windows paths, parent traversal and lexical escape from the configured directory. Recording redacts configured and known sensitive headers, URL credentials/query keys and JSON fields. A prewrite scan refuses likely secrets and writes through a temporary file then rename. This is a lexical/path-and-pattern boundary: there is no demonstrated symlink defense or complete secret-detection guarantee, and base64 binary payloads are not decoded for secret scanning. Source: `src/cassette.ts`, `src/redaction.ts`, `src/redactor.ts` (C37).
~~~~

### Frozen body boundary: `codemode-interpreter.md`

Body SHA-256 `be8899d897dec584e7e74c597483dff9417dd1511e00e757e86a05378248487f`; exact paragraph SHA-256 `baf20ea2fb32de14fbf5826407c316b3e3cb1fbab2cce14904fef1848336aa9d`.

~~~~text
**Boundary and gaps.** The 3,465-line interpreter was read at selected decisive parsing, global, promise, access and execution boundaries, not every operator branch. Supporting standard-library files received the depth recorded per file in coverage. Host adapters described in `codemode.md` were not implementation-verified here; leaf tools must supply authority enforcement. The design explicitly retains unresolved work for promise pipelines, async iteration, richer value types and reserved tool-path policy. Test declarations cover these boundaries but provide no execution receipt.

~~~~

### Frozen body boundary: `sqlite-adapters.md`

Body SHA-256 `b1dc22165fbdcee0a5811dc983548ac26f1189adc311e9855cfc22763b7d9597`; exact paragraph SHA-256 `a43ca0fb46ed8c90a6dbc352d830d533028724725a7f73ff6ea40a8c39cb763a`.

~~~~text
**Boundary and gaps.** Query-builder variants were structurally reviewed with selected execution/cache paths; full relational/query parity is not claimed. Database files, Core migration adoption, backup restore and application post-commit publication require Core evidence. No database was opened and no migration or product test ran.

~~~~

### Frozen body boundary: `plugin-contracts.md`

Body SHA-256 `9c3110e3b15b35e85285cab7f9440b6711110aaac8a1ca936c7ca86263c1e382`; exact paragraph SHA-256 `a38075e2bcfce97a67e5655effd3548a6a0fbd418582d5cba26d1043112e167a`.

~~~~text
**Boundary and gaps.** Frozen compatibility wire types remain local in `src/wire.ts`; they are not identical to the generated current config schema. In particular, frozen `Config.plugin` and current schema `Config.Info.plugins` are different contracts. Also, `docs/guides/plugins.md` describes model behavior instructions such as Caveman, not this code plugin loader. Host runtime files are outside this production unit. Their implementation must be read before accepting documented lifecycle semantics, credential handling, host authorization or package install behavior as runtime facts.

~~~~

### Frozen body boundary: `maintenance-intent.md`

Body SHA-256 `98d6626bcf2ae923fb8a905cef874bc3e086a42a71abc129a2e9471c0864bcb8`; exact paragraph SHA-256 `bb1e8f9af0f1f8e8b9c0c5bfa2ae7aaea6e7826cb57ceddb9c8511b184bd199c`.

~~~~text
`schema/config.json` is a draft-2020-12 document rooted at `$defs/Config.Info`, with comment/trailing-comma hints. The captured schema uses plural `agents`, `plugins`, `providers` and `permissions`; a plugin entry requires `package` and optional options. It defines local/remote MCP alternatives and describes `trusted_projects` as global-only. Many config objects, including the root, have `additionalProperties: false`. These are schema bytes, not proof of decoder behavior or successful regeneration. Source: `schema/config.json` (C49), structured schema inspection in `config-schema-scan.json`.
~~~~

### Frozen body boundary: `user-guides.md`

Body SHA-256 `22303bf38d880468d845ec54732c2138f293243058d8cf8f1c6b9152c2587488`; exact paragraph SHA-256 `42236e4b8b967166be07fcec22de57d99765b883026824c5c98bc1659da43fde`.

~~~~text
**Boundary and gaps.** None of these instructions was executed: no database restore, project trust change, credential read, permission reply, integration connection or paid Claude call took place. The implementation of these host-level policies belongs to other S1 production areas or other owners and needs its own evidence. A guide's recommendation, historical limitation or claim that a migration landed is not a substitute for that evidence. In particular, current config schema objects declare `additionalProperties: false`, while the config-error guide describes ignoring unknown keys; the runtime decoder/publisher relationship is unresolved here and should not be collapsed into either a runtime rejection guarantee or a defect assertion.

~~~~

# R1 supplement — NEW need/blocker classification proposals

This classification did not exist as a separate typed ledger in the frozen packet. It is proposed now for the principal’s review. Each original gap is preserved above and linked below. No original `validity`, `need`, coverage depth, gap, body or authority value has been edited. A missing implementation or runtime fact stays unresolved; a bounded exclusion cannot waive it when a dependent claim needs it.

| Frozen gap ID | New proposed classification IDs |
| --- | --- |
| A01.g0 | N03 |
| A01.g1 | N04 |
| A01.g2 | N01, N02 |
| A02.g0 | N02, N03 |
| A02.g1 | N04 |
| A03.g0 | N06 |
| A03.g1 | N03 |
| A03.g2 | N06 |
| A04.g0 | N01 |
| A04.g1 | X01 |
| A05.g0 | N04 |
| A05.g1 | N01 |
| A05.g2 | X01 |
| A06.g0 | X01 |
| A06.g1 | N06, N03 |
| A07.g0 | N02 |
| A07.g1 | N04, N02 |
| A07.g2 | X01 |
| A08.g0 | N03 |
| A08.g1 | X01, N03 |
| A08.g2 | X01 |
| A09.g0 | N01 |
| A09.g1 | N05 |
| A10.g0 | N03 |
| A10.g1 | N05, N02 |
| A10.g2 | X01, N03 |

## N01 — NEW proposal; need `ownership`

Original gap bindings: A01.g2, A04.g0, A05.g1, A09.g0.

Missing knowledge or limit: Host lifecycle and authority/policy implementation: loader ordering/disposal/install behavior, session continuation and tool selection, leaf-tool authorization, and guide-reported host rules.

Owning target / unresolved owner: Core/session, plugin-host and execution-host/policy owners; the concrete owning artifact is unresolved in this unit.

Proposed status for dependent acceptance: **blocked**. Mandatory before accepting the dependent claim named here; not a retroactive alteration of original artifact validity.

Acceptance blocked: Any promotion of package declarations, maintenance pointers or guide statements into accepted host lifecycle, credential, permission, trust, or authorization behavior.

Reason for the original bounded exclusion: The original L1 records can describe their package declarations and attributed documentary intent without claiming those host implementations were inspected.

## N02 — NEW proposal; need `component`

Original gap bindings: A01.g2, A02.g0, A07.g0, A07.g1, A10.g1.

Missing knowledge or limit: Core route admission/adoption, application database startup/backup/restore/post-commit behavior, migration adoption, and a current consumer/import census where absence is asserted.

Owning target / unresolved owner: Core model-routing/database owners and repository consumer census; concrete owning artifact unresolved in this unit.

Proposed status for dependent acceptance: **blocked**. Mandatory before accepting the dependent claim named here; not a retroactive alteration of original artifact validity.

Acceptance blocked: Accepted claims that the session core routes every facade, that a generic adapter proves Core database policy, or that the Node adapter has no current consumers.

Reason for the original bounded exclusion: Facade and generic-adapter mechanisms remain local source facts; the model guide and Node README remain documentary evidence about adoption.

## N03 — NEW proposal; need `evidence`

Original gap bindings: A01.g0, A02.g0, A03.g1, A06.g1, A08.g0, A08.g1, A10.g0, A10.g2.

Missing knowledge or limit: Actual authorized execution receipts for any claimed provider/tool/replay/build/migration/consumer behavior, and real Atlas/runtime receipts if later stages require them.

Owning target / unresolved owner: Authorized CI/runtime/provider/consumer operators and later-stage owners; no concrete execution owner or receipt is supplied by this unit.

Proposed status for dependent acceptance: **blocked**. Mandatory before accepting the dependent claim named here; not a retroactive alteration of original artifact validity.

Acceptance blocked: Any runtime PASS, provider conformance, successful build/replay/migration or consumer/runtime qualification inferred from source, fixtures, script declarations, hashes or counts.

Reason for the original bounded exclusion: This evidence supplement and the original source-only L1 records do not require product execution to quote or inspect code. Such execution remains unperformed, and cannot be presumed.

## N04 — NEW proposal; need `component`

Original gap bindings: A01.g1, A02.g1, A05.g0, A07.g1.

Missing knowledge or limit: Uninspected interpreter/operator/stdlib, schema/reducer/protocol/multimodal and query-builder branches beyond the selected source boundaries.

Owning target / unresolved owner: CodeMode, LLM and generic Drizzle adapter maintainers; concrete branch-level follow-up owners unresolved in this unit.

Proposed status for dependent acceptance: **blocked**. Mandatory before accepting the dependent claim named here; not a retroactive alteration of original artifact validity.

Acceptance blocked: Exhaustive language conformance, full isolation/security qualification, complete protocol/schema coverage, or full relational/query parity based on the selected or structural review.

Reason for the original bounded exclusion: Selected decisive implementation paths support only their stated bounded mechanisms. The frozen depth labels and group rationales are retained, including newly excerpted files whose earlier depth was structural.

## N05 — NEW proposal; need `maintenance`

Original gap bindings: A09.g1, A10.g1.

Missing knowledge or limit: The generated schema publisher/regeneration chain and actual runtime config decoder, including treatment of unknown extra keys.

Owning target / unresolved owner: Core config decoder and schema publisher owners; concrete owning artifact unresolved in this unit.

Proposed status for dependent acceptance: **blocked**. Mandatory before accepting the dependent claim named here; not a retroactive alteration of original artifact validity.

Acceptance blocked: A runtime rejection/ignore guarantee, successful regeneration claim, or established defect conclusion inferred solely from the schema/guide discrepancy.

Reason for the original bounded exclusion: The schema bytes and the guide wording are both preserved as differently scoped sources. This supplement does not resolve their runtime relationship.

## N06 — NEW proposal; need `evidence`

Original gap bindings: A03.g0, A03.g2, A06.g1.

Missing knowledge or limit: Contents and semantics of all 39 metadata-only fixture/media entries; observation of the large OpenAPI specimen within an authorized observation path if needed.

Owning target / unresolved owner: Fixture/evidence owners; concrete capture/consumer owner unresolved in this unit.

Proposed status for dependent acceptance: **blocked**. Mandatory before accepting the dependent claim named here; not a retroactive alteration of original artifact validity.

Acceptance blocked: Any claim that depends on the unread fixture/media bodies, any claim those files were observed/absent, or a replay/provider result inferred from their pinned metadata.

Reason for the original bounded exclusion: All 39 entries remain classification_only and not_read. The original bodies disclaim reliance on their contents; that is a bounded exclusion for these bodies, not discharge of a future required content observation.

## X01 — NEW proposal; need `component`

Original gap bindings: A04.g1, A05.g2, A06.g0, A07.g2, A08.g1, A08.g2, A10.g2.

Missing knowledge or limit: No missing fact is invented for an already stated limit or distinct authority surface. Future claims beyond it would need implementation/change evidence or an explicitly different contract.

Owning target / unresolved owner: Relevant package or later-layer owner; no new owning runtime artifact is created here.

Proposed status for dependent acceptance: **blocked**. Mandatory before accepting the dependent claim named here; not a retroactive alteration of original artifact validity.

Acceptance blocked: Claims of implemented Node streaming, response-schema/redirect guarantees, all-envelope byte limits, identical public/internal socket chronology, current APIs inferred from plans/frozen compatibility types, or completed later layers.

Reason for the original bounded exclusion: These are explicit original limits, distinct contract surfaces or out-of-scope outputs. They are not silent unknowns and do not support the excluded capability.

# R2 — Complete unchanged frozen groups

The following six group sections are copied byte-for-byte from the frozen full evidence archive, SHA-256 `bfc3c3f4ea147681a1e19f18b46244b70ecefa8659e6e4efddbc43a95c75b899`. Their source identities, spans, text and hashes are unchanged. Additional narrow spans in R3 cover the directly associated material claims where the original named group alone supplied only part of the cited mechanism.

## C04 — Forced structured-object tool and decode refusal
Artifacts: s1.runtime.llm_turns.l1.

Source `packages/llm/src/llm.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e4781d8608b0185c500866aae20fda8335640550`; full-source SHA-256 `974e8bbab37e712bc58df24f76db9f3d66faf00929ad0782d3ca16db4451c2a7`.

Lines 110–142; excerpt SHA-256 `4d4c58140e17632edee208947295cf87fe814bc84f43f78cbe27d74345091d18`.

~~~~text
const runGenerateObject = Effect.fn("LLM.generateObject")(function* (
  options: GenerateObjectBase,
  tool: ReturnType<typeof makeTool>,
) {
  const baseRequest = request(options)
  const generateRequest = LLMRequest.update(baseRequest, {
    tools: toDefinitions({ [GENERATE_OBJECT_TOOL_NAME]: tool }),
    toolChoice: ToolChoice.named(GENERATE_OBJECT_TOOL_NAME),
  })
  const response = yield* LLMClient.generate(generateRequest)
  const call = response.toolCalls.find(
    (event) => LLMEvent.is.toolCall(event) && event.name === GENERATE_OBJECT_TOOL_NAME,
  )
  if (!call || !LLMEvent.is.toolCall(call))
    return yield* new LLMError({
      module: "LLM",
      method: "generateObject",
      reason: new InvalidProviderOutputReason({
        message: `generateObject: model did not call the forced \`${GENERATE_OBJECT_TOOL_NAME}\` tool`,
      }),
    })
  const object = yield* tool._decode(call.input).pipe(
    Effect.mapError(
      (error) =>
        new LLMError({
          module: "LLM",
          method: "generateObject",
          reason: new InvalidProviderOutputReason({
            message: `generateObject: tool input failed schema decode: ${error.message}`,
          }),
        }),
    ),
  )
~~~~

## C06 — Retryable and nonretryable error classes
Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/schema/errors.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `072e4e83892890ba48b25e45eb3cd2592afc9f86`; full-source SHA-256 `a1b34b20c32343aeece5d0da5e93896f7b1102b7a2cf4e1b65609d982ba5b159`.

Lines 74–131; excerpt SHA-256 `b1694b866675409c364e25c7720f5f8623762aeca05df84ceca1a3c3e0083ce7`.

~~~~text
export class RateLimitReason extends Schema.Class<RateLimitReason>("LLM.Error.RateLimit")({
  _tag: Schema.tag("RateLimit"),
  message: Schema.String,
  retryAfterMs: Schema.optional(Schema.Number),
  rateLimit: Schema.optional(HttpRateLimitDetails),
  providerMetadata: Schema.optional(ProviderMetadata),
  http: Schema.optional(HttpContext),
}) {
  get retryable() {
    return true
  }
}

export class QuotaExceededReason extends Schema.Class<QuotaExceededReason>("LLM.Error.QuotaExceeded")({
  _tag: Schema.tag("QuotaExceeded"),
  message: Schema.String,
  providerMetadata: Schema.optional(ProviderMetadata),
  http: Schema.optional(HttpContext),
}) {
  get retryable() {
    return false
  }
}

export class ContentPolicyReason extends Schema.Class<ContentPolicyReason>("LLM.Error.ContentPolicy")({
  _tag: Schema.tag("ContentPolicy"),
  message: Schema.String,
  providerMetadata: Schema.optional(ProviderMetadata),
  http: Schema.optional(HttpContext),
}) {
  get retryable() {
    return false
  }
}

export class ProviderInternalReason extends Schema.Class<ProviderInternalReason>("LLM.Error.ProviderInternal")({
  _tag: Schema.tag("ProviderInternal"),
  message: Schema.String,
  status: Schema.Number,
  retryAfterMs: Schema.optional(Schema.Number),
  providerMetadata: Schema.optional(ProviderMetadata),
  http: Schema.optional(HttpContext),
}) {
  get retryable() {
    return true
  }
}

export class TransportReason extends Schema.Class<TransportReason>("LLM.Error.Transport")({
  _tag: Schema.tag("Transport"),
  message: Schema.String,
  kind: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  http: Schema.optional(HttpContext),
}) {
  get retryable() {
    return false
  }
~~~~

Source `packages/llm/src/route/executor.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `aaf189c0493309d998b1c8647f308aff57a6644e`; full-source SHA-256 `5d79a756e023054cfdd9995f4ff117cc0d2ee876ff7afb5eb9b27da6badc953c`.

Lines 355–364; excerpt SHA-256 `6ccd2640a5c96059626dc48c9cea3563616c398accb5ce67d6159fec4c6e3ba7`.

~~~~text
  retries = MAX_RETRIES,
  attempt = 0,
): Effect.Effect<A, LLMError, R> =>
  Effect.catchTag(effect, "LLM.Error", (error): Effect.Effect<A, LLMError, R> => {
    if (!error.retryable || retries <= 0) return Effect.fail(error)
    return retryDelay(error, attempt).pipe(
      Effect.flatMap((delay) => Effect.sleep(delay)),
      Effect.flatMap(() => retryStatusFailures(effect, retries - 1, attempt + 1)),
    )
  })
~~~~

## C10 — Missing WebSocket service refuses the transport
Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/route/transport/websocket.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `edb8aafa28922cbe1dda18c28367e0b3487297b7`; full-source SHA-256 `faf505cee9cb136244b6dd36db4209770243028f0fbd48bb2463e4b694a3a6e9`.

Lines 240–259; excerpt SHA-256 `1925b134518cbde49a6cd4b2a6787d985f03c9f215a4a6127979a566a0b85125`.

~~~~text
  frames: (prepared, _request, runtime) => {
    const webSocket = runtime.webSocket
    if (!webSocket) {
      return Stream.fail(
        transportError("json", "WebSocket JSON transport requires WebSocketExecutor.Service", {
          url: prepared.url,
          kind: "websocket",
        }),
      )
    }
    const decoder = new TextDecoder()
    return Stream.unwrap(
      Effect.gen(function* () {
        const connection = yield* Effect.acquireRelease(
          webSocket.open({ url: prepared.url, headers: prepared.headers }),
          (connection) => connection.close,
        )
        yield* connection.sendText(prepared.message)
        return connection.messages.pipe(Stream.map((message) => messageText(message, decoder)))
      }),
~~~~

## C17 — TUI compatibility and distinct client capability
Artifacts: s1.runtime.plugin.l1.

Source `packages/plugin/src/tui.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `df0eec88398ab435191810dc5e651b746561c512`; full-source SHA-256 `cdc7bc32e189f2924c79e587729458f7c39bac7d3be08b30637b7cf09e9a6d28`.

Lines 92–121; excerpt SHA-256 `5a97bfc2fc85e56fdfc4784819e6ae31179e3f2086e77e184b2b169e938d6f28`.

~~~~text

/**
 * Legacy `api.command` shape kept so v1 plugins can initialize. Remove in v2.
 *
 * @deprecated Use `api.keymap.registerLayer({ commands, bindings })` instead.
 */
export type TuiCommand = {
  title: string
  value: string
  description?: string
  category?: string
  keybind?: string
  suggested?: boolean
  hidden?: boolean
  enabled?: boolean
  slash?: {
    name: string
    aliases?: string[]
  }
  onSelect?: (dialog?: TuiDialogStack) => void | Promise<void>
}

/**
 * Legacy `api.command` API kept so v1 plugins can initialize. Remove in v2.
 *
 * @deprecated Use `api.keymap.registerLayer`, `api.keymap.dispatchCommand`, and
 * `api.keymap.dispatchCommand("command.palette.show")` instead.
 */
export type TuiCommandApi = {
  /** @deprecated Use `api.keymap.registerLayer({ commands, bindings })` instead. */
~~~~

Lines 647–671; excerpt SHA-256 `4afa7783be38c1ebc5036ac4eaffd00977564650d611ee2bfcda5e98fa818997`.

~~~~text
  readonly tuiConfig: Frozen<TuiConfigView>
  kv: TuiKV
  state: TuiState
  theme: TuiTheme
  client: ReturnType<typeof Orchestra.make>
  event: TuiEventBus
  renderer: CliRenderer
  slots: TuiSlots
  plugins: {
    list: () => ReadonlyArray<TuiPluginStatus>
    activate: (id: string) => Promise<boolean>
    deactivate: (id: string) => Promise<boolean>
    add: (spec: string) => Promise<boolean>
    install: (spec: string, options?: TuiPluginInstallOptions) => Promise<TuiPluginInstallResult>
  }
  lifecycle: TuiLifecycle
}

export type TuiPlugin = (api: TuiPluginApi, options: PluginOptions | undefined, meta: TuiPluginMeta) => Promise<void>

export type TuiPluginModule = {
  id?: string
  tui: TuiPlugin
  server?: never
}
~~~~

## C39 — Pack removes internal export and rewrites public paths
Artifacts: s1.runtime.http_recorder.l1.

Source `tooling/http-recorder/script/pack.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `746d7aaebd8af9117eebed109689d6751b87f1a4`; full-source SHA-256 `faa507f536a28130f49010ad52e88aafbc0e32017a3d644d1e4765e8461addd6`.

Lines 16–28; excerpt SHA-256 `31562c73e56aef10cd3de991a72501ece0534b52f900a3d39514df6468276251`.

~~~~text

  for (const [key, value] of Object.entries(pkg.exports)) {
    if (key === "./internal") {
      delete pkg.exports[key]
      continue
    }
    if (typeof value !== "string") continue
    const file = value.replace("./src/", "./dist/").replace(/\.ts$/, "")
    pkg.exports[key] = { import: `${file}.js`, types: `${file}.d.ts` }
  }
  await Bun.write("package.json", JSON.stringify(pkg, null, 2))
  try {
    await $`bun pm pack`
~~~~

## C43 — Credential storage and decryption-failure intent
Artifacts: s1.runtime.guides_intent.l1.

Source `docs/guides/credentials.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `9e6c450c0a51ac92c9adc5852db920b575f2150a`; full-source SHA-256 `a0c4d1888c597f5f4ab95a36c64f4d4f897f1a6fbdcb232263c382763d2e2c2d`.

Lines 9–17; excerpt SHA-256 `d8631cfffbb7f7412b869923bf5edb27d84acec2d7d5ff4f9832f77b7378085b`.

~~~~text
Provider credentials and integration tokens are stored in Orchestra's database, `orchestra.db` in the data directory
(`~/.local/share/orchestra` on Linux and macOS unless `XDG_DATA_HOME` says otherwise). MCP OAuth tokens are stored in
`mcp-auth.json` in the same directory.

Every secret is encrypted with AES-256-GCM before it is written. The encryption key is a random 32-byte key that
Orchestra creates on first start and keeps in your operating system's credential store: the Keychain on macOS, the
Secret Service (for example GNOME Keyring or KWallet) on Linux, and Credential Manager on Windows. The entry is named
`ai.hugr.orchestra` / `credential-key`. Copying the database or `mcp-auth.json` to another machine does not copy the
key, so the secrets in the copy cannot be read there.
~~~~

Lines 28–35; excerpt SHA-256 `3aaa71be315790a2ed1e10d0d83a7bb0064fa319adc2bbbee41d03b2221b2748`.

~~~~text
If a stored secret cannot be decrypted (for example because the key was removed from the credential store), Orchestra
logs an error for that credential and skips it. It never deletes or overwrites it, so restoring the key makes it readable
again. Logging in again creates a new credential.

On macOS an update can make the Keychain ask again whether Orchestra may use its key. If you decline that prompt or do
not answer it within 10 seconds, Orchestra falls back to the key file for that run. Your stored credentials are skipped,
not lost. `mcp-auth.json` is left in place: MCP servers show as logged out and new MCP logins fail rather than
overwrite it. Restart Orchestra and allow the prompt to get everything back.
~~~~


# R3 — Additional decisive implementation spans

These are newly selected contiguous excerpts from already captured files at the original source pin. No product code or test was executed. E15 line 628 constructs the semaphore used by E18; E17 supplies the blocked-property predicate used by E16. The original bounded claims remain the scope: source mechanisms do not establish exhaustive security, protocol, query or runtime conformance.

## E01 — OpenAI facade default, explicit selectors and auth

Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/providers/openai.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `098cad84939bc46c5d15ea2ebcdc396feb1edfeb`; full-source SHA-256 `ed9056796038052bf3ae53e98071c2cdb3d3bba6a73f877c27561d5e8d297882`.

Lines 1–6 inclusive; 401 excerpt bytes; excerpt SHA-256 `3f9df551f7921ea1696c255c273ab9ed9fdc68bc6ecf23dcda480c96555ed6ad`.

~~~~text
import { AuthOptions, type ProviderAuthOption } from "../route/auth-options"
import type { Route, RouteDefaultsInput } from "../route/client"
import { ProviderID, type ModelID } from "../schema"
import * as OpenAIChat from "../protocols/openai-chat"
import * as OpenAIResponses from "../protocols/openai-responses"
import { withOpenAIOptions, type OpenAIProviderOptionsInput } from "./openai-options"
~~~~

Source `packages/llm/src/providers/openai.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `098cad84939bc46c5d15ea2ebcdc396feb1edfeb`; full-source SHA-256 `ed9056796038052bf3ae53e98071c2cdb3d3bba6a73f877c27561d5e8d297882`.

Lines 10–55 inclusive; 1865 excerpt bytes; excerpt SHA-256 `930b80c52d8ab0a60b50fe07a767e894e5591fd294d9c9b394d0f94adb803968`.

~~~~text
export const id = ProviderID.make("openai")

export const routes = [OpenAIResponses.route, OpenAIResponses.webSocketRoute, OpenAIChat.route]

// This provider facade wraps the lower-level Responses and Chat model factories
// with OpenAI-specific conveniences: typed options, API-key sugar, env fallback,
// and default option normalization.
export type Config = RouteDefaultsInput &
  ProviderAuthOption<"optional"> & {
    readonly baseURL?: string
    readonly queryParams?: Record<string, string>
    readonly providerOptions?: OpenAIProviderOptionsInput
  }

const auth = (options: ProviderAuthOption<"optional">) => AuthOptions.bearer(options, "OPENAI_API_KEY")

const defaults = (input: Config) => {
  const { apiKey: _, auth: _auth, baseURL: _baseURL, queryParams: _queryParams, ...rest } = input
  return rest
}

const configuredRoute = <Body, Prepared>(route: Route<Body, Prepared>, input: Config) =>
  route.with({
    auth: auth(input),
    endpoint: { baseURL: input.baseURL, query: input.queryParams },
  })

export const configure = (input: Config = {}) => {
  const responsesRoute = configuredRoute(OpenAIResponses.route, input)
  const responsesWebSocketRoute = configuredRoute(OpenAIResponses.webSocketRoute, input)
  const chatRoute = configuredRoute(OpenAIChat.route, input)
  const modelDefaults = defaults(input)
  const responses = (id: string | ModelID) =>
    responsesRoute.with(withOpenAIOptions(id, modelDefaults, { textVerbosity: true })).model({ id })
  const responsesWebSocket = (id: string | ModelID) =>
    responsesWebSocketRoute.with(withOpenAIOptions(id, modelDefaults, { textVerbosity: true })).model({ id })
  const chat = (id: string | ModelID) => chatRoute.with(withOpenAIOptions(id, modelDefaults)).model({ id })

  return {
    id,
    model: responses,
    responses,
    responsesWebSocket,
    chat,
    configure,
  }
~~~~

## E02 — Anthropic facade route and x-api-key resolution

Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/providers/anthropic.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `0c9640af5ea65bda1c50f73e5f8fdf3b35922841`; full-source SHA-256 `fc1ebda9167541ce18cce0160910ab08ec68a166b9c19ad9f62649678e214bf9`.

Lines 1–31 inclusive; 1176 excerpt bytes; excerpt SHA-256 `ff5f47df6c55c6cecb5f78bc3b41067a405ea3a37c2f8659abe6a49e70245213`.

~~~~text
import type { RouteDefaultsInput } from "../route/client"
import { Auth } from "../route/auth"
import type { ProviderAuthOption } from "../route/auth-options"
import { ProviderID, type ModelID } from "../schema"
import * as AnthropicMessages from "../protocols/anthropic-messages"

export const id = ProviderID.make("anthropic")

export const routes = [AnthropicMessages.route]

export type Config = RouteDefaultsInput & ProviderAuthOption<"optional"> & { readonly baseURL?: string }

const auth = (options: ProviderAuthOption<"optional">) => {
  if ("auth" in options && options.auth) return options.auth
  return Auth.optional("apiKey" in options ? options.apiKey : undefined, "apiKey")
    .orElse(Auth.config("ANTHROPIC_API_KEY"))
    .pipe(Auth.header("x-api-key"))
}

const configuredRoute = (input: Config) => {
  const { apiKey: _, auth: _auth, baseURL, ...rest } = input
  return AnthropicMessages.route.with({ ...rest, endpoint: { baseURL }, auth: auth(input) })
}

export const configure = (input: Config = {}) => {
  const route = configuredRoute(input)
  return {
    id,
    model: (modelID: string | ModelID) => route.model({ id: modelID }),
    configure,
  }
~~~~

## E03 — Google facade route and x-goog-api-key resolution

Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/providers/google.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c8a72c31f671fb0b82686c8e082d4456c8001604`; full-source SHA-256 `58996462f9808e775367ec1cabe4158ba42650f4d6ca089ea8b1d7710ee4dc80`.

Lines 1–31 inclusive; 1144 excerpt bytes; excerpt SHA-256 `8e2e80bd187da43266f8fd137983b1da11b0ef81fc5dd479bac3bb5f329f9e83`.

~~~~text
import type { RouteDefaultsInput } from "../route/client"
import { Auth } from "../route/auth"
import type { ProviderAuthOption } from "../route/auth-options"
import { ProviderID, type ModelID } from "../schema"
import * as Gemini from "../protocols/gemini"

export const id = ProviderID.make("google")

export const routes = [Gemini.route]

export type Config = RouteDefaultsInput & ProviderAuthOption<"optional"> & { readonly baseURL?: string }

const auth = (options: ProviderAuthOption<"optional">) => {
  if ("auth" in options && options.auth) return options.auth
  return Auth.optional("apiKey" in options ? options.apiKey : undefined, "apiKey")
    .orElse(Auth.config("GOOGLE_GENERATIVE_AI_API_KEY"))
    .pipe(Auth.header("x-goog-api-key"))
}

const configuredRoute = (input: Config) => {
  const { apiKey: _, auth: _auth, baseURL, ...rest } = input
  return Gemini.route.with({ ...rest, endpoint: { baseURL }, auth: auth(input) })
}

export const configure = (input: Config = {}) => {
  const route = configuredRoute(input)
  return {
    id,
    model: (modelID: string | ModelID) => route.model({ id: modelID }),
    configure,
  }
~~~~

## E04 — Bedrock facade endpoint, region and auth branch

Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/providers/amazon-bedrock.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `2f1791e0d620ab139e32158526e83229c464fa3f`; full-source SHA-256 `4902ee16f21cafa4f49f55acdce728b1db166ab55adb17dbfecf686b79c081a8`.

Lines 1–7 inclusive; 338 excerpt bytes; excerpt SHA-256 `2adcb72531883596844049af01692b85ce3ac796d5a3ad99b58f2ec0af645f22`.

~~~~text
import type { RouteDefaultsInput } from "../route/client"
import { Auth } from "../route/auth"
import { ProviderID, type ModelID } from "../schema"
import * as BedrockConverse from "../protocols/bedrock-converse"
import type { BedrockCredentials } from "../protocols/bedrock-converse"

export const id = ProviderID.make("amazon-bedrock")
~~~~

Source `packages/llm/src/providers/amazon-bedrock.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `2f1791e0d620ab139e32158526e83229c464fa3f`; full-source SHA-256 `4902ee16f21cafa4f49f55acdce728b1db166ab55adb17dbfecf686b79c081a8`.

Lines 18–39 inclusive; 764 excerpt bytes; excerpt SHA-256 `2cce9433f240ab2f031f92c89261d1e83d27d725770b5373d4abbbeb7f3e769b`.

~~~~text
export const routes = [BedrockConverse.route]

const bedrockBaseURL = (region: string) => `https://bedrock-runtime.${region}.amazonaws.com`

const configuredRoute = (input: Config) => {
  const { apiKey, credentials, region, baseURL, ...rest } = input
  const resolvedRegion = region ?? credentials?.region ?? "us-east-1"
  return BedrockConverse.route.with({
    ...rest,
    provider: id,
    endpoint: { baseURL: baseURL ?? bedrockBaseURL(resolvedRegion) },
    auth: apiKey === undefined ? BedrockConverse.sigV4Auth(credentials) : Auth.bearer(apiKey),
  })
}

export const configure = (input: Config = {}) => {
  const route = configuredRoute(input)
  return {
    id,
    model: (modelID: string | ModelID) => route.model({ id: modelID }),
    configure,
  }
~~~~

Source `packages/llm/src/protocols/bedrock-converse.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c447a1a39d346a39dd29eab59e2f3413ab9f8850`; full-source SHA-256 `cecbf39d8ec9a0d0837a9eb8e1f9a9966d16fc2c3d284c9e82806f8f0a5989df`.

Lines 672–672 inclusive; 43 excerpt bytes; excerpt SHA-256 `070cb03c7d458298bb889f40c20aa58a78dfefdf9bf03e88834e0aaf85174818`.

~~~~text
export const sigV4Auth = BedrockAuth.sigV4
~~~~

## E05 — Azure required URL alternatives, query/auth and model default

Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/providers/azure.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `bfac2d1cad34a680b62b3047e440988e112cd483`; full-source SHA-256 `8bf8f96445a42749ad8a856710ad27403afa186f644e554b7b7dc3fb4cae4961`.

Lines 1–46 inclusive; 1579 excerpt bytes; excerpt SHA-256 `b28a79ddd09944b027275931e1d7f54212b8bf283d4ada8ac04ab355064671ed`.

~~~~text
import { Auth } from "../route/auth"
import { type AtLeastOne, type ProviderAuthOption } from "../route/auth-options"
import type { Route as RouteDef, RouteDefaultsInput } from "../route/client"
import { ProviderID, type ModelID } from "../schema"
import * as OpenAIChat from "../protocols/openai-chat"
import * as OpenAIResponses from "../protocols/openai-responses"
import { withOpenAIOptions, type OpenAIProviderOptionsInput } from "./openai-options"

export const id = ProviderID.make("azure")
const routeAuth = Auth.remove("authorization")

// Azure needs the customer's resource URL; supply either `resourceName`
// (helper builds the URL) or `baseURL` directly.
type AzureURL = AtLeastOne<{ readonly resourceName: string; readonly baseURL: string }>

export type ModelOptions = AzureURL &
  RouteDefaultsInput &
  ProviderAuthOption<"optional"> & {
    readonly apiVersion?: string
    readonly queryParams?: Record<string, string>
    readonly useCompletionUrls?: boolean
    readonly providerOptions?: OpenAIProviderOptionsInput
  }
export type Config = ModelOptions

const resourceBaseURL = (resourceName: string) => `https://${resourceName.trim()}.openai.azure.com/openai/v1`

const responsesRoute = OpenAIResponses.route.with({
  id: "azure-openai-responses",
  provider: id,
  auth: routeAuth,
  endpoint: {
    query: { "api-version": "v1" },
  },
})

const chatRoute = OpenAIChat.route.with({
  id: "azure-openai-chat",
  provider: id,
  auth: routeAuth,
  endpoint: {
    query: { "api-version": "v1" },
  },
})

export const routes = [responsesRoute, chatRoute]
~~~~

Source `packages/llm/src/providers/azure.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `bfac2d1cad34a680b62b3047e440988e112cd483`; full-source SHA-256 `8bf8f96445a42749ad8a856710ad27403afa186f644e554b7b7dc3fb4cae4961`.

Lines 65–104 inclusive; 1437 excerpt bytes; excerpt SHA-256 `af76e4b6170de372e0555e1113be24aac1703dae99b1161e670d5afb1c671788`.

~~~~text
const auth = (input: Config) => {
  if ("auth" in input && input.auth) return input.auth
  return Auth.remove("authorization").andThen(
    Auth.optional("apiKey" in input ? input.apiKey : undefined, "apiKey")
      .orElse(Auth.config("AZURE_OPENAI_API_KEY"))
      .pipe(Auth.header("api-key")),
  )
}

const configuredRoute = <Body, Prepared>(route: RouteDef<Body, Prepared>, input: Config) =>
  route.with({
    auth: auth(input),
    endpoint: {
      // AtLeastOne guarantees at least one is set; baseURL wins if both are.
      baseURL: input.baseURL ?? resourceBaseURL(input.resourceName!),
      query: {
        ...(input.apiVersion ? { "api-version": input.apiVersion } : {}),
        ...input.queryParams,
      },
    },
  })

export const configure = (input: Config) => {
  const configuredResponsesRoute = configuredRoute(responsesRoute, input)
  const configuredChatRoute = configuredRoute(chatRoute, input)
  const modelDefaults = defaults(input)

  const responses = (modelID: string | ModelID) =>
    configuredResponsesRoute.with(withOpenAIOptions(modelID, modelDefaults)).model({ id: modelID })

  const chat = (modelID: string | ModelID) =>
    configuredChatRoute.with(withOpenAIOptions(modelID, modelDefaults)).model({ id: modelID })

  return {
    id,
    model: (modelID: string | ModelID) => (input.useCompletionUrls === true ? chat(modelID) : responses(modelID)),
    responses,
    chat,
    configure,
  }
~~~~

Source `packages/llm/src/route/auth-options.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7e40aa12a2103369a1ee9f884fdef42e7ebb5b33`; full-source SHA-256 `623b152e96a7833de5c5ddf0b297461de2ad8990b6aa5e082c4b5376b05522d6`.

Lines 33–40 inclusive; 306 excerpt bytes; excerpt SHA-256 `adb8563942cceb96980f585471bd241640b557e358d93514721f72a0f5969dd0`.

~~~~text
/**
 * Require at least one of the keys in `T`. Use for option shapes where any
 * subset of fields is acceptable but at least one must be present (e.g. Azure
 * accepts `resourceName` or `baseURL`).
 */
export type AtLeastOne<T> = {
  [K in keyof T]: Required<Pick<T, K>> & Partial<Omit<T, K>>
}[keyof T]
~~~~

## E06 — Copilot model-name routing and explicit endpoint/auth configuration

Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/providers/github-copilot.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1042f841456da4c6d2b3d687515b7641a791c72c`; full-source SHA-256 `e52daf8bda7a10fdeedeb20b96f1ed393b4d5291f494cd5c72f2c366e222244b`.

Lines 1–30 inclusive; 1323 excerpt bytes; excerpt SHA-256 `c282915197196a76f712df73bd91315d00e66db171d5f3159b83fdd12caa9be3`.

~~~~text
import { AuthOptions, type ProviderAuthOption } from "../route/auth-options"
import type { RouteDefaultsInput } from "../route/client"
import { ProviderID, type ModelID } from "../schema"
import * as OpenAIChat from "../protocols/openai-chat"
import * as OpenAIResponses from "../protocols/openai-responses"
import { withOpenAIOptions, type OpenAIProviderOptionsInput } from "./openai-options"

export const id = ProviderID.make("github-copilot")

// GitHub Copilot has no canonical public URL — callers (orchestra, etc.) must
// supply `baseURL` explicitly.
export type ModelOptions = Omit<RouteDefaultsInput, "providerOptions"> &
  ProviderAuthOption<"optional"> & {
    readonly baseURL: string
    readonly endpoint?: "chat" | "responses"
    readonly providerOptions?: OpenAIProviderOptionsInput
  }

export const shouldUseResponsesApi = (modelID: string | ModelID, endpoint?: ModelOptions["endpoint"]) => {
  if (endpoint) return endpoint === "responses"
  const model = String(modelID)
  const match = /^gpt-(\d+)/.exec(model)
  if (!match) return false
  return Number(match[1]) >= 5 && !model.startsWith("gpt-5-mini")
}

export const routes = [OpenAIResponses.route, OpenAIChat.route]

const chatRoute = OpenAIChat.route.with({ provider: id })
const responsesRoute = OpenAIResponses.route.with({ provider: id })
~~~~

Source `packages/llm/src/providers/github-copilot.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1042f841456da4c6d2b3d687515b7641a791c72c`; full-source SHA-256 `e52daf8bda7a10fdeedeb20b96f1ed393b4d5291f494cd5c72f2c366e222244b`.

Lines 37–64 inclusive; 986 excerpt bytes; excerpt SHA-256 `b3520718b1752d90499c04c753f2bdc2d69a309cc6f073f5f9119fb9a32d580d`.

~~~~text
const configuredResponsesRoute = (options: ModelOptions) =>
  responsesRoute.with({
    endpoint: { baseURL: options.baseURL },
    auth: AuthOptions.bearer(options, []),
  })

const configuredChatRoute = (options: ModelOptions) =>
  chatRoute.with({
    endpoint: { baseURL: options.baseURL },
    auth: AuthOptions.bearer(options, []),
  })

export const configure = (options: ModelOptions) => {
  const responsesRoute = configuredResponsesRoute(options)
  const chatRoute = configuredChatRoute(options)
  const responses = (modelID: string | ModelID) =>
    responsesRoute.with(withOpenAIOptions(modelID, defaults(options))).model({ id: modelID })
  const chat = (modelID: string | ModelID) =>
    chatRoute.with(withOpenAIOptions(modelID, defaults(options))).model({ id: modelID })
  return {
    id,
    model: (modelID: string | ModelID) =>
      shouldUseResponsesApi(modelID, options.endpoint) ? responses(modelID) : chat(modelID),
    responses,
    chat,
    configure,
  }
}
~~~~

## E07 — Cloudflare derived endpoints and gateway/upstream auth branches

Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/providers/cloudflare.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a006152e9829cfc63bcd9a9ea5e27a0b2892aa04`; full-source SHA-256 `b616e983cac05b2a3d2480a4b1450ecc0a04ed03fe76c0434e6bb7bd89131ae6`.

Lines 1–11 inclusive; 687 excerpt bytes; excerpt SHA-256 `37d2ee502f758f267253b7d349cf651d0d2fefb8eb2d801e4d6df02877de7320`.

~~~~text
import type { Config, Redacted } from "effect"
import * as OpenAICompatibleChat from "../protocols/openai-compatible-chat"
import { Auth } from "../route/auth"
import { AuthOptions, type AtLeastOne, type ProviderAuthOption } from "../route/auth-options"
import type { RouteDefaultsInput } from "../route/client"
import { ProviderID, type ModelID } from "../schema"

export const aiGatewayID = ProviderID.make("cloudflare-ai-gateway")
export const workersAIID = ProviderID.make("cloudflare-workers-ai")
export const aiGatewayAuthEnvVars = ["CLOUDFLARE_API_TOKEN", "CF_AIG_TOKEN"] as const
export const workersAIAuthEnvVars = ["CLOUDFLARE_API_KEY", "CLOUDFLARE_WORKERS_AI_TOKEN"] as const
~~~~

Source `packages/llm/src/providers/cloudflare.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a006152e9829cfc63bcd9a9ea5e27a0b2892aa04`; full-source SHA-256 `b616e983cac05b2a3d2480a4b1450ecc0a04ed03fe76c0434e6bb7bd89131ae6`.

Lines 36–73 inclusive; 1694 excerpt bytes; excerpt SHA-256 `ae80b638dd03cb81742f709bb1853fe212cce55408dfa41b049f86f306624d54`.

~~~~text
export const aiGatewayBaseURL = (input: GatewayURL) => {
  if (input.baseURL) return input.baseURL
  if (!input.accountId) throw new Error("CloudflareAIGateway.configure requires accountId unless baseURL is supplied")
  return `https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(input.accountId)}/${encodeURIComponent(input.gatewayId?.trim() || "default")}/compat`
}

const aiGatewayAuth = (input: AIGatewayOptions) => {
  if ("auth" in input && input.auth) return input.auth
  const gateway = Auth.optional(input.gatewayApiKey, "gatewayApiKey")
    .orElse(Auth.config("CLOUDFLARE_API_TOKEN"))
    .orElse(Auth.config("CF_AIG_TOKEN"))
    .pipe(Auth.bearerHeader("cf-aig-authorization"))
  if (!("apiKey" in input) || input.apiKey === undefined) return gateway
  if (input.gatewayApiKey === undefined) return Auth.bearer(input.apiKey)
  return Auth.bearerHeader("cf-aig-authorization", input.gatewayApiKey).andThen(Auth.bearer(input.apiKey))
}

export const workersAIBaseURL = (input: WorkersAIURL) => {
  if (input.baseURL) return input.baseURL
  if (!input.accountId) throw new Error("CloudflareWorkersAI.configure requires accountId unless baseURL is supplied")
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(input.accountId)}/ai/v1`
}

const workersAIAuth = (input: WorkersAIOptions) => {
  return AuthOptions.bearer(input, workersAIAuthEnvVars)
}

export const aiGatewayRoute = OpenAICompatibleChat.route.with({
  id: "cloudflare-ai-gateway",
  provider: aiGatewayID,
})

export const workersAIRoute = OpenAICompatibleChat.route.with({
  id: "cloudflare-workers-ai",
  provider: workersAIID,
})

export const routes = [aiGatewayRoute, workersAIRoute]
~~~~

Source `packages/llm/src/providers/cloudflare.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a006152e9829cfc63bcd9a9ea5e27a0b2892aa04`; full-source SHA-256 `b616e983cac05b2a3d2480a4b1450ecc0a04ed03fe76c0434e6bb7bd89131ae6`.

Lines 93–116 inclusive; 741 excerpt bytes; excerpt SHA-256 `7ec2570dcee5b9e455a36a7df30a24c07c2d79a17ca83da417ab3d79df72a675`.

~~~~text
const configureAIGateway = (options: AIGatewayOptions) => {
  const route = aiGatewayRoute.with({
    ...aiGatewayDefaults(options),
    endpoint: { baseURL: aiGatewayBaseURL(options) },
    auth: aiGatewayAuth(options),
  })
  return {
    id: aiGatewayID,
    model: (modelID: string | ModelID) => route.model({ id: modelID }),
    configure: configureAIGateway,
  }
}

const configureWorkersAI = (options: WorkersAIOptions) => {
  const route = workersAIRoute.with({
    ...workersAIDefaults(options),
    endpoint: { baseURL: workersAIBaseURL(options) },
    auth: workersAIAuth(options),
  })
  return {
    id: workersAIID,
    model: (modelID: string | ModelID) => route.model({ id: modelID }),
    configure: configureWorkersAI,
  }
~~~~

## E08 — Generic compatible facade and actual shared Chat protocol

Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/providers/openai-compatible.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a79f65f6dfe070c292ffe40722cf9d6a021a4ea7`; full-source SHA-256 `03a8b0a113bcf3eac0e27b1409280773e295c9eabb34351e17e10e702edc5022`.

Lines 1–35 inclusive; 1254 excerpt bytes; excerpt SHA-256 `3f64a4beb0644fa181b594ed4b2522bd5a7ed648f2e9860e73f3ed1327cee95c`.

~~~~text
import { ProviderID, type ModelID } from "../schema"
import * as OpenAICompatibleChat from "../protocols/openai-compatible-chat"
import type { RouteDefaultsInput } from "../route/client"
import { AuthOptions, type ProviderAuthOption } from "../route/auth-options"
import { profiles, type OpenAICompatibleProfile } from "./openai-compatible-profile"

export const id = ProviderID.make("openai-compatible")

type GenericModelOptions = RouteDefaultsInput &
  ProviderAuthOption<"optional"> & {
    readonly provider?: string
    readonly baseURL: string
  }

export type FamilyModelOptions = RouteDefaultsInput &
  ProviderAuthOption<"optional"> & {
    readonly baseURL?: string
  }

export const routes = [OpenAICompatibleChat.route]

export const configure = (input: GenericModelOptions) => {
  const provider = input.provider ?? "openai-compatible"
  const { provider: _, baseURL, apiKey: _apiKey, auth: _auth, ...rest } = input
  const route = OpenAICompatibleChat.route.with({
    ...rest,
    provider,
    endpoint: { baseURL },
    auth: AuthOptions.bearer(input, []),
  })
  return {
    id: ProviderID.make(provider),
    model: (modelID: string | ModelID) => route.model({ id: modelID, provider: ProviderID.make(provider) }),
    configure,
  }
~~~~

Source `packages/llm/src/protocols/openai-compatible-chat.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ce3f0a83d75a8dd646a9b7d588e9aa2dd6a61807`; full-source SHA-256 `b2c679ad7ee0d55a29dda1058e7541a745eae1e4024832fd98c6fee195415803`.

Lines 1–6 inclusive; 242 excerpt bytes; excerpt SHA-256 `27ac2d5a7bbec6fee02787b14641060d3e500899a6f1be064ce6f7c48f96bc55`.

~~~~text
import { Route, type RouteRoutedModelInput } from "../route/client"
import { Endpoint } from "../route/endpoint"
import { Framing } from "../route/framing"
import * as OpenAIChat from "./openai-chat"

const ADAPTER = "openai-compatible-chat"
~~~~

Source `packages/llm/src/protocols/openai-compatible-chat.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ce3f0a83d75a8dd646a9b7d588e9aa2dd6a61807`; full-source SHA-256 `b2c679ad7ee0d55a29dda1058e7541a745eae1e4024832fd98c6fee195415803`.

Lines 17–22 inclusive; 157 excerpt bytes; excerpt SHA-256 `822e6ebdfccf4221708628dc92fc0c2bed95253c0a8c01a7b6bd0100da72d0ce`.

~~~~text
export const route = Route.make({
  id: ADAPTER,
  protocol: OpenAIChat.protocol,
  endpoint: Endpoint.path("/chat/completions"),
  framing: Framing.sse,
})
~~~~

## E09 — OpenRouter body extension, route and auth configuration

Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/providers/openrouter.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `914d7c0a0badbef0a6898588c497ca8c422935b5`; full-source SHA-256 `d036cfd496e0b4bac1beeb082f8ca41fa79ae5c7d6627381f45824039c4b0989`.

Lines 1–14 inclusive; 714 excerpt bytes; excerpt SHA-256 `d15f294d1faa63f11948fd6c9ffb441fceb1d68fada546f520e8c8786aef3348`.

~~~~text
import { Effect, Schema } from "effect"
import { Route, type RouteDefaultsInput } from "../route/client"
import { Endpoint } from "../route/endpoint"
import { Framing } from "../route/framing"
import { Protocol } from "../route/protocol"
import { AuthOptions, type ProviderAuthOption } from "../route/auth-options"
import { ProviderID, type ModelID, type ProviderOptions } from "../schema"
import * as OpenAICompatibleProfiles from "./openai-compatible-profile"
import * as OpenAIChat from "../protocols/openai-chat"
import { isRecord } from "../protocols/shared"

export const profile = OpenAICompatibleProfiles.profiles.openrouter
export const id = ProviderID.make(profile.provider)
const ADAPTER = "openrouter"
~~~~

Source `packages/llm/src/providers/openrouter.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `914d7c0a0badbef0a6898588c497ca8c422935b5`; full-source SHA-256 `d036cfd496e0b4bac1beeb082f8ca41fa79ae5c7d6627381f45824039c4b0989`.

Lines 33–95 inclusive; 1796 excerpt bytes; excerpt SHA-256 `e48a27fd4c245ae57db6fdd33c197d22a1aba864730b041d28530888a6a0c93c`.

~~~~text
const OpenRouterBody = Schema.StructWithRest(Schema.Struct(OpenAIChat.bodyFields), [
  Schema.Record(Schema.String, Schema.Any),
])
export type OpenRouterBody = Schema.Schema.Type<typeof OpenRouterBody>

export const protocol = Protocol.make({
  id: "openrouter-chat",
  body: {
    schema: OpenRouterBody,
    from: (request) =>
      OpenAIChat.protocol.body.from(request).pipe(
        Effect.map(
          (body) =>
            ({
              ...body,
              ...bodyOptions(request.providerOptions?.openrouter),
            }) as OpenRouterBody,
        ),
      ),
  },
  stream: OpenAIChat.protocol.stream,
})

const bodyOptions = (input: unknown) => {
  const openrouter = isRecord(input) ? input : {}
  return {
    ...(openrouter.usage === true
      ? { usage: { include: true } }
      : isRecord(openrouter.usage)
        ? { usage: openrouter.usage }
        : {}),
    ...(isRecord(openrouter.reasoning) ? { reasoning: openrouter.reasoning } : {}),
    ...(typeof openrouter.promptCacheKey === "string" ? { prompt_cache_key: openrouter.promptCacheKey } : {}),
  }
}

export const route = Route.make({
  id: ADAPTER,
  provider: profile.provider,
  protocol,
  endpoint: Endpoint.path("/chat/completions", { baseURL: profile.baseURL }),
  framing: Framing.sse,
})

export const routes = [route]

const configuredRoute = (input: ModelOptions) => {
  const { apiKey: _, auth: _auth, baseURL, ...rest } = input
  return route.with({
    ...rest,
    endpoint: { baseURL: baseURL ?? profile.baseURL },
    auth: AuthOptions.bearer(input, "OPENROUTER_API_KEY"),
  })
}

export const configure = (input: ModelOptions = {}) => {
  const route = configuredRoute(input)
  return {
    id,
    model: (modelID: string | ModelID) => route.model({ id: modelID }),
    configure,
  }
}
~~~~

## E10 — xAI Responses default with Chat selector

Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/providers/xai.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `321db97db1049166f21f5aedc650894fe6f7bcd1`; full-source SHA-256 `5b4fe747f497d7008b1daaa442458d96af020964531d87f0c33849acfb650b41`.

Lines 1–50 inclusive; 1767 excerpt bytes; excerpt SHA-256 `f3a0ac656f8739b44eadf8f8d8de968ec1bbf7dd03275f1ae4b616620e5253e5`.

~~~~text
import { AuthOptions, type ProviderAuthOption } from "../route/auth-options"
import type { RouteDefaultsInput } from "../route/client"
import { ProviderID, type ModelID } from "../schema"
import * as OpenAICompatibleProfiles from "./openai-compatible-profile"
import * as OpenAICompatibleChat from "../protocols/openai-compatible-chat"
import * as OpenAIResponses from "../protocols/openai-responses"

export const id = ProviderID.make("xai")

export type ModelOptions = RouteDefaultsInput &
  ProviderAuthOption<"optional"> & {
    readonly baseURL?: string
  }

export const routes = [OpenAIResponses.route, OpenAICompatibleChat.route]

const auth = (options: ProviderAuthOption<"optional">) => AuthOptions.bearer(options, "XAI_API_KEY")

const configuredResponsesRoute = (input: ModelOptions) => {
  const { apiKey: _, auth: _auth, baseURL, ...rest } = input
  return OpenAIResponses.route.with({
    ...rest,
    provider: id,
    endpoint: { baseURL: baseURL ?? OpenAICompatibleProfiles.profiles.xai.baseURL },
    auth: auth(input),
  })
}

const configuredChatRoute = (input: ModelOptions) => {
  const { apiKey: _, auth: _auth, baseURL, ...rest } = input
  return OpenAICompatibleChat.route.with({
    ...rest,
    provider: id,
    endpoint: { baseURL: baseURL ?? OpenAICompatibleProfiles.profiles.xai.baseURL },
    auth: auth(input),
  })
}

export const configure = (input: ModelOptions = {}) => {
  const responsesRoute = configuredResponsesRoute(input)
  const chatRoute = configuredChatRoute(input)
  const responses = (modelID: string | ModelID) => responsesRoute.model({ id: modelID })
  const chat = (modelID: string | ModelID) => chatRoute.model({ id: modelID })
  return {
    id,
    model: responses,
    responses,
    chat,
    configure,
  }
~~~~

## E11 — Shared bearer option/config fallback mechanism

Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/route/auth-options.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7e40aa12a2103369a1ee9f884fdef42e7ebb5b33`; full-source SHA-256 `623b152e96a7833de5c5ddf0b297461de2ad8990b6aa5e082c4b5376b05522d6`.

Lines 42–55 inclusive; 579 excerpt bytes; excerpt SHA-256 `eca590d61d6ccef0d13e673a1079a30c5d0f888817a7764836b235fa8f3897c3`.

~~~~text
/**
 * Standard bearer-auth resolution for providers: honor an explicit `auth`
 * override, otherwise resolve `apiKey` (option > config var) and apply it as
 * a bearer token.
 */
export const bearer = (options: ProviderAuthOption<"optional">, envVar: string | ReadonlyArray<string>): Auth => {
  if ("auth" in options && options.auth) return options.auth
  return (Array.isArray(envVar) ? envVar : [envVar])
    .reduce(
      (auth, name) => auth.orElse(Auth.config(name)),
      Auth.optional("apiKey" in options ? options.apiKey : undefined, "apiKey"),
    )
    .bearer()
}
~~~~

## E12 — Route/model/request precedence, recursive merge and compile use

Artifacts: s1.runtime.llm_turns.l1.

Source `packages/llm/src/route/client.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5f064512f9ff1b449137778440eb0fd6b86c8131`; full-source SHA-256 `d5dea2096bdab9ef55e1d9593d5eb5e05adf0c7c873b5cfc8671b73b322e37c1`.

Lines 167–180 inclusive; 615 excerpt bytes; excerpt SHA-256 `b34fb03463fa84275cabd9758520d5804fb6ec4ad82c1d267980ca2301da4d8e`.

~~~~text
const resolveRequestOptions = (request: LLMRequest) => {
  const routeDefaults = request.model.route.defaults
  const modelDefaults = request.model.defaults
  const generation = mergeGenerationOptions(routeDefaults.generation, modelDefaults?.generation, request.generation)
  return LLMRequest.update(request, {
    generation: generation ?? new GenerationOptions({}),
    providerOptions: mergeProviderOptions(
      routeDefaults.providerOptions,
      modelDefaults?.providerOptions,
      request.providerOptions,
    ),
    http: mergeHttpOptions(routeDefaults.http, modelDefaults?.http, request.http),
  })
}
~~~~

Source `packages/llm/src/route/client.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `5f064512f9ff1b449137778440eb0fd6b86c8131`; full-source SHA-256 `d5dea2096bdab9ef55e1d9593d5eb5e05adf0c7c873b5cfc8671b73b322e37c1`.

Lines 341–351 inclusive; 579 excerpt bytes; excerpt SHA-256 `404578ad55ff1ca0ea97ccbfda140bd923236030fd793ca90bdd91ecd48bec62`.

~~~~text
// `compile` is the important boundary: it turns a common `LLMRequest` into a
// validated provider body plus transport-private prepared data, but does not
// execute transport.
const compile = Effect.fn("LLM.compile")(function* (request: LLMRequest) {
  const resolved = applyCachePolicy(resolveRequestOptions(request))
  const route = resolved.model.route

  const body = yield* route.body
    .from(resolved)
    .pipe(Effect.flatMap(ProviderShared.validateWith(Schema.decodeUnknownEffect(route.body.schema))))
  const prepared = yield* route.prepareTransport(body, resolved)
~~~~

Source `packages/llm/src/schema/options.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `fd4f8891921ca458ff6ffe9602e15f1732e6547a`; full-source SHA-256 `e0d71751715d707c735e927be0e1f30488fbd98ed3630675acc16fd531b1b867`.

Lines 6–34 inclusive; 1307 excerpt bytes; excerpt SHA-256 `de29fa57716e37ecf023deb8b3bf094d0af5998db7ff2c66eea823303d5c2be0`.

~~~~text
export const mergeJsonRecords = (
  ...items: ReadonlyArray<Record<string, unknown> | undefined>
): Record<string, unknown> | undefined => {
  const defined = items.filter((item): item is Record<string, unknown> => item !== undefined)
  if (defined.length === 0) return undefined
  if (defined.length === 1 && Object.values(defined[0]).every((value) => value !== undefined)) return defined[0]
  const result: Record<string, unknown> = {}
  for (const item of defined) {
    for (const [key, value] of Object.entries(item)) {
      if (value === undefined) continue
      result[key] = isRecord(result[key]) && isRecord(value) ? mergeJsonRecords(result[key], value) : value
    }
  }
  return Object.keys(result).length === 0 ? undefined : result
}

const mergeStringRecords = (
  ...items: ReadonlyArray<Record<string, string> | undefined>
): Record<string, string> | undefined => {
  const defined = items.filter((item): item is Record<string, string> => item !== undefined)
  if (defined.length === 0) return undefined
  if (defined.length === 1) return defined[0]
  const result = Object.fromEntries(
    defined.flatMap((item) =>
      Object.entries(item).filter((entry): entry is [string, string] => entry[1] !== undefined),
    ),
  )
  return Object.keys(result).length === 0 ? undefined : result
}
~~~~

Source `packages/llm/src/schema/options.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `fd4f8891921ca458ff6ffe9602e15f1732e6547a`; full-source SHA-256 `e0d71751715d707c735e927be0e1f30488fbd98ed3630675acc16fd531b1b867`.

Lines 39–51 inclusive; 490 excerpt bytes; excerpt SHA-256 `950d8ac1969a295f9add407e48ef09b9c06575e78304c57bb8047357f5f18d65`.

~~~~text
export const mergeProviderOptions = (
  ...items: ReadonlyArray<ProviderOptions | undefined>
): ProviderOptions | undefined => {
  const result: Record<string, Record<string, unknown>> = {}
  for (const item of items) {
    if (!item) continue
    for (const [provider, options] of Object.entries(item)) {
      const merged = mergeJsonRecords(result[provider], options)
      if (merged) result[provider] = merged
    }
  }
  return Object.keys(result).length === 0 ? undefined : result
}
~~~~

Source `packages/llm/src/schema/options.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `fd4f8891921ca458ff6ffe9602e15f1732e6547a`; full-source SHA-256 `e0d71751715d707c735e927be0e1f30488fbd98ed3630675acc16fd531b1b867`.

Lines 66–72 inclusive; 434 excerpt bytes; excerpt SHA-256 `040cf38b3a117a059fba1eaa592444a3108279e0f45d9f17af65ff633efc3d87`.

~~~~text
export const mergeHttpOptions = (...items: ReadonlyArray<HttpOptions | undefined>): HttpOptions | undefined => {
  const body = mergeJsonRecords(...items.map((item) => item?.body))
  const headers = mergeStringRecords(...items.map((item) => item?.headers))
  const query = mergeStringRecords(...items.map((item) => item?.query))
  if (!body && !headers && !query) return undefined
  return new HttpOptions({ body, headers, query })
}
~~~~

Source `packages/llm/src/schema/options.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `fd4f8891921ca458ff6ffe9602e15f1732e6547a`; full-source SHA-256 `e0d71751715d707c735e927be0e1f30488fbd98ed3630675acc16fd531b1b867`.

Lines 105–122 inclusive; 863 excerpt bytes; excerpt SHA-256 `4dd898425991bd0784352159da5f61598f2ace86ac563e8cf34bda58f2a745fa`.

~~~~text
const latestGeneration = <Key extends keyof GenerationOptionsFields>(
  items: ReadonlyArray<GenerationOptionsInput | undefined>,
  key: Key,
) => items.findLast((item) => item?.[key] !== undefined)?.[key]

export const mergeGenerationOptions = (...items: ReadonlyArray<GenerationOptionsInput | undefined>) => {
  const result = new GenerationOptions({
    maxTokens: latestGeneration(items, "maxTokens"),
    temperature: latestGeneration(items, "temperature"),
    topP: latestGeneration(items, "topP"),
    topK: latestGeneration(items, "topK"),
    frequencyPenalty: latestGeneration(items, "frequencyPenalty"),
    presencePenalty: latestGeneration(items, "presencePenalty"),
    seed: latestGeneration(items, "seed"),
    stop: latestGeneration(items, "stop"),
  })
  return Object.values(result).some((value) => value !== undefined) ? result : undefined
}
~~~~

Source `packages/llm/src/utils/record.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `a121fbde11a543fc674b2037fc051124492c1775`; full-source SHA-256 `d231e3f27c46bea0337dfaca41704d3729cd12b31f19c3afa0fb8112ec203a30`.

Lines 1–3 inclusive; 257 excerpt bytes; excerpt SHA-256 `d231e3f27c46bea0337dfaca41704d3729cd12b31f19c3afa0fb8112ec203a30`.

~~~~text
/** Plain-record narrowing. Excludes arrays so JSON object checks don't accept tuples as key/value bags. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
~~~~

## E13 — Automatic cache route selection and preservation of existing hints

Artifacts: s1.runtime.llm_providers.l1, s1.runtime.llm_turns.l1.

Source `packages/llm/src/cache-policy.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `60f96dc69aaa84e7b7d62fca97b96dac9f674924`; full-source SHA-256 `ad5d88575b9d5bff6f2896c9737e241b8c9e4caa39761c69947d5ee9acb7eaa7`.

Lines 18–24 inclusive; 138 excerpt bytes; excerpt SHA-256 `5987a6f0196fc239f474dbc266ea2ed2c473d79e42b1d10e03f040ae9ae47653`.

~~~~text
const AUTO: CachePolicyObject = {
  tools: true,
  system: true,
  messages: "latest-user-message",
}

const NONE: CachePolicyObject = {}
~~~~

Source `packages/llm/src/cache-policy.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `60f96dc69aaa84e7b7d62fca97b96dac9f674924`; full-source SHA-256 `ad5d88575b9d5bff6f2896c9737e241b8c9e4caa39761c69947d5ee9acb7eaa7`.

Lines 33–59 inclusive; 1316 excerpt bytes; excerpt SHA-256 `8dec0b3f0008a75a4730d639589027e9123bdafbe611bad264599d83267e1760`.

~~~~text
const resolve = (policy: CachePolicy | undefined): CachePolicyObject => {
  if (policy === undefined || policy === "auto") return AUTO
  if (policy === "none") return NONE
  return policy
}

// Protocols whose wire format ignores inline cache markers (OpenAI's implicit
// prefix caching, Gemini's implicit + out-of-band CachedContent). Skip the
// whole policy pass for these — emitting hints would be harmless but pointless.
const RESPECTS_INLINE_HINTS = new Set(["anthropic-messages", "bedrock-converse"])

const makeHint = (ttlSeconds: number | undefined): CacheHint =>
  ttlSeconds !== undefined ? new CacheHint({ type: "ephemeral", ttlSeconds }) : new CacheHint({ type: "ephemeral" })

const markLastTool = (tools: ReadonlyArray<ToolDefinition>, hint: CacheHint): ReadonlyArray<ToolDefinition> => {
  if (tools.length === 0) return tools
  const last = tools.length - 1
  if (tools[last]!.cache) return tools
  return tools.map((tool, i) => (i === last ? new ToolDefinition({ ...tool, cache: hint }) : tool))
}

const markLastSystem = (system: LLMRequest["system"], hint: CacheHint): LLMRequest["system"] => {
  if (system.length === 0) return system
  const last = system.length - 1
  if (system[last]!.cache) return system
  return system.map((part, i) => (i === last ? { ...part, cache: hint } : part))
}
~~~~

Source `packages/llm/src/cache-policy.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `60f96dc69aaa84e7b7d62fca97b96dac9f674924`; full-source SHA-256 `ad5d88575b9d5bff6f2896c9737e241b8c9e4caa39761c69947d5ee9acb7eaa7`.

Lines 67–83 inclusive; 1010 excerpt bytes; excerpt SHA-256 `a2e6594301050adccb1b50a640ee6f8f77c727556db5b7a0aa81c21874835a89`.

~~~~text
const markMessageAt = (messages: ReadonlyArray<Message>, index: number, hint: CacheHint): ReadonlyArray<Message> => {
  if (index < 0 || index >= messages.length) return messages
  const target = messages[index]!
  if (target.content.length === 0) return messages
  const lastTextIndex = target.content.findLastIndex((part) => part.type === "text")
  const markAt = lastTextIndex >= 0 ? lastTextIndex : target.content.length - 1
  const existing = target.content[markAt]!
  if ("cache" in existing && existing.cache) return messages
  const nextContent = target.content.map((part, i) => (i === markAt ? ({ ...part, cache: hint } as ContentPart) : part))
  const next = new Message({ ...target, content: nextContent })
  // Single pass over `messages`, substituting the one updated entry. Long
  // conversations call this on every request, so avoid `.map()` here — its
  // closure dispatch and identity copies show up in profiling.
  const result = messages.slice()
  result[index] = next
  return result
}
~~~~

Source `packages/llm/src/cache-policy.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `60f96dc69aaa84e7b7d62fca97b96dac9f674924`; full-source SHA-256 `ad5d88575b9d5bff6f2896c9737e241b8c9e4caa39761c69947d5ee9acb7eaa7`.

Lines 99–111 inclusive; 756 excerpt bytes; excerpt SHA-256 `a6ae6d6557e2bb2aef8375552ebb704f253b5139f1953b74fd65a7f1f2c8ef38`.

~~~~text
export const applyCachePolicy = (request: LLMRequest): LLMRequest => {
  if (!RESPECTS_INLINE_HINTS.has(request.model.route.id)) return request
  const policy = resolve(request.cache)
  if (!policy.tools && !policy.system && !policy.messages) return request

  const hint = makeHint(policy.ttlSeconds)
  const tools = policy.tools ? markLastTool(request.tools, hint) : request.tools
  const system = policy.system ? markLastSystem(request.system, hint) : request.system
  const messages = policy.messages ? markMessages(request.messages, policy.messages, hint) : request.messages

  if (tools === request.tools && system === request.system && messages === request.messages) return request
  return LLMRequest.update(request, { tools, system, messages })
}
~~~~

## E14 — HTTP final URL/body/header overlays precede auth

Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/route/transport/http.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `acc52c6ea173c28f92247b0fd31d58ea688df7e5`; full-source SHA-256 `7f956da303ff5d0532498901845ee0e64a26fa78dd25697b229d3855c9483dd7`.

Lines 73–106 inclusive; 1515 excerpt bytes; excerpt SHA-256 `054c3eaaa6f7ef00e5f87deb90d0910c1b289a0ed15b9e79a9abdb82423155d8`.

~~~~text
const bodyWithOverlay = <Body>(body: Body, request: LLMRequest, encodeBody: (body: Body) => string) =>
  Effect.gen(function* () {
    if (request.http?.body === undefined) return { jsonBody: body, bodyText: encodeBody(body) }
    const forbiddenKeys = forbiddenBodyOverlayKeys(request.http.body)
    if (forbiddenKeys.length > 0)
      return yield* ProviderShared.invalidRequest(
        `http.body cannot overlay protocol-owned field(s): ${forbiddenKeys.join(", ")}`,
      )
    if (ProviderShared.isRecord(body)) {
      const overlaid = mergeJsonRecords(body, request.http.body) ?? {}
      return { jsonBody: overlaid, bodyText: ProviderShared.encodeJson(overlaid) }
    }
    return yield* ProviderShared.invalidRequest("http.body can only overlay JSON object request bodies")
  })

export const jsonRequestParts = <Body>(input: JsonRequestInput<Body>) =>
  Effect.gen(function* () {
    const url = applyQuery(
      renderEndpoint(input.endpoint, { request: input.request, body: input.body }).toString(),
      input.request.http?.query,
    )
    const body = yield* bodyWithOverlay(input.body, input.request, input.encodeBody)
    const headers = yield* Auth.toEffect(input.auth)({
      request: input.request,
      method: "POST",
      url,
      body: body.bodyText,
      headers: Headers.fromInput({
        ...input.headers?.({ request: input.request }),
        ...input.request.http?.headers,
      }),
    })
    return { url, jsonBody: body.jsonBody, bodyText: body.bodyText, headers }
  })
~~~~

## E15 — CodeMode constructed globals, scope-only lookup and explicit tool entry

Artifacts: s1.runtime.codemode.l1.

Source `packages/codemode/src/interpreter/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `093f577765100e95597919986f606010fd82066e`; full-source SHA-256 `7ee1e5c5b9c096b7d6b77e5ee7d3f9604d48e4964a33e40345a48746d08eb053`.

Lines 617–661 inclusive; 3181 excerpt bytes; excerpt SHA-256 `5344d22e65201ce38539ba23e51dc8c184b6746d2769569d3f479aa7b941cef5`.

~~~~text
  constructor(
    invokeTool: (path: ReadonlyArray<string>, args: Array<unknown>) => Effect.Effect<unknown, unknown, R>,
    toolKeys: (path: ReadonlyArray<string>) => ReadonlyArray<string>,
    logs: Array<string> = [],
  ) {
    const globalScope = new Map<string, Binding>()
    this.scopes = [globalScope]
    this.invokeTool = invokeTool
    this.toolKeys = toolKeys
    this.logs = logs
    this.lastValue = undefined
    this.callPermits = Semaphore.makeUnsafe(TOOL_CALL_CONCURRENCY)
    globalScope.set("tools", { mutable: false, value: new ToolReference([]) })
    globalScope.set("Promise", { mutable: false, value: new PromiseNamespace() })
    globalScope.set("undefined", { mutable: false, value: undefined })
    globalScope.set("Object", { mutable: false, value: new GlobalNamespace("Object") })
    globalScope.set("Math", { mutable: false, value: new GlobalNamespace("Math") })
    globalScope.set("JSON", { mutable: false, value: new GlobalNamespace("JSON") })
    globalScope.set("Number", { mutable: false, value: new CoercionFunction("Number") })
    globalScope.set("String", { mutable: false, value: new CoercionFunction("String") })
    globalScope.set("Boolean", { mutable: false, value: new CoercionFunction("Boolean") })
    globalScope.set("Array", { mutable: false, value: new GlobalNamespace("Array") })
    globalScope.set("console", { mutable: false, value: new GlobalNamespace("console") })
    globalScope.set("parseInt", { mutable: false, value: new CoercionFunction("parseInt") })
    globalScope.set("parseFloat", { mutable: false, value: new CoercionFunction("parseFloat") })
    globalScope.set("Date", { mutable: false, value: new GlobalNamespace("Date") })
    globalScope.set("RegExp", { mutable: false, value: new GlobalNamespace("RegExp") })
    globalScope.set("Map", { mutable: false, value: new GlobalNamespace("Map") })
    globalScope.set("Set", { mutable: false, value: new GlobalNamespace("Set") })
    globalScope.set("URL", { mutable: false, value: new GlobalNamespace("URL") })
    globalScope.set("URLSearchParams", { mutable: false, value: new GlobalNamespace("URLSearchParams") })
    globalScope.set("encodeURI", { mutable: false, value: new UriFunction("encodeURI") })
    globalScope.set("encodeURIComponent", { mutable: false, value: new UriFunction("encodeURIComponent") })
    globalScope.set("decodeURI", { mutable: false, value: new UriFunction("decodeURI") })
    globalScope.set("decodeURIComponent", { mutable: false, value: new UriFunction("decodeURIComponent") })
    // Error constructors are real values, so `x instanceof Error` works and `Error("msg")`
    // (with or without `new`) constructs a branded { name, message } error object.
    for (const name of errorConstructors) {
      globalScope.set(name, { mutable: false, value: new ErrorConstructorReference(name) })
    }
    // NaN/Infinity flow as ordinary in-sandbox values (normalized to null only at the data
    // boundary - see copyOut), so their global bindings must exist too, e.g. `reduce(max, -Infinity)`.
    globalScope.set("NaN", { mutable: false, value: NaN })
    globalScope.set("Infinity", { mutable: false, value: Infinity })
  }
~~~~

Source `packages/codemode/src/interpreter/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `093f577765100e95597919986f606010fd82066e`; full-source SHA-256 `7ee1e5c5b9c096b7d6b77e5ee7d3f9604d48e4964a33e40345a48746d08eb053`.

Lines 3267–3279 inclusive; 528 excerpt bytes; excerpt SHA-256 `c31130031ffbce1754be6fcd1324314568236e71f1b32d07e783be4f470df1ad`.

~~~~text
  private getIdentifierValue(name: string, node: AstNode): unknown {
    const binding = this.resolveBinding(name)

    if (!binding) {
      throw new InterpreterRuntimeError(`Unknown identifier '${name}'.`, node).as("ReferenceError")
    }

    // A parameter default that forward-references a later (not-yet-bound) parameter - JS TDZ.
    if (binding.initialized === false) {
      throw new InterpreterRuntimeError(`Cannot access '${name}' before initialization.`, node).as("ReferenceError")
    }

    return binding.value
~~~~

Source `packages/codemode/src/interpreter/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `093f577765100e95597919986f606010fd82066e`; full-source SHA-256 `7ee1e5c5b9c096b7d6b77e5ee7d3f9604d48e4964a33e40345a48746d08eb053`.

Lines 3297–3308 inclusive; 296 excerpt bytes; excerpt SHA-256 `d7afc83db406f32cb9958e7bba7219d4f197629a3df402e605c643fa3e9758c8`.

~~~~text
  private resolveBinding(name: string): Binding | undefined {
    for (let index = this.scopes.length - 1; index >= 0; index -= 1) {
      const scope = this.scopes[index]
      const binding = scope?.get(name)

      if (binding) {
        return binding
      }
    }

    return undefined
  }
~~~~

Source `packages/codemode/src/interpreter/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `093f577765100e95597919986f606010fd82066e`; full-source SHA-256 `7ee1e5c5b9c096b7d6b77e5ee7d3f9604d48e4964a33e40345a48746d08eb053`.

Lines 3340–3354 inclusive; 624 excerpt bytes; excerpt SHA-256 `c3a77e11139ebc1ec309d8c8b988bad11c843214c523fb263bd30574b1a8774f`.

~~~~text
export const executeWithLimits = <const Tools extends Record<string, unknown>>(
  options: ExecuteOptions<Tools>,
  limits: ResolvedExecutionLimits,
  searchIndex: ToolRuntime.DiscoveryPlan["searchIndex"],
): Effect.Effect<Result, never, Services<Tools>> => {
  const hooks = {
    ...(options.onToolCallStart === undefined ? {} : { onToolCallStart: options.onToolCallStart }),
    ...(options.onToolCallEnd === undefined ? {} : { onToolCallEnd: options.onToolCallEnd }),
  }
  const tools = ToolRuntime.make(
    (options.tools ?? {}) as HostTools<Services<Tools>>,
    limits.maxToolCalls,
    searchIndex,
    hooks,
  )
~~~~

Source `packages/codemode/src/interpreter/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `093f577765100e95597919986f606010fd82066e`; full-source SHA-256 `7ee1e5c5b9c096b7d6b77e5ee7d3f9604d48e4964a33e40345a48746d08eb053`.

Lines 3366–3376 inclusive; 435 excerpt bytes; excerpt SHA-256 `95f458efc2e7f11d315d676e3e341d168c703da31e4de5ffb27311318bb124f1`.

~~~~text
  const operation = Effect.gen(function* () {
    const program = parseProgram(options.code)
    const interpreter = new Interpreter<Services<Tools>>(tools.invoke, tools.keys, logs)
    const value = yield* interpreter.run(program)
    const result = copyOut(copyIn(value, "Execution result"), true) as DataValue
    return {
      ok: true,
      value: result,
      ...logged(),
      toolCalls: tools.calls,
    } satisfies Result
~~~~

## E16 — CodeMode property access refuses blocked names and opaque runtime references

Artifacts: s1.runtime.codemode.l1.

Source `packages/codemode/src/interpreter/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `093f577765100e95597919986f606010fd82066e`; full-source SHA-256 `7ee1e5c5b9c096b7d6b77e5ee7d3f9604d48e4964a33e40345a48746d08eb053`.

Lines 550–573 inclusive; 1248 excerpt bytes; excerpt SHA-256 `950148e7c2209bd5883547e942c4de4470c244b8267ad091eccb2e92877b7e92`.

~~~~text
const invokeGlobalMethod = (ref: GlobalMethodReference, args: Array<unknown>, node: AstNode): unknown => {
  if (ref.namespace === "console")
    throw new InterpreterRuntimeError(`console.${ref.name} is not available in CodeMode.`, node)
  if (ref.namespace === "Object") return invokeObjectMethod(ref.name, args, node)
  if (ref.namespace === "Math") return invokeMathMethod(ref.name, args, node)
  if (ref.namespace === "Array") return invokeArrayStatic(ref.name, args, node)
  if (ref.namespace === "Number") return invokeNumberStatic(ref.name, args, node)
  if (ref.namespace === "String") return invokeStringStatic(ref.name, args, node)
  if (ref.namespace === "URL") return invokeURLStatic(ref.name, args, node)
  if (ref.namespace === "Date") {
    if (!dateStatics.has(ref.name))
      throw new InterpreterRuntimeError(`Date.${ref.name} is not available in CodeMode.`, node)
    return invokeDateStatic(ref.name, args, node)
  }
  if (
    ref.namespace === "RegExp" ||
    ref.namespace === "Map" ||
    ref.namespace === "Set" ||
    ref.namespace === "URLSearchParams"
  ) {
    throw new InterpreterRuntimeError(`${ref.namespace}.${ref.name} is not available in CodeMode.`, node)
  }
  return invokeJsonMethod(ref.name, args, node)
}
~~~~

Source `packages/codemode/src/interpreter/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `093f577765100e95597919986f606010fd82066e`; full-source SHA-256 `7ee1e5c5b9c096b7d6b77e5ee7d3f9604d48e4964a33e40345a48746d08eb053`.

Lines 1921–1940 inclusive; 1094 excerpt bytes; excerpt SHA-256 `b208f41eb32de30b6edc9b52cbb7deb794d3d59b4f6753a68b2687bc2bf0f1e1`.

~~~~text
      if (callable instanceof GlobalMethodReference) {
        if (callable.namespace === "console") return self.invokeConsole(callable.name, args, node)
        if (callable.namespace === "Object" && args[0] instanceof ToolReference) {
          return self.invokeObjectMethodOnTools(callable.name, args[0] as ToolReference, node)
        }
        return boundedData(invokeGlobalMethod(callable, args, node), `${callable.namespace}.${callable.name} result`)
      }
      if (callable instanceof CoercionFunction) {
        return boundedData(invokeCoercion(callable, args, node), `${callable.name} result`)
      }
      if (callable instanceof UriFunction) {
        return invokeUriFunction(callable, args, node)
      }
      // `Error("msg")` without `new` constructs an error exactly like `new Error("msg")`, as in JS.
      if (callable instanceof ErrorConstructorReference) {
        return createErrorValue(callable.name, args[0] === undefined ? "" : coerceToString(args[0]))
      }
      throw new InterpreterRuntimeError("Only tools are callable in CodeMode.", callee)
    })
  }
~~~~

Source `packages/codemode/src/stdlib/object.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `2beda0bf5cae137b0715b61c603de05c6320f287`; full-source SHA-256 `7caf81d60f974e35ca81e09992a3192a6c19aaed18974141d6c829fce9f1b4c6`.

Lines 6–21 inclusive; 941 excerpt bytes; excerpt SHA-256 `85c1eae2143da60abb087e311a64c05d972c798ce49d8445d40606f6949d7137`.

~~~~text
export const objectStatics = new Set(["keys", "values", "entries", "hasOwn", "assign", "fromEntries"])

export const invokeObjectMethod = (name: string, args: Array<unknown>, node: AstNode): unknown => {
  if (!objectStatics.has(name)) throw new InterpreterRuntimeError(`Object.${name} is not available in CodeMode.`, node)
  const requireObject = (): Record<string, unknown> => {
    const value = boundedData(args[0], `Object.${name} input`)
    if (isSandboxValue(value)) return {}
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new InterpreterRuntimeError(`Object.${name} expects a data object.`, node)
    }
    return value as Record<string, unknown>
  }
  const guardedSet = (out: Record<string, unknown>, key: string, item: unknown): void => {
    if (isBlockedMember(key)) throw new InterpreterRuntimeError(`Property '${key}' is not available in CodeMode.`, node)
    out[key] = item
  }
~~~~

Source `packages/codemode/src/stdlib/math.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `cc8dd0670e969929366e3fe8f07b700cc5f219f7`; full-source SHA-256 `cd80397a1ee8d106f7c850b5d068884117954d6422ba203da843ba9196c4d554`.

Lines 1–23 inclusive; 518 excerpt bytes; excerpt SHA-256 `0c8f6b82c3daa36e1c0fce9175589fbf9746eed6892514e98d1b6a3f683fc162`.

~~~~text
export const mathConstants = new Set(["PI", "E", "LN2", "LN10", "LOG2E", "LOG10E", "SQRT2", "SQRT1_2"])

export const mathMethods = new Set([
  "max",
  "min",
  "abs",
  "floor",
  "ceil",
  "round",
  "trunc",
  "sign",
  "sqrt",
  "cbrt",
  "pow",
  "hypot",
  "log",
  "log2",
  "log10",
  "exp",
])

export const invokeMathMethod = (name: string, args: Array<unknown>, node: AstNode): number => {
  if (!mathMethods.has(name)) throw new InterpreterRuntimeError(`Math.${name} is not available in CodeMode.`, node)
~~~~

Source `packages/codemode/src/interpreter/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `093f577765100e95597919986f606010fd82066e`; full-source SHA-256 `7ee1e5c5b9c096b7d6b77e5ee7d3f9604d48e4964a33e40345a48746d08eb053`.

Lines 2965–3001 inclusive; 1665 excerpt bytes; excerpt SHA-256 `ef957f59462a32f65f5aacc98b3ae004373aa72ab69842ff2eeb648c7147487f`.

~~~~text
      const key = computed
        ? self.toPropertyKey(yield* self.evaluateExpression(propertyNode), propertyNode)
        : propertyNode.type === "Identifier"
          ? getString(propertyNode, "name")
          : self.toPropertyKey(yield* self.evaluateExpression(propertyNode), propertyNode)

      if (objectValue instanceof ToolReference) {
        if (typeof key !== "string" || isBlockedMember(key)) {
          throw new InterpreterRuntimeError("Tool paths must use safe string property names.", propertyNode)
        }
        return new ToolReference([...objectValue.path, key])
      }

      if (objectValue instanceof PromiseNamespace) {
        if (typeof key === "string" && promiseStatics.has(key as PromiseMethodName)) {
          return new PromiseMethodReference(key as PromiseMethodName)
        }
        throw new InterpreterRuntimeError(
          `Promise.${String(key)} is not available in CodeMode. Available: Promise.all, Promise.allSettled, Promise.race, Promise.resolve, and Promise.reject; consume promises with await.`,
          propertyNode,
        )
      }

      if (objectValue instanceof GlobalNamespace) {
        if (typeof key !== "string" || isBlockedMember(key)) {
          throw new InterpreterRuntimeError(
            `${objectValue.name}.${String(key)} is not available in CodeMode.`,
            propertyNode,
          )
        }
        if (objectValue.name === "Math" && mathConstants.has(key)) {
          return new ComputedValue((Math as unknown as Record<string, number>)[key])
        }
        return new GlobalMethodReference(objectValue.name, key)
      }

      if (typeof objectValue === "string") {
~~~~

Source `packages/codemode/src/interpreter/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `093f577765100e95597919986f606010fd82066e`; full-source SHA-256 `7ee1e5c5b9c096b7d6b77e5ee7d3f9604d48e4964a33e40345a48746d08eb053`.

Lines 3067–3122 inclusive; 2569 excerpt bytes; excerpt SHA-256 `cf1111a655479261787a2925e4a83f3adfb5d707e88f18b924009972c14b1c34`.

~~~~text
      // Any property access on a promise is a confused program (`p.then(...)`, `p.value`);
      // reading `undefined` here would hide the missing await, so both paths get an explicit,
      // await-hinting error instead of the forgiving unknown-property fallthrough.
      if (objectValue instanceof SandboxPromise) {
        if (key === "then" || key === "catch" || key === "finally") {
          throw new InterpreterRuntimeError(
            `Promise.prototype.${String(key)} is not supported in CodeMode; use await instead (with try/catch to handle failures) - e.g. \`const result = await tools.ns.tool(...)\`.`,
            propertyNode,
            "UnsupportedSyntax",
            [supportedSyntaxMessage],
          )
        }
        throw new InterpreterRuntimeError(
          "This value is an un-awaited Promise and has no readable properties; await it first - e.g. `const result = await tools.ns.tool(...)`.",
          objectNode,
          "InvalidDataValue",
        )
      }

      if (isRuntimeReference(objectValue)) {
        throw new InterpreterRuntimeError(
          "CodeMode runtime references are opaque and do not expose properties.",
          objectNode,
          "InvalidDataValue",
        )
      }

      if (typeof objectValue !== "object" || objectValue === null) {
        throw new InterpreterRuntimeError("Cannot access a property on a non-object value.", objectNode)
      }

      if (typeof key === "string" && isBlockedMember(key)) {
        throw new InterpreterRuntimeError(`Property '${key}' is not available in CodeMode.`, propertyNode)
      }

      if (Array.isArray(objectValue)) {
        if (
          key !== "length" &&
          !(typeof key === "string" && arrayMethods.has(key)) &&
          typeof key !== "number" &&
          !/^\d+$/.test(key)
        ) {
          // Own non-index properties read through (match results carry index/groups); like JS,
          // they are readable in place and dropped by JSON at data boundaries.
          if (typeof key === "string" && Object.hasOwn(objectValue, key)) {
            return new ComputedValue((objectValue as Record<string, unknown> & Array<unknown>)[key])
          }
          // Unknown property on an array reads as `undefined`, matching JS (`[1,2].foo === undefined`),
          // instead of throwing - so defensive access under optional chaining behaves as expected.
          return new ComputedValue(undefined)
        }
        return { target: objectValue, key }
      }

      return { target: objectValue as SafeObject, key }
    })
~~~~

## E17 — CodeMode depth limit, blocked names and recursive plain-data enforcement

Artifacts: s1.runtime.codemode.l1.

Source `packages/codemode/src/tool-runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `f4ccc61d4c49a4f7572906559e5a4e2a11acdec9`; full-source SHA-256 `4b10bd31a9c10104a0248e8f614cb7274c964eb8efddcce749382361bcd65d20`.

Lines 117–122 inclusive; 231 excerpt bytes; excerpt SHA-256 `cb93857eb2432d1342dfeefa17a9968408ece1fd040a48be66e098171a1ce431`.

~~~~text
/**
 * Maximum nesting depth for values crossing a data boundary. Fixed (not a configurable
 * limit) purely because it produces a clearer diagnostic than a native stack-overflow
 * RangeError would.
 */
const MAX_VALUE_DEPTH = 32
~~~~

Source `packages/codemode/src/tool-runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `f4ccc61d4c49a4f7572906559e5a4e2a11acdec9`; full-source SHA-256 `4b10bd31a9c10104a0248e8f614cb7274c964eb8efddcce749382361bcd65d20`.

Lines 152–183 inclusive; 1528 excerpt bytes; excerpt SHA-256 `e0e210054b035032c1275f49a9953eb217e4c9abf429d7f9efcedc36d956463d`.

~~~~text
const blockedMemberNames = new Set(["__proto__", "constructor", "prototype"])

export const isBlockedMember = (name: string): boolean => blockedMemberNames.has(name)

/**
 * Validates and copies a value against the plain-data contract (depth, circularity, plain
 * objects only, blocked properties, data-only leaves).
 *
 * Two modes share the walk:
 * - **Boundary** (`preserveSandboxValues` false, the default): the host<->sandbox boundary -
 *   final results, tool-call arguments, `JSON.stringify`. Sandbox value types serialize
 *   exactly as JSON.stringify would: Date/URL -> strings, the remaining value types -> {}.
 * - **Intra-sandbox checkpoint** (`preserveSandboxValues` true; see `boundedData` in
 *   codemode.ts): standard-library value instances pass through untouched (treated as leaves,
 *   contents not walked), so values flowing through `Object.*` helpers, coercion inputs, and
 *   other in-sandbox checkpoints stay fully usable (`.getTime()`, `.has()`, ...).
 *
 * Both modes reject un-awaited promises with an await-hinting diagnostic.
 */
export const copyIn = (value: unknown, label: string, preserveSandboxValues = false): unknown =>
  copyBounded(value, label, 0, new Set(), preserveSandboxValues)

const copyBounded = (
  value: unknown,
  label: string,
  depth: number,
  seen: Set<object>,
  preserveSandboxValues: boolean,
): unknown => {
  if (depth > MAX_VALUE_DEPTH) {
    throw new ToolRuntimeError("InvalidDataValue", `${label} exceeds the maximum value depth of ${MAX_VALUE_DEPTH}.`)
  }
~~~~

Source `packages/codemode/src/tool-runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `f4ccc61d4c49a4f7572906559e5a4e2a11acdec9`; full-source SHA-256 `4b10bd31a9c10104a0248e8f614cb7274c964eb8efddcce749382361bcd65d20`.

Lines 269–295 inclusive; 913 excerpt bytes; excerpt SHA-256 `5d290c91516895ad1523dc38fa397b6344f77bae722ff7d452b275aabd3e6795`.

~~~~text
  if (seen.has(value)) {
    throw new ToolRuntimeError("InvalidDataValue", `${label} contains a circular value.`)
  }

  seen.add(value)

  if (Array.isArray(value)) {
    const copied = value.map((item) => copyBounded(item, label, depth + 1, seen, preserveSandboxValues))
    seen.delete(value)
    return copied
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ToolRuntimeError("InvalidDataValue", `${label} must contain plain objects only.`)
  }

  const copied: SafeObject = Object.create(null) as SafeObject
  for (const [key, item] of Object.entries(value)) {
    if (isBlockedMember(key)) {
      throw new ToolRuntimeError("InvalidDataValue", `${label} contains blocked property '${key}'.`)
    }
    copied[key] = copyBounded(item, label, depth + 1, seen, preserveSandboxValues)
  }
  seen.delete(value)
  return copied
}
~~~~

## E18 — Eight permits, eager supervised calls and pending-call drainage

Artifacts: s1.runtime.codemode.l1.

Source `packages/codemode/src/stdlib/promise.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d0b442ccf74f2230e0e8cbe060b0be86a120ce6a`; full-source SHA-256 `ba9f90a9bb9c37feefbbc26b4cc28f259224a26fea193840162841d6fbe89609`.

Lines 3–6 inclusive; 227 excerpt bytes; excerpt SHA-256 `443654c970a3e25a4b0f356fd4d5b5a8701eb5a73ae52ef2c0a79d18b7c66800`.

~~~~text
export const promiseStatics = new Set<PromiseMethodName>(["all", "allSettled", "race", "resolve", "reject"])

/** Maximum number of eagerly forked tool calls that may run concurrently. */
export const TOOL_CALL_CONCURRENCY = 8
~~~~

Source `packages/codemode/src/interpreter/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `093f577765100e95597919986f606010fd82066e`; full-source SHA-256 `7ee1e5c5b9c096b7d6b77e5ee7d3f9604d48e4964a33e40345a48746d08eb053`.

Lines 70–70 inclusive; 77 excerpt bytes; excerpt SHA-256 `d99ee336f0b258d68b3c60402614f0293719238c4254d014d99b5dbe25a5c446`.

~~~~text
import { promiseStatics, TOOL_CALL_CONCURRENCY } from "../stdlib/promise.js"
~~~~

Source `packages/codemode/src/interpreter/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `093f577765100e95597919986f606010fd82066e`; full-source SHA-256 `7ee1e5c5b9c096b7d6b77e5ee7d3f9604d48e4964a33e40345a48746d08eb053`.

Lines 610–615 inclusive; 474 excerpt bytes; excerpt SHA-256 `49547dd7965343ac4a96f1d21620f6c1e45c55db4c9ef1469d8893b1755e36a1`.

~~~~text
  // Caps how many eagerly forked tool calls run at once (the parallel-call concurrency cap).
  private readonly callPermits: Semaphore.Semaphore
  // Fiber-backed promises whose settlement no program construct has observed yet. Successful
  // program completion drains these (like a runtime waiting on in-flight work at exit) and
  // surfaces a never-awaited failure as an unhandled-rejection diagnostic.
  private readonly pendingSettlements = new Set<SandboxPromise>()
~~~~

Source `packages/codemode/src/interpreter/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `093f577765100e95597919986f606010fd82066e`; full-source SHA-256 `7ee1e5c5b9c096b7d6b77e5ee7d3f9604d48e4964a33e40345a48746d08eb053`.

Lines 690–749 inclusive; 2928 excerpt bytes; excerpt SHA-256 `cdaf0fd421ea870cd210608d8f085956ca9096608f9cb96ac4b8f6cc845f4d92`.

~~~~text
      if (!returned) value = self.lastValue

      // The program body runs inside an implicit async function, so a returned promise
      // resolves before crossing the data boundary - `return tools.ns.tool(...)` works
      // without an explicit await, exactly as in JS.
      if (value instanceof SandboxPromise) value = yield* self.settlePromise(value)
      yield* self.drainPendingSettlements()
      return value
    }).pipe(Effect.ensuring(Effect.sync(() => self.popScope())))
  }

  // Awaits every fiber-backed promise the program abandoned (fire-and-forget tool calls), so
  // their work completes before the execution ends - mirroring a JS runtime waiting on
  // in-flight I/O at exit. A failure nobody could have handled becomes an unhandled-rejection
  // diagnostic (interrupted calls, e.g. Promise.race losers, are ignored).
  private drainPendingSettlements(): Effect.Effect<void, unknown, never> {
    const self = this
    return Effect.gen(function* () {
      for (const promise of [...self.pendingSettlements]) {
        const exit = yield* self.observePromise(promise)
        if (Exit.isSuccess(exit) || Cause.hasInterruptsOnly(exit.cause)) continue
        const failure = normalizeError(Cause.squash(exit.cause))
        throw new InterpreterRuntimeError(
          `Unhandled rejection from an un-awaited tool call: ${failure.message}`,
          undefined,
          failure.kind,
          ["Await tool calls - `const result = await tools.ns.tool(...)` - so failures can be caught and handled."],
        )
      }
    })
  }

  // Eagerly starts a tool call on a supervised child fiber (so the execution timeout and
  // scope teardown interrupt it) gated by the concurrency semaphore, and wraps the fiber in a
  // first-class promise value. `startImmediately` makes the runtime admit the call - charging
  // the tool-call budget and firing onToolCallStart - at the call site, before any await.
  private createToolCallPromise(
    path: ReadonlyArray<string>,
    args: Array<unknown>,
  ): Effect.Effect<SandboxPromise, never, R> {
    const self = this
    return Effect.map(
      Effect.forkChild(this.callPermits.withPermit(Effect.suspend(() => self.invokeTool(path, args))), {
        startImmediately: true,
      }),
      (fiber) => {
        const promise = new SandboxPromise(fiber)
        self.pendingSettlements.add(promise)
        return promise
      },
    )
  }

  // The promise's settlement as an Exit, marking it observed for unhandled-rejection tracking.
  // Fiber settlement is idempotent, so observing the same promise repeatedly (await twice,
  // Promise.all([p, p])) never re-runs the underlying call.
  private observePromise(promise: SandboxPromise): Effect.Effect<Exit.Exit<unknown, unknown>> {
    this.pendingSettlements.delete(promise)
    return promise.fiber !== undefined ? Fiber.await(promise.fiber) : Effect.exit(promise.immediate ?? Effect.void)
  }
~~~~

Source `packages/codemode/src/interpreter/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `093f577765100e95597919986f606010fd82066e`; full-source SHA-256 `7ee1e5c5b9c096b7d6b77e5ee7d3f9604d48e4964a33e40345a48746d08eb053`.

Lines 1895–1911 inclusive; 886 excerpt bytes; excerpt SHA-256 `16c902835e15bf0aa8c2d28c3e3682c9e13133ca2824dd88d846c16f7987d93d`.

~~~~text
  private evaluateCallExpression(node: AstNode): Effect.Effect<unknown, unknown, R> {
    const callee = getNode(node, "callee")
    const argNodes = getArray(node, "arguments")

    const self = this
    return Effect.gen(function* () {
      const callable = yield* self.evaluateExpression(callee)
      if (callable === OptionalShortCircuit) return OptionalShortCircuit
      if ((callable === null || callable === undefined) && node.optional === true) return OptionalShortCircuit

      const args = yield* self.evaluateCallArguments(argNodes)

      if (callable instanceof ToolReference) {
        if (callable.path.length === 0) throw new InterpreterRuntimeError("The tools root is not callable.", callee)
        // An un-awaited tool call is a first-class promise value; the call itself starts now.
        return yield* self.createToolCallPromise(callable.path, args)
      }
~~~~

## E19 — OpenAPI request construction and validation precede auth; auth headers apply last

Artifacts: s1.runtime.codemode_openapi.l1.

Source `packages/codemode/src/openapi/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `2515621792b22f23fa52967362ecf69828e21ee4`; full-source SHA-256 `aaf64bec2bccfebc7b52d590683cbdebd2397066659086d480509e1d09498c7d`.

Lines 11–30 inclusive; 768 excerpt bytes; excerpt SHA-256 `3c40f2812b41aa35112e1be5a244d7e0c3ee73176bd06e6e4246b5bba23bd8c0`.

~~~~text
export const invoke = (plan: Plan, input: unknown): Effect.Effect<unknown, unknown, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const value = isRecord(input) ? input : {}

    let request = yield* buildRequest(plan, value)

    const auth = yield* resolveAuth(plan)
    for (const [name, item] of Object.entries(auth.query)) {
      request = HttpClientRequest.setUrlParam(request, name, item)
    }
    request = HttpClientRequest.setHeaders(request, auth.headers)

    const client = yield* HttpClient.HttpClient
    const response = yield* client
      .execute(request)
      .pipe(
        Effect.catch((cause) =>
          Effect.fail(toolError(`${plan.operation.method} ${plan.operation.path} failed: transport error`, cause)),
        ),
      )
~~~~

Source `packages/codemode/src/openapi/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `2515621792b22f23fa52967362ecf69828e21ee4`; full-source SHA-256 `aaf64bec2bccfebc7b52d590683cbdebd2397066659086d480509e1d09498c7d`.

Lines 54–114 inclusive; 2821 excerpt bytes; excerpt SHA-256 `85cc5156eface1cd1b98e7a3dba204226e23541ba8d59f38e8ad55a59eb0dafd`.

~~~~text
const buildRequest = (
  plan: Plan,
  input: Readonly<Record<string, unknown>>,
): Effect.Effect<HttpClientRequest.HttpClientRequest, ToolError> =>
  Effect.gen(function* () {
    // Validate every model-controlled value before auth resolution, which may refresh tokens.
    const url = buildUrl(plan, input)
    if (url instanceof ToolError) return yield* Effect.fail(url)
    const missing = plan.fields.find(
      (field) => field.required && field.location !== "path" && own(input, field.inputName) === undefined,
    )
    if (missing !== undefined) {
      const label = missing.location === "body" ? "body field" : `${missing.location} parameter`
      return yield* Effect.fail(toolError(`Missing required ${label} '${missing.inputName}'.`))
    }

    let request = HttpClientRequest.make(plan.operation.method as HttpMethod.HttpMethod)(url)
    for (const field of plan.fields) {
      if (field.location !== "query") continue
      const item = own(input, field.inputName)
      if (item === undefined) continue
      const serialized = serializeQuery(request, field, item)
      if (serialized instanceof ToolError) return yield* Effect.fail(serialized)
      request = serialized
    }

    // Host headers first, then declared header parameters.
    request = HttpClientRequest.setHeaders(request, plan.headers)
    for (const field of plan.fields) {
      if (field.location !== "header") continue
      const item = own(input, field.inputName)
      if (item === undefined) continue
      const serialized = serializeSimple(field, item, String)
      if (serialized instanceof ToolError) return yield* Effect.fail(serialized)
      request = HttpClientRequest.setHeader(request, field.name, serialized)
    }

    const setBody = (value: unknown, mediaType: string) =>
      HttpClientRequest.bodyJson(request, value).pipe(
        Effect.map((next) => HttpClientRequest.setHeader(next, "content-type", mediaType)),
        Effect.mapError((cause) =>
          toolError(`Invalid JSON body for ${plan.operation.method} ${plan.operation.path}.`, cause),
        ),
      )
    if (plan.body?.mode === "value") {
      const field = plan.fields.find((field) => field.location === "body")
      const body = field === undefined ? undefined : own(input, field.inputName)
      if (body !== undefined) request = yield* setBody(body, plan.body.mediaType)
    }
    if (plan.body?.mode === "object") {
      const entries = plan.fields.flatMap((field) => {
        if (field.location !== "body") return []
        const item = own(input, field.inputName)
        return item === undefined ? [] : [[field.name, item] as const]
      })
      if (plan.body.required || entries.length > 0) {
        request = yield* setBody(Object.fromEntries(entries), plan.body.mediaType)
      }
    }
    return request
  })
~~~~

## E20 — OpenAPI security alternatives and conflicting credential carriers

Artifacts: s1.runtime.codemode_openapi.l1.

Source `packages/codemode/src/openapi/runtime.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `2515621792b22f23fa52967362ecf69828e21ee4`; full-source SHA-256 `aaf64bec2bccfebc7b52d590683cbdebd2397066659086d480509e1d09498c7d`.

Lines 116–198 inclusive; 3464 excerpt bytes; excerpt SHA-256 `5782a890161d2fc274ac0d73e40f0ba47c708de9134b3b139d1bb1e7cf35b7ae`.

~~~~text
const resolveAuth = (plan: Plan): Effect.Effect<AppliedAuth, unknown> =>
  Effect.gen(function* () {
    const none: AppliedAuth = { headers: {}, query: {} }
    if (plan.security.length === 0) return none

    const unavailable: Array<string> = []
    alternatives: for (const requirement of plan.security) {
      const names = Object.keys(requirement)
      if (names.length === 0) return none
      const credentials: Array<readonly [string, SecurityScheme, Credential]> = []
      for (const name of names) {
        const scheme = own(plan.schemes, name)
        if (scheme === undefined || plan.auth === undefined) {
          unavailable.push(name)
          continue alternatives
        }
        const credential = yield* plan.auth.resolve({
          name,
          definition: scheme,
          scopes: requirement[name] ?? [],
          operation: plan.operation,
        })
        if (credential === undefined) {
          unavailable.push(name)
          continue alternatives
        }
        credentials.push([name, scheme, credential])
      }
      const applied = applyCredentials(credentials)
      return applied instanceof ToolError ? yield* Effect.fail(applied) : applied
    }

    return yield* Effect.fail(
      toolError(
        `${plan.operation.method} ${plan.operation.path} requires authentication; no credential available for: ${[...new Set(unavailable)].join(", ")}.`,
      ),
    )
  })

const applyCredentials = (
  credentials: ReadonlyArray<readonly [string, SecurityScheme, Credential]>,
): AppliedAuth | ToolError => {
  const headers = new Map<string, string>()
  const query = new Map<string, string>()
  const add = (carrier: "header" | "query", name: string, value: string): ToolError | undefined => {
    const target = carrier === "header" ? headers : query
    if (target.has(name)) return toolError(`Authentication resolves multiple credentials for ${carrier} '${name}'.`)
    target.set(name, value)
  }
  for (const [name, definition, credential] of credentials) {
    if (credential.type === "bearer") {
      const duplicate = add("header", "authorization", `Bearer ${credential.token}`)
      if (duplicate !== undefined) return duplicate
      continue
    }
    if (credential.type === "basic") {
      // Buffer instead of btoa: btoa throws on non-Latin-1 credentials.
      const duplicate = add(
        "header",
        "authorization",
        `Basic ${Buffer.from(`${credential.username}:${credential.password}`, "utf8").toString("base64")}`,
      )
      if (duplicate !== undefined) return duplicate
      continue
    }
    if (credential.type === "header") {
      const duplicate = add("header", credential.name.toLowerCase(), credential.value)
      if (duplicate !== undefined) return duplicate
      continue
    }
    // apiKey: the carrier comes from the scheme declaration.
    if (definition.type !== "apiKey") {
      return toolError(
        `Security scheme '${name}' is not an apiKey scheme; resolve a bearer, basic, or header credential for it.`,
      )
    }
    if (definition.in === "cookie") return toolError(`Cookie authentication '${name}' is not supported.`)
    const parameter = definition.in === "header" ? definition.name.toLowerCase() : definition.name
    const duplicate = add(definition.in, parameter, credential.value)
    if (duplicate !== undefined) return duplicate
  }
  return { headers: Object.fromEntries(headers), query: Object.fromEntries(query) }
}
~~~~

## E21 — SQLite reserve/reuse, transaction state, interruption restoration and scope closure

Artifacts: s1.runtime.effect_sqlite.l1.

Source `packages/effect-drizzle-sqlite/src/effect-sqlite/session.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e7b9d6b32cd835bdf54d70ba39e92a5839f26968`; full-source SHA-256 `4fa29583a6cbd148a5a8699dfd96d87944b2b04a559335c461a6e3635d7d9cf1`.

Lines 115–218 inclusive; 4793 excerpt bytes; excerpt SHA-256 `bf9abc52573140a2c29bdccb2519b2b21d0114c3cf8bbd7759c3600065d354ac`.

~~~~text
  private executeTransactionStatement(connection: Effect.Success<SqlClient["reserve"]>, query: string) {
    return connection.executeUnprepared(query, [], undefined).pipe(Effect.asVoid)
  }

  private withTransaction<A, E, R>(effect: Effect.Effect<A, E, R>, config: SQLiteTransactionConfig | undefined) {
    return Effect.uninterruptibleMask((restore) =>
      Effect.withFiber<A, E | SqlError, R>((fiber) => {
        const services = fiber.context
        const connectionOption = Context.getOption(services, this.client.transactionService)
        const connection: Effect.Effect<
          readonly [Scope.Closeable | undefined, Effect.Success<SqlClient["reserve"]>],
          SqlError
        > =
          connectionOption._tag === "Some"
            ? Effect.succeed([undefined, connectionOption.value[0]] as const)
            : Scope.make().pipe(
                Effect.flatMap((scope) =>
                  Scope.provide(this.client.reserve, scope).pipe(
                    Effect.exit,
                    Effect.flatMap((exit) =>
                      Exit.isSuccess(exit)
                        ? Effect.succeed([scope, exit.value] as const)
                        : Scope.close(scope, exit).pipe(
                            Effect.exit,
                            Effect.flatMap((closed) => finalizedExit(exit, closed)),
                          ),
                    ),
                  ),
                ),
              )
        const id = connectionOption._tag === "Some" ? connectionOption.value[1] + 1 : 0

        return connection.pipe(
          Effect.flatMap(([scope, connection]) => {
            const transaction = this.executeTransactionStatement(
              connection,
              id === 0 ? `begin ${config?.behavior ?? "deferred"}` : `savepoint effect_sql_${id}`,
            ).pipe(
              Effect.flatMap(() =>
                Effect.provideContext(
                  restore(effect),
                  Context.add(services, this.client.transactionService, [connection, id]),
                ).pipe(
                  Effect.exit,
                  Effect.flatMap((exit) => {
                    return Effect.gen({ self: this }, function* () {
                      if (Exit.isSuccess(exit)) {
                        const committed = yield* Effect.exit(
                          this.executeTransactionStatement(
                            connection,
                            id === 0 ? "commit" : `release savepoint effect_sql_${id}`,
                          ),
                        )
                        if (Exit.isSuccess(committed)) return yield* exit
                        // Failed commits can leave SQLite transactions open, including fatal exits.
                        const rolledBack = yield* Effect.exit(
                          this.executeTransactionStatement(
                            connection,
                            id === 0 ? "rollback" : `rollback to savepoint effect_sql_${id}`,
                          ),
                        )
                        const failed = finalizedExit(committed, rolledBack)
                        if (id === 0) return yield* failed
                        const released = yield* Effect.exit(
                          this.executeTransactionStatement(connection, `release savepoint effect_sql_${id}`),
                        )
                        return yield* finalizedExit(failed, released)
                      }

                      const rolledBack = yield* Effect.exit(
                        this.executeTransactionStatement(
                          connection,
                          id === 0 ? "rollback" : `rollback to savepoint effect_sql_${id}`,
                        ),
                      )
                      const failed = finalizedExit(exit, rolledBack)
                      if (id === 0) return yield* failed
                      // A failed ROLLBACK TO must not prevent best-effort savepoint release.
                      const released = yield* Effect.exit(
                        this.executeTransactionStatement(connection, `release savepoint effect_sql_${id}`),
                      )
                      return yield* finalizedExit(failed, released)
                    })
                  }),
                ),
              ),
            )

            return scope === undefined
              ? transaction
              : transaction.pipe(
                  Effect.exit,
                  Effect.flatMap((exit) =>
                    Scope.close(scope, exit).pipe(
                      Effect.exit,
                      Effect.flatMap((closed) => finalizedExit(exit, closed)),
                    ),
                  ),
                )
          }),
        )
      }),
    )
  }
~~~~

## E22 — SQLite init journal-only branch and normal transactional statements/journal

Artifacts: s1.runtime.effect_sqlite.l1.

Source `packages/effect-drizzle-sqlite/src/sqlite-core/effect/session.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `15a56f2ca7d9fe73a1fdaaa244d3430fb74cd965`; full-source SHA-256 `54648e442841965faa98f12948903d3805207412d338bedbe460e27034114d82`.

Lines 426–490 inclusive; 2116 excerpt bytes; excerpt SHA-256 `2975c5ef7dcd31a32632dbd6a1ec58b0d04345bcf2cfa342beaaf965c2e7e22d`.

~~~~text
export const migrate = Effect.fn("migrate")(function* <TEffectHKT extends QueryEffectHKTBase>(
  migrations: MigrationMeta[],
  session: SQLiteEffectSession<TEffectHKT>,
  config: string | MigrationConfigWithInit,
) {
  const migrationsTable =
    typeof config === "string" ? "__drizzle_migrations" : (config.migrationsTable ?? "__drizzle_migrations")

  const { newDb } = yield* upgradeIfNeeded(migrationsTable, session, migrations)

  if (newDb) {
    yield* session.run(sql`
		CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
			id INTEGER PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric,
			name text,
			applied_at TEXT
		)
	`)
  }

  const dbMigrations = yield* session.all<{ id: number; hash: string; created_at: string; name: string | null }>(
    sql`SELECT id, hash, created_at, name FROM ${sql.identifier(migrationsTable)}`,
  )

  if (typeof config === "object" && config.init) {
    if (dbMigrations.length) {
      return yield* new MigratorInitError({ exitCode: "databaseMigrations" })
    }

    if (migrations.length > 1) {
      return yield* new MigratorInitError({ exitCode: "localMigrations" })
    }

    const [migration] = migrations
    if (!migration) return

    yield* session.run(
      sql`insert into ${sql.identifier(
        migrationsTable,
      )} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${new Date().toISOString()})`,
    )

    return
  }

  const migrationsToRun = getMigrationsToRun({ localMigrations: migrations, dbMigrations })
  if (migrationsToRun.length === 0) return

  yield* session.transaction((tx) =>
    Effect.gen(function* () {
      for (const migration of migrationsToRun) {
        for (const stmt of migration.sql) {
          yield* tx.run(sql.raw(stmt))
        }
        yield* tx.run(
          sql`insert into ${sql.identifier(
            migrationsTable,
          )} ("hash", "created_at", "name", "applied_at") values(${migration.hash}, ${migration.folderMillis}, ${migration.name}, ${new Date().toISOString()})`,
        )
      }
    }),
  )
})
~~~~

## E23 — Recorder redaction configuration reaches request and response snapshots

Artifacts: s1.runtime.http_recorder.l1.

Source `tooling/http-recorder/src/effect.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `583dee8ca12230382d0835bc564096b1c874bfe1`; full-source SHA-256 `404e3d62496531efc09a272f3f543345238f3528b9c2da4c116ad8a4150383ae`.

Lines 16–25 inclusive; 403 excerpt bytes; excerpt SHA-256 `6d5f22e531695507b987ae26a7973a05fdbba163251ad52502793a8be57ac1f7`.

~~~~text
export const http = (name: string, options: RecorderOptions = {}): Layer.Layer<HttpClient.HttpClient> =>
  recordingLayer(name, {
    metadata: options.metadata,
    redactor: make(options.redact),
    match: options.match,
  }).pipe(
    Layer.provide(CassetteService.fileSystem({ directory: options.directory })),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(NodeFileSystem.layer),
  )
~~~~

Source `tooling/http-recorder/src/redactor.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `582c647702abcaf1496e6da634d699482d78bc3e`; full-source SHA-256 `b283b934d9a83278cdf3fa34cd5f95ea760125e778d8b58ef18f667a08d86f7d`.

Lines 8–9 inclusive; 184 excerpt bytes; excerpt SHA-256 `2ec2e07b2555802422a4f3064c94f85544b447c79701cb7ada7087a936ccad83`.

~~~~text
export const DEFAULT_REQUEST_HEADERS: ReadonlyArray<string> = ["content-type", "accept", "openai-beta"]
export const DEFAULT_RESPONSE_HEADERS: ReadonlyArray<string> = ["content-type"]
~~~~

Source `tooling/http-recorder/src/redactor.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `582c647702abcaf1496e6da634d699482d78bc3e`; full-source SHA-256 `b283b934d9a83278cdf3fa34cd5f95ea760125e778d8b58ef18f667a08d86f7d`.

Lines 18–24 inclusive; 552 excerpt bytes; excerpt SHA-256 `9200a61e5c9fbd134f85a428532184eef44cffc20cef0db646f32526535e79bd`.

~~~~text
export const compose = (...redactors: ReadonlyArray<Partial<Redactor>>): Redactor => {
  const requests = redactors.map((r) => r.request).filter((fn): fn is Redactor["request"] => fn !== undefined)
  const responses = redactors.map((r) => r.response).filter((fn): fn is Redactor["response"] => fn !== undefined)
  return {
    request: requests.length === 0 ? identity : (snapshot) => requests.reduce((acc, fn) => fn(acc), snapshot),
    response: responses.length === 0 ? identity : (snapshot) => responses.reduce((acc, fn) => fn(acc), snapshot),
  }
~~~~

Source `tooling/http-recorder/src/redactor.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `582c647702abcaf1496e6da634d699482d78bc3e`; full-source SHA-256 `b283b934d9a83278cdf3fa34cd5f95ea760125e778d8b58ef18f667a08d86f7d`.

Lines 32–53 inclusive; 794 excerpt bytes; excerpt SHA-256 `fbd8e6860453421daa9d56e7879f3ad6a5c83a24086ee4cc6cd0085cdb0b3e9c`.

~~~~text
export const requestHeaders = (options: HeaderOptions = {}): Partial<Redactor> => ({
  request: (snapshot) => ({
    ...snapshot,
    headers: redactHeaders(snapshot.headers, options.allow ?? DEFAULT_REQUEST_HEADERS, options.redact),
  }),
})

export const responseHeaders = (options: HeaderOptions = {}): Partial<Redactor> => ({
  response: (snapshot) => ({
    ...snapshot,
    headers: redactHeaders(snapshot.headers, options.allow ?? DEFAULT_RESPONSE_HEADERS, options.redact),
  }),
})

export interface UrlOptions {
  readonly query?: ReadonlyArray<string>
  readonly transform?: (url: string) => string
}

export const url = (options: UrlOptions = {}): Partial<Redactor> => ({
  request: (snapshot) => ({ ...snapshot, url: redactUrl(snapshot.url, options.query, options.transform) }),
})
~~~~

Source `tooling/http-recorder/src/redactor.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `582c647702abcaf1496e6da634d699482d78bc3e`; full-source SHA-256 `b283b934d9a83278cdf3fa34cd5f95ea760125e778d8b58ef18f667a08d86f7d`.

Lines 72–127 inclusive; 1866 excerpt bytes; excerpt SHA-256 `7647f5e7c7e802f692185fcbeb36fb01416fede46b3a69c6d1290e039609dbc3`.

~~~~text
const DEFAULT_REDACT_JSON_FIELDS = [
  "access_token",
  "api_key",
  "apikey",
  "client_secret",
  "password",
  "refresh_token",
  "secret",
  "token",
]

const normalizeField = (field: string) => field.replace(/[^a-z0-9]/gi, "").toLowerCase()

const redactJsonFields = (value: unknown, fields: ReadonlySet<string>): unknown => {
  if (Array.isArray(value)) return value.map((item) => redactJsonFields(item, fields))
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      fields.has(normalizeField(key)) ? REDACTED : redactJsonFields(child, fields),
    ]),
  )
}

const redactBody = (value: string, fields: ReadonlySet<string>, transform: ((body: string) => string) | undefined) => {
  const redacted = Option.match(decodeJson(value), {
    onNone: () => value,
    onSome: (parsed) => JSON.stringify(redactJsonFields(parsed, fields)),
  })
  return transform?.(redacted) ?? redacted
}

export const make = (options: RedactOptions = {}): Redactor => {
  const fields = new Set([...DEFAULT_REDACT_JSON_FIELDS, ...(options.jsonFields ?? [])].map(normalizeField))
  return compose(
    requestHeaders({
      allow: [...DEFAULT_REQUEST_HEADERS, ...(options.allowRequestHeaders ?? []), ...(options.headers ?? [])],
      redact: options.headers,
    }),
    responseHeaders({
      allow: [...DEFAULT_RESPONSE_HEADERS, ...(options.allowResponseHeaders ?? []), ...(options.headers ?? [])],
      redact: options.headers,
    }),
    url({ query: options.queryParameters, transform: options.url }),
    {
      request: (snapshot) => ({
        ...snapshot,
        body: redactBody(snapshot.body, fields, options.body),
      }),
      response: (snapshot) => ({
        ...snapshot,
        body: redactBody(snapshot.body, fields, options.body),
      }),
    },
  )
}
~~~~

Source `tooling/http-recorder/src/internal-effect.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6b886311a99548188be8ab4086dc30be49bf6846`; full-source SHA-256 `06b7522ec87f00c79ea9045e3570921de90ef910c740e7c757faf12836fa1c2d`.

Lines 100–116 inclusive; 799 excerpt bytes; excerpt SHA-256 `1f3b72791ede9a7a07275fccc345e19efbb92f107550c04a840b7351a2e540e1`.

~~~~text
      const upstream = yield* HttpClient.HttpClient
      const cassetteService = yield* CassetteService.Service
      const redactor = options.redactor ?? make()
      const match = options.match ?? defaultMatcher
      const requested = options.mode ?? "auto"
      const mode = requested === "auto" ? yield* resolveAutoMode(cassetteService, name) : requested

      const snapshotRequest = (request: HttpClientRequest.HttpClientRequest) =>
        Effect.gen(function* () {
          const web = yield* HttpClientRequest.toWeb(request).pipe(Effect.orDie)
          return redactor.request({
            method: web.method,
            url: web.url,
            headers: Object.fromEntries(web.headers.entries()),
            body: yield* Effect.promise(() => web.text()),
          })
        })
~~~~

Source `tooling/http-recorder/src/internal-effect.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6b886311a99548188be8ab4086dc30be49bf6846`; full-source SHA-256 `06b7522ec87f00c79ea9045e3570921de90ef910c740e7c757faf12836fa1c2d`.

Lines 129–145 inclusive; 812 excerpt bytes; excerpt SHA-256 `10a20faa08b91a6f1a3890e6eb8be41f1b1413ba5f2013c5bd16de35895557ba`.

~~~~text
              const incoming = yield* snapshotRequest(request)
              const response = yield* upstream.execute(request)
              const captured = yield* captureResponseBody(response, response.headers["content-type"])
              const responseSnapshot: ResponseSnapshot = {
                status: response.status,
                headers: response.headers as Record<string, string>,
                ...captured,
              }
              const interaction: HttpInteraction = {
                transport: "http",
                request: incoming,
                response: redactor.response(responseSnapshot),
              }
              yield* Deferred.await(previous)
              yield* cassetteService
                .append(name, interaction, options.metadata)
                .pipe(
~~~~

## E24 — Recorder known/configured names, URL/header redaction and bounded secret scan

Artifacts: s1.runtime.http_recorder.l1.

Source `tooling/http-recorder/src/redaction.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b84996adecb921b8edceddce49364e42b592f9ba`; full-source SHA-256 `033907c13b7d5e84855c7eb1b839b5b48cdc51f4bc59ea52f68b88a7d2c2c593`.

Lines 3–98 inclusive; 3411 excerpt bytes; excerpt SHA-256 `5dcb261f41a9310cc93f7923a2efb1a69b3da2857b8797d8508a8b29011fb610`.

~~~~text
export const REDACTED = "[REDACTED]"

const DEFAULT_REDACT_HEADERS = [
  "authorization",
  "cookie",
  "proxy-authorization",
  "set-cookie",
  "x-api-key",
  "x-amz-security-token",
  "x-goog-api-key",
]

const DEFAULT_REDACT_QUERY = [
  "access_token",
  "api-key",
  "api_key",
  "apikey",
  "code",
  "key",
  "signature",
  "sig",
  "token",
  "x-amz-credential",
  "x-amz-security-token",
  "x-amz-signature",
]

const SECRET_PATTERNS: ReadonlyArray<{ readonly label: string; readonly pattern: RegExp }> = [
  { label: "bearer token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/i },
  { label: "API key", pattern: /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{20,}\b/ },
  { label: "Anthropic API key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/ },
  { label: "AWS access key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { label: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
]

const ENV_SECRET_NAMES = /(?:API|AUTH|BEARER|CREDENTIAL|KEY|PASSWORD|SECRET|TOKEN)/i
const SAFE_ENV_VALUES = new Set(["fixture", "test", "test-key"])

const envSecrets = () =>
  Object.entries(process.env).flatMap(([name, value]) => {
    if (!value) return []
    if (!ENV_SECRET_NAMES.test(name)) return []
    if (value.length < 12) return []
    if (SAFE_ENV_VALUES.has(value.toLowerCase())) return []
    return [{ name, value }]
  })

const pathFor = (base: string, key: string) => (base ? `${base}.${key}` : key)

const stringEntries = (value: unknown, base = ""): ReadonlyArray<{ readonly path: string; readonly value: string }> => {
  if (typeof value === "string") return [{ path: base, value }]
  if (Array.isArray(value)) return value.flatMap((item, index) => stringEntries(item, `${base}[${index}]`))
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => stringEntries(child, pathFor(base, key)))
  }
  return []
}

const redactionSet = (values: ReadonlyArray<string> | undefined, defaults: ReadonlyArray<string>) =>
  new Set([...defaults, ...(values ?? [])].map((value) => value.toLowerCase()))

export type UrlRedactor = (url: string) => string

export const redactUrl = (
  raw: string,
  query: ReadonlyArray<string> = DEFAULT_REDACT_QUERY,
  urlRedactor?: UrlRedactor,
) => {
  if (!URL.canParse(raw)) return urlRedactor?.(raw) ?? raw
  const url = new URL(raw)
  if (url.username) url.username = REDACTED
  if (url.password) url.password = REDACTED
  const redacted = redactionSet(query, DEFAULT_REDACT_QUERY)
  for (const key of url.searchParams.keys()) {
    if (redacted.has(key.toLowerCase())) url.searchParams.set(key, REDACTED)
  }
  return urlRedactor?.(url.toString()) ?? url.toString()
}

export const redactHeaders = (
  headers: Record<string, string>,
  allow: ReadonlyArray<string>,
  redact: ReadonlyArray<string> = DEFAULT_REDACT_HEADERS,
) => {
  const allowed = new Set(allow.map((name) => name.toLowerCase()))
  const redacted = redactionSet(redact, DEFAULT_REDACT_HEADERS)
  return Object.fromEntries(
    Object.entries(headers)
      .map(([name, value]) => [name.toLowerCase(), value] as const)
      .filter(([name]) => allowed.has(name))
      .map(([name, value]) => [name, redacted.has(name) ? REDACTED : value] as const)
      .toSorted(([a], [b]) => a.localeCompare(b)),
  )
}
~~~~

Source `tooling/http-recorder/src/redaction.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `b84996adecb921b8edceddce49364e42b592f9ba`; full-source SHA-256 `033907c13b7d5e84855c7eb1b839b5b48cdc51f4bc59ea52f68b88a7d2c2c593`.

Lines 106–117 inclusive; 489 excerpt bytes; excerpt SHA-256 `2b378990f8235bd48d84828d482507581d76acee51d67deeb7d1fc539246ea10`.

~~~~text
export const secretFindings = (value: unknown): ReadonlyArray<SecretFinding> => {
  const environment = envSecrets()
  return stringEntries(value).flatMap((entry) => [
    ...SECRET_PATTERNS.filter((item) => item.pattern.test(entry.value)).map((item) => ({
      path: entry.path,
      reason: item.label,
    })),
    ...environment
      .filter((item) => entry.value.includes(item.value))
      .map((item) => ({ path: entry.path, reason: `environment secret ${item.name}` })),
  ])
}
~~~~

## E25 — Recorder lexical path, unsafe-cassette refusal and temp-write/rename sequence

Artifacts: s1.runtime.http_recorder.l1.

Source `tooling/http-recorder/src/cassette.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `cefc3fbc703db1f8e4dceb1cf9249f900dadd08a`; full-source SHA-256 `e023331feff17778547ae4d42387ce9a7147ddc40e01b2464b7fddc8ea4ae4f0`.

Lines 41–50 inclusive; 508 excerpt bytes; excerpt SHA-256 `88fd30ed874ee504e99b7b25fd18b8037728bffbb8cca26e25d4af1dbd28e075`.

~~~~text
const cassettePath = (directory: string, name: string) => {
  if (!name || path.isAbsolute(name) || path.win32.isAbsolute(name) || name.split(/[\\/]/).includes(".."))
    throw new Error(`Invalid cassette name "${name}"`)
  const root = path.resolve(directory)
  const target = path.resolve(root, `${name}.json`)
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error(`Invalid cassette name "${name}"`)
  return target
}
~~~~

Source `tooling/http-recorder/src/cassette.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `cefc3fbc703db1f8e4dceb1cf9249f900dadd08a`; full-source SHA-256 `e023331feff17778547ae4d42387ce9a7147ddc40e01b2464b7fddc8ea4ae4f0`.

Lines 69–70 inclusive; 190 excerpt bytes; excerpt SHA-256 `6cf9838a46d7755b1ef00761767a8dea5d2d67d08f374ac4e57479de0624ed8e`.

~~~~text
const failIfUnsafe = (name: string, findings: ReadonlyArray<SecretFinding>) =>
  findings.length === 0 ? Effect.void : Effect.fail(new UnsafeCassetteError({ cassetteName: name, findings }))
~~~~

Source `tooling/http-recorder/src/cassette.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `cefc3fbc703db1f8e4dceb1cf9249f900dadd08a`; full-source SHA-256 `e023331feff17778547ae4d42387ce9a7147ddc40e01b2464b7fddc8ea4ae4f0`.

Lines 104–123 inclusive; 1228 excerpt bytes; excerpt SHA-256 `56e6dd3c0a7192ec7ce90660a9f78de3276c7fd5301c8c9de30a09ae845cb37c`.

~~~~text
        append: (name, interaction, metadata) =>
          appendLock.withPermit(
            Effect.gen(function* () {
              const entry = recorded.get(name) ?? { interactions: [], findings: [] }
              const interactions = [...entry.interactions, interaction]
              const interactionFindings = [...entry.findings, ...secretFindings(interaction)]
              const cassette = buildCassette(name, interactions, metadata)
              const findings = [...interactionFindings, ...secretFindings(cassette.metadata ?? {})]
              yield* failIfUnsafe(name, findings)
              const target = pathFor(name)
              yield* fs.makeDirectory(path.dirname(target), { recursive: true }).pipe(Effect.orDie)
              const temporary = `${target}.${crypto.randomUUID()}.tmp`
              yield* fs.writeFileString(temporary, formatCassette(cassette)).pipe(
                Effect.flatMap(() => fs.rename(temporary, target)),
                Effect.ensuring(fs.remove(temporary, { force: true }).pipe(Effect.catch(() => Effect.void))),
                Effect.orDie,
              )
              recorded.set(name, { interactions, findings: interactionFindings })
            }),
          ),
~~~~

## E26 — Recorder binary encoding and socket redaction boundary

Artifacts: s1.runtime.http_recorder.l1.

Source `tooling/http-recorder/src/internal-effect.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `6b886311a99548188be8ab4086dc30be49bf6846`; full-source SHA-256 `06b7522ec87f00c79ea9045e3570921de90ef910c740e7c757faf12836fa1c2d`.

Lines 55–62 inclusive; 361 excerpt bytes; excerpt SHA-256 `8dfab5097c6e513dee2d85cce2fa1cce781193ce11908bb429d8651c8823f221`.

~~~~text
const captureResponseBody = (response: HttpClientResponse.HttpClientResponse, contentType: string | undefined) =>
  response.arrayBuffer.pipe(
    Effect.map((bytes) =>
      isTextContentType(contentType)
        ? { body: new TextDecoder().decode(bytes) }
        : { body: Buffer.from(bytes).toString("base64"), bodyEncoding: "base64" as const },
    ),
  )
~~~~

Source `tooling/http-recorder/src/socket.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c7486db4aa29bc88bd48eaa17890286670cb575d`; full-source SHA-256 `92a6e20bdf6d056f0bcbbc861b508db62a5accc5a8c0659f140b15dad5086228`.

Lines 34–49 inclusive; 800 excerpt bytes; excerpt SHA-256 `fbfc4a3bd854b29d41252790da5219d880fa7d7985d40876c02072ca39b1f531`.

~~~~text
const encodeEvent = (direction: "client" | "server", message: Frame): WebSocketEvent =>
  typeof message === "string"
    ? { direction, kind: "text", body: message }
    : { direction, kind: "binary", body: Buffer.from(message).toString("base64"), bodyEncoding: "base64" }

const decodeEvent = (event: WebSocketEvent): Frame =>
  event.kind === "text" ? event.body : new Uint8Array(Buffer.from(event.body, "base64"))

const redactEvent = (event: WebSocketEvent, redactor: Redactor): WebSocketEvent => {
  if (event.kind === "binary") return event
  const body =
    event.direction === "client"
      ? redactor.request({ method: "WEBSOCKET", url: "", headers: {}, body: event.body }).body
      : redactor.response({ status: 101, headers: {}, body: event.body }).body
  return { ...event, body }
}
~~~~

Source `tooling/http-recorder/src/socket.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `c7486db4aa29bc88bd48eaa17890286670cb575d`; full-source SHA-256 `92a6e20bdf6d056f0bcbbc861b508db62a5accc5a8c0659f140b15dad5086228`.

Lines 291–298 inclusive; 438 excerpt bytes; excerpt SHA-256 `41b55094c4ae44e1193f794059d03a5d1bd6cad1703e54349efa6d2221bf4148`.

~~~~text
    Effect.gen(function* () {
      const upstream = yield* Socket.Socket
      const cassette = yield* CassetteService.Service
      const redactor = make(options.redact)
      if ((forcedMode ?? (yield* resolveAutoMode(cassette, name))) === "record")
        return yield* makeRecordingSocket(upstream, cassette, name, request, options, redactor)
      return yield* makeReplaySocket(cassette, name, request, options, redactor)
    }),
~~~~

## E27 — Associated C06 support: classifier, retry default, redacted diagnostics and post-read truncation

Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/route/executor.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `aaf189c0493309d998b1c8647f308aff57a6644e`; full-source SHA-256 `5d79a756e023054cfdd9995f4ff117cc0d2ee876ff7afb5eb9b27da6badc953c`.

Lines 35–39 inclusive; 132 excerpt bytes; excerpt SHA-256 `05b071b9e3435b2696149ba5b881bddb4f1568ccf993a509ebfd1d8dc9be46e1`.

~~~~text
const BODY_LIMIT = 16_384
const MAX_RETRIES = 2
const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 10_000
const REDACTED = "<redacted>"
~~~~

Source `packages/llm/src/route/executor.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `aaf189c0493309d998b1c8647f308aff57a6644e`; full-source SHA-256 `5d79a756e023054cfdd9995f4ff117cc0d2ee876ff7afb5eb9b27da6badc953c`.

Lines 48–74 inclusive; 1244 excerpt bytes; excerpt SHA-256 `99193364253782ec3dd467bd549bc6f313d69f871b12c8e30322901e61c5dc5f`.

~~~~text
const SENSITIVE_NAME_SOURCE =
  "authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|token|secret|credential|signature|x-amz-signature"
const SENSITIVE_NAME = new RegExp(SENSITIVE_NAME_SOURCE, "i")
const SHORT_QUERY_NAME = /^(key|sig)$/i
const SENSITIVE_BODY_FIELD = new RegExp(`(?:${SENSITIVE_NAME_SOURCE}|key)`, "i")
const REDACT_JSON_FIELD = new RegExp(`("(?:${SENSITIVE_BODY_FIELD.source})"\\s*:\\s*)"[^"]*"`, "gi")
const REDACT_QUERY_FIELD = new RegExp(`((?:${SENSITIVE_BODY_FIELD.source})=)[^&\\s"]+`, "gi")

const isSensitiveHeaderName = (name: string) => SENSITIVE_NAME.test(name)

const isSensitiveQueryName = (name: string) => isSensitiveHeaderName(name) || SHORT_QUERY_NAME.test(name)

const redactHeaders = (headers: Headers.Headers, redactedNames: ReadonlyArray<string | RegExp>) =>
  Object.fromEntries(
    Object.entries(Headers.redact(headers, [...redactedNames, SENSITIVE_NAME])).map(([name, value]) => [
      name,
      String(value),
    ]),
  )

const redactUrl = (value: string) => {
  if (!URL.canParse(value)) return REDACTED
  const url = new URL(value)
  url.searchParams.forEach((_, key) => {
    if (isSensitiveQueryName(key)) url.searchParams.set(key, REDACTED)
  })
  return url.toString()
~~~~

Source `packages/llm/src/route/executor.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `aaf189c0493309d998b1c8647f308aff57a6644e`; full-source SHA-256 `5d79a756e023054cfdd9995f4ff117cc0d2ee876ff7afb5eb9b27da6badc953c`.

Lines 150–164 inclusive; 528 excerpt bytes; excerpt SHA-256 `bff0daa613f20c68385c4a801afa8564171bc55a329bff2ab474f8b204f672b6`.

~~~~text
const requestDetails = (request: HttpClientRequest.HttpClientRequest, redactedNames: ReadonlyArray<string | RegExp>) =>
  new HttpRequestDetails({
    method: request.method,
    url: redactUrl(request.url),
    headers: redactHeaders(request.headers, redactedNames),
  })

const responseDetails = (
  response: HttpClientResponse.HttpClientResponse,
  redactedNames: ReadonlyArray<string | RegExp>,
) =>
  new HttpResponseDetails({
    status: response.status,
    headers: redactHeaders(response.headers, redactedNames),
  })
~~~~

Source `packages/llm/src/route/executor.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `aaf189c0493309d998b1c8647f308aff57a6644e`; full-source SHA-256 `5d79a756e023054cfdd9995f4ff117cc0d2ee876ff7afb5eb9b27da6badc953c`.

Lines 188–222 inclusive; 1677 excerpt bytes; excerpt SHA-256 `bbc102e6cd51f143bdc52fc5f683777a68dbc00f8045c75fb416cd172f72055c`.

~~~~text
// Two passes: structural (redact `"name": "value"` and `name=value` patterns
// for any field name that looks sensitive) plus literal (replace any actual
// secret values we sent in the request, in case the response echoes one back).
const redactBody = (body: string, request: HttpClientRequest.HttpClientRequest) =>
  Array.from(secretValues(request)).reduce(
    (text, secret) => text.split(secret).join(REDACTED),
    body.replace(REDACT_JSON_FIELD, `$1"${REDACTED}"`).replace(REDACT_QUERY_FIELD, `$1${REDACTED}`),
  )

const responseBody = (body: string | void, request: HttpClientRequest.HttpClientRequest) => {
  if (body === undefined) return {}
  const redacted = redactBody(body, request)
  if (redacted.length <= BODY_LIMIT) return { body: redacted }
  return { body: redacted.slice(0, BODY_LIMIT), bodyTruncated: true }
}

const providerMessage = (status: number, body: { readonly body?: string }) => {
  if (body.body && body.body.length <= 500) return `Provider request failed with HTTP ${status}: ${body.body}`
  return `Provider request failed with HTTP ${status}`
}

const responseHttp = (input: {
  readonly request: HttpClientRequest.HttpClientRequest
  readonly response: HttpClientResponse.HttpClientResponse
  readonly redactedNames: ReadonlyArray<string | RegExp>
  readonly body: ReturnType<typeof responseBody>
  readonly requestId?: string | undefined
  readonly rateLimit?: HttpRateLimitDetails | undefined
}) =>
  new HttpContext({
    request: requestDetails(input.request, input.redactedNames),
    response: responseDetails(input.response, input.redactedNames),
    ...input.body,
    requestId: input.requestId,
    rateLimit: input.rateLimit,
~~~~

Source `packages/llm/src/route/executor.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `aaf189c0493309d998b1c8647f308aff57a6644e`; full-source SHA-256 `5d79a756e023054cfdd9995f4ff117cc0d2ee876ff7afb5eb9b27da6badc953c`.

Lines 225–305 inclusive; 2795 excerpt bytes; excerpt SHA-256 `6d4dfbb76b4f41b64f10f9fffa2f91301ed74ea6c6a0b3520c731e8baff158d7`.

~~~~text
const statusReason = (input: {
  readonly status: number
  readonly message: string
  readonly retryAfterMs?: number | undefined
  readonly rateLimit?: HttpRateLimitDetails | undefined
  readonly http: HttpContext
}) => {
  const body = input.http.body ?? ""
  if (/content[-_\s]?policy|content_filter|safety/i.test(body)) {
    return new ContentPolicyReason({ message: input.message, http: input.http })
  }
  if (input.status === 401) {
    return new AuthenticationReason({ message: input.message, kind: "invalid", http: input.http })
  }
  if (input.status === 403) {
    return new AuthenticationReason({ message: input.message, kind: "insufficient-permissions", http: input.http })
  }
  if (input.status === 429) {
    if (/insufficient[-_\s]?quota|quota[-_\s]?exceeded/i.test(body)) {
      return new QuotaExceededReason({ message: input.message, http: input.http })
    }
    return new RateLimitReason({
      message: input.message,
      retryAfterMs: input.retryAfterMs,
      rateLimit: input.rateLimit,
      http: input.http,
    })
  }
  if (
    input.status === 400 ||
    input.status === 404 ||
    input.status === 409 ||
    input.status === 413 ||
    input.status === 422
  ) {
    return new InvalidRequestReason({
      message: input.message,
      classification: isContextOverflow(body) ? "context-overflow" : undefined,
      http: input.http,
    })
  }
  if (input.status >= 500 || retryableStatus(input.status)) {
    return new ProviderInternalReason({
      message: input.message,
      status: input.status,
      retryAfterMs: input.retryAfterMs,
      http: input.http,
    })
  }
  return new UnknownProviderReason({ message: input.message, status: input.status, http: input.http })
}

const statusError =
  (request: HttpClientRequest.HttpClientRequest, redactedNames: ReadonlyArray<string | RegExp>) =>
  (response: HttpClientResponse.HttpClientResponse) =>
    Effect.gen(function* () {
      if (response.status < 400) return response
      const body = yield* response.text.pipe(Effect.catch(() => Effect.void))
      const headers = normalizedHeaders(response.headers)
      const retryAfter = retryAfterMs(headers)
      const rateLimit = rateLimitDetails(headers, retryAfter)
      const details = responseBody(body, request)
      return yield* new LLMError({
        module: "RequestExecutor",
        method: "execute",
        reason: statusReason({
          status: response.status,
          message: providerMessage(response.status, details),
          retryAfterMs: retryAfter,
          rateLimit,
          http: responseHttp({
            request,
            response,
            redactedNames,
            body: details,
            requestId: requestId(headers),
            rateLimit,
          }),
        }),
      })
    })
~~~~

Source `packages/llm/src/route/executor.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `aaf189c0493309d998b1c8647f308aff57a6644e`; full-source SHA-256 `5d79a756e023054cfdd9995f4ff117cc0d2ee876ff7afb5eb9b27da6badc953c`.

Lines 370–378 inclusive; 445 excerpt bytes; excerpt SHA-256 `5fd05a835f471700e06cc8589f4d98412ac06f2008949ecc62e8ed199821472d`.

~~~~text
    const executeOnce = (request: HttpClientRequest.HttpClientRequest) =>
      Effect.gen(function* () {
        const redactedNames = yield* Headers.CurrentRedactedNames
        return yield* http
          .execute(request)
          .pipe(Effect.mapError(toHttpError(redactedNames)), Effect.flatMap(statusError(request, redactedNames)))
      })
    return Service.of({
      execute: (request) => retryStatusFailures(executeOnce(request)),
~~~~

Source `packages/llm/src/schema/errors.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `072e4e83892890ba48b25e45eb3cd2592afc9f86`; full-source SHA-256 `a1b34b20c32343aeece5d0da5e93896f7b1102b7a2cf4e1b65609d982ba5b159`.

Lines 62–73 inclusive; 412 excerpt bytes; excerpt SHA-256 `d55491f8db2547cb87411d02587ac23ea79c982bc7ed2177df03d640a93edc32`.

~~~~text
export class AuthenticationReason extends Schema.Class<AuthenticationReason>("LLM.Error.Authentication")({
  _tag: Schema.tag("Authentication"),
  message: Schema.String,
  kind: Schema.Literals(["missing", "invalid", "expired", "insufficient-permissions", "unknown"]),
  providerMetadata: Schema.optional(ProviderMetadata),
  http: Schema.optional(HttpContext),
}) {
  get retryable() {
    return false
  }
}

~~~~

Source `packages/llm/src/schema/errors.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `072e4e83892890ba48b25e45eb3cd2592afc9f86`; full-source SHA-256 `a1b34b20c32343aeece5d0da5e93896f7b1102b7a2cf4e1b65609d982ba5b159`.

Lines 181–183 inclusive; 57 excerpt bytes; excerpt SHA-256 `fa8ba6a554ed01a119e8f8258d6bcc69ac12d4c27d6b2a5ba2a449895a869c13`.

~~~~text
  get retryable() {
    return this.reason.retryable
  }
~~~~

## E28 — Associated C10 support: Responses protocol reuse and WebSocket message preparation

Artifacts: s1.runtime.llm_providers.l1.

Source `packages/llm/src/protocols/openai-responses.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7281d1ba2fe664db26a0ff5fbf2cb0eb99aca503`; full-source SHA-256 `3f097c0228e1d579c602569292b443459dc802bc8b9f10387e66c0c67beda46e`.

Lines 977–1013 inclusive; 1149 excerpt bytes; excerpt SHA-256 `2c6b8a633295b8839de162319e9b30cc7a849bc1e7fdea62671565c525867958`.

~~~~text
export const route = Route.make({
  id: ADAPTER,
  provider: "openai",
  protocol,
  endpoint,
  auth,
  transport: httpTransport,
  defaults: { providerOptions: { openai: { store: false } } },
})

const decodeWebSocketMessage = ProviderShared.validateWith(Schema.decodeUnknownEffect(OpenAIResponsesWebSocketMessage))

const webSocketMessage = (body: OpenAIResponsesBody | Record<string, unknown>) =>
  Effect.gen(function* () {
    if (!ProviderShared.isRecord(body))
      return yield* ProviderShared.invalidRequest("OpenAI Responses WebSocket body must be a JSON object")
    const { stream: _stream, ...message } = body
    return yield* decodeWebSocketMessage({ ...message, type: "response.create" })
  })

export const webSocketTransport = WebSocketTransport.jsonTransport.with<
  OpenAIResponsesBody,
  OpenAIResponsesWebSocketMessage
>({
  toMessage: webSocketMessage,
  encodeMessage: encodeWebSocketMessage,
})

export const webSocketRoute = Route.make({
  id: `${ADAPTER}-websocket`,
  provider: "openai",
  protocol,
  endpoint,
  auth,
  transport: webSocketTransport,
  defaults: { providerOptions: { openai: { store: false } } },
})
~~~~

Source `packages/llm/src/route/transport/websocket.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `edb8aafa28922cbe1dda18c28367e0b3487297b7`; full-source SHA-256 `faf505cee9cb136244b6dd36db4209770243028f0fbd48bb2463e4b694a3a6e9`.

Lines 226–239 inclusive; 517 excerpt bytes; excerpt SHA-256 `38617a11359902b4bf781f027dc58c1a79e2560828440650a6381c2e9fd331b1`.

~~~~text
export const json = <Body, Message>(input: JsonInput<Body, Message>): JsonTransport<Body, Message> => ({
  id: "websocket-json",
  with: (patch) => json({ ...input, ...patch }),
  prepare: (prepareInput) =>
    Effect.gen(function* () {
      const parts = yield* HttpTransport.jsonRequestParts({
        ...prepareInput,
      })
      return {
        url: yield* webSocketUrl(parts.url),
        headers: parts.headers,
        message: input.encodeMessage(yield* input.toMessage(parts.jsonBody)),
      }
    }),
~~~~

## E29 — Associated C17 support: TUI lifecycle and preceding capability declarations

Artifacts: s1.runtime.plugin.l1.

Source `packages/plugin/src/tui.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `df0eec88398ab435191810dc5e651b746561c512`; full-source SHA-256 `cdc7bc32e189f2924c79e587729458f7c39bac7d3be08b30637b7cf09e9a6d28`.

Lines 560–565 inclusive; 159 excerpt bytes; excerpt SHA-256 `bd955c78a1fbd3a5423702c68f69aaccbfc823ae4c3863d2af1f08034ade84ee`.

~~~~text
export type TuiDispose = () => void | Promise<void>

export type TuiLifecycle = {
  readonly signal: AbortSignal
  onDispose: (fn: TuiDispose) => () => void
}
~~~~

Source `packages/plugin/src/tui.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `df0eec88398ab435191810dc5e651b746561c512`; full-source SHA-256 `cdc7bc32e189f2924c79e587729458f7c39bac7d3be08b30637b7cf09e9a6d28`.

Lines 618–646 inclusive; 1114 excerpt bytes; excerpt SHA-256 `32567f7309966e2b2518c926f145f45877ef9e7774a6c7ebba4bb9623295f6c7`.

~~~~text
export type TuiPluginApi = {
  app: TuiApp
  attention: TuiAttention
  /**
   * Legacy `api.command` API kept so v1 plugins can initialize. Remove in v2.
   *
   * @deprecated Use `api.keymap.registerLayer`, `api.keymap.dispatchCommand`, and
   * `api.keymap.dispatchCommand("command.palette.show")` instead.
   */
  command?: TuiCommandApi
  keys: TuiKeys
  keymap: TuiKeymap
  mode: TuiModeApi
  route: {
    register: (routes: TuiRouteDefinition[]) => () => void
    navigate: (name: string, params?: Record<string, unknown>) => void
    readonly current: TuiRouteCurrent
  }
  ui: {
    Dialog: (props: TuiDialogProps) => JSX.Element
    DialogAlert: (props: TuiDialogAlertProps) => JSX.Element
    DialogConfirm: (props: TuiDialogConfirmProps) => JSX.Element
    DialogPrompt: (props: TuiDialogPromptProps) => JSX.Element
    DialogSelect: <Value = unknown>(props: TuiDialogSelectProps<Value>) => JSX.Element
    Slot: <Name extends string>(props: TuiSlotProps<Name>) => JSX.Element | null
    Prompt: (props: TuiPromptProps) => JSX.Element
    toast: (input: TuiToast) => void
    dialog: TuiDialogStack
  }
~~~~

## E30 — Associated C39 support: workspace exports, runtime/peer declarations and retained build files

Artifacts: s1.runtime.http_recorder.l1.

Source `tooling/http-recorder/package.json`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `cbee51daaf63a3bf771afb7e0d3ec23acb24e015`; full-source SHA-256 `913278b6857c59b808ccedae530e0179cbf9869f008abd6ef8272965da4bb7dc`.

Lines 23–25 inclusive; 39 excerpt bytes; excerpt SHA-256 `e09ee2abbfde675ec6ba6d418c13d33c4d8b8b65cba695f57cd65b832ad09b7a`.

~~~~text
  "engines": {
    "node": ">=22"
  },
~~~~

Source `tooling/http-recorder/package.json`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `cbee51daaf63a3bf771afb7e0d3ec23acb24e015`; full-source SHA-256 `913278b6857c59b808ccedae530e0179cbf9869f008abd6ef8272965da4bb7dc`.

Lines 35–38 inclusive; 85 excerpt bytes; excerpt SHA-256 `11e47cefa844571b7173a6e34cd18abcc065719df94bdc66761f839c91173cc6`.

~~~~text
  "exports": {
    ".": "./src/index.ts",
    "./internal": "./src/internal.ts"
  },
~~~~

Source `tooling/http-recorder/package.json`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `cbee51daaf63a3bf771afb7e0d3ec23acb24e015`; full-source SHA-256 `913278b6857c59b808ccedae530e0179cbf9869f008abd6ef8272965da4bb7dc`.

Lines 53–59 inclusive; 181 excerpt bytes; excerpt SHA-256 `e0b3a3fc4a0095f03e29da72b355449210ba0613b1beb020aada65f098d9a8bf`.

~~~~text
  "dependencies": {
    "@effect/platform-node": "4.0.0-beta.83",
    "@effect/platform-node-shared": "4.0.0-beta.83"
  },
  "peerDependencies": {
    "effect": "4.0.0-beta.83"
  }
~~~~

Source `tooling/http-recorder/script/build.ts`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `3f66abd5dca1bc0e307b869c6005447a3ee789aa`; full-source SHA-256 `9a750a61161e2e6e48ff48b740d548d4d26738077ac6dd38de953404959b3c6b`.

Lines 5–20 inclusive; 579 excerpt bytes; excerpt SHA-256 `a48b35cccbe4510ebdb48938770771b7a4f566a1753522631793a7b3f85cc234`.

~~~~text
await rm("dist", { recursive: true, force: true })
await $`bunx tsc --emitDeclarationOnly`

const build = await Bun.build({
  entrypoints: ["src/index.ts"],
  outdir: "dist",
  target: "node",
  format: "esm",
  packages: "external",
})
if (!build.success) throw new AggregateError(build.logs, "Failed to build @orchestra/http-recorder")

const publicFiles = new Set(["index.js", "index.d.ts", "effect.d.ts", "socket.d.ts", "types.d.ts"])
await Promise.all(
  (await readdir("dist")).filter((file) => !publicFiles.has(file)).map((file) => rm(`dist/${file}`, { force: true })),
)
~~~~


# R4 — Documentary and generated-schema spans

The guides and maintenance skill text below are source data. They support documentary attribution only. D04 preserves the guide’s ignored-key statement and the generated schema’s root reference/object restriction without resolving the decoder/publisher relationship.

## D01 — Model guide: Core routing limits, one host turn, outer orchestration, gates and billing refusal

Artifacts: s1.runtime.guides_intent.l1, s1.runtime.llm_providers.l1.

Documentary/schema evidence only; no host execution or runtime acceptance follows.

Source `docs/guides/models.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1acc49061d975b65c05cb2c194cd612b802914d8`; full-source SHA-256 `5821a5ac3a5cc3090224989a2b94e32d80b55f4dbc6f3b296272b63e32c8d399`.

Lines 9–16 inclusive; 327 excerpt bytes; excerpt SHA-256 `3d8c3ccd5f77e4db977a987bc049b1489f18ddb310dbe4ac83d17cc9b3970d9f`.

~~~~text
| Wire protocol | Routed by the session core |
| --- | --- |
| Anthropic Messages | Yes |
| OpenAI Responses | Yes |
| OpenAI-compatible chat | Yes |
| Bedrock Converse | Not yet (implemented in the model layer) |
| Gemini | Not yet (implemented in the model layer) |
| OpenAI Chat | Not yet (implemented in the model layer) |
~~~~

Source `docs/guides/models.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1acc49061d975b65c05cb2c194cd612b802914d8`; full-source SHA-256 `5821a5ac3a5cc3090224989a2b94e32d80b55f4dbc6f3b296272b63e32c8d399`.

Lines 24–24 inclusive; 124 excerpt bytes; excerpt SHA-256 `0190e10018b332a7875f29ca83877eb4ef22b87a6aef3f583f94b7b1d67fbc2e`.

~~~~text
Orchestra keeps its rules by treating Claude Code as an execution host for one provider turn, not as a second orchestrator.
~~~~

Source `docs/guides/models.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `1acc49061d975b65c05cb2c194cd612b802914d8`; full-source SHA-256 `5821a5ac3a5cc3090224989a2b94e32d80b55f4dbc6f3b296272b63e32c8d399`.

Lines 31–37 inclusive; 1365 excerpt bytes; excerpt SHA-256 `3fb33105c1fa0180618054620ca19190c4c427ba33cc843b9fd6b1c31d4d7296`.

~~~~text
| Rule | How |
| --- | --- |
| One turn, one call | The runner still admits your prompt, loads history and persists every event. One provider turn is one call into the host; Claude Code's internal tool calls are stored as events. Claude Code owns compaction inside its session. |
| Claude Code stays Claude Code | `query()` always keeps Claude Code's own system prompt; Orchestra adds only an appendix. Project context goes with each prompt and is resent only when its hash changes. |
| Orchestra's tools, Orchestra's gate | Seats, board, memory, skills and other Orchestra tools are served as an MCP server (`mcp__orchestra__*`). Claude Code's own tools pass a PreToolUse gate running Orchestra's permission rules, ToolSafety and the sandbox, failing closed. `mcp__orchestra__*` calls pass the hook only for the governed-loading check; the runner settles their permissions. |
| Seats stay real sessions | Agent and Task are refused, so a seat is dispatched with `mcp__orchestra__task` and becomes an Orchestra session. SendMessage, ListAgents, RemoteTrigger and PushNotification are refused too. A child seat runs on Claude Code only with a Claude model; otherwise on Orchestra's own loop. |
| Billing passed through | A billing refusal is shown word for word and never retried. Cost comes from Claude Code's own total. Each turn starts one Claude Code process. |
~~~~

## D02 — Claude-mode guide: provider entry, retained orchestration/tools and billing intent

Artifacts: s1.runtime.guides_intent.l1.

Documentary/schema evidence only; no host execution or runtime acceptance follows.

Source `docs/guides/claude-mode.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `77e0c8baca27404196d3c1536003321d8ea036df`; full-source SHA-256 `2983000d717fabb224f0bdb11d507289d2afe396abeee967758753e7d00050d3`.

Lines 3–5 inclusive; 262 excerpt bytes; excerpt SHA-256 `b8f31a8f61d817a5c957248eb64455ff3149ab21e02592332f37db0339222360`.

~~~~text
Claude mode runs Orchestra on your Claude subscription. To you it is Orchestra as in any other mode: the same app,
the same screens and widgets, the same Maestro, seats, board, workflows, permissions and skills. Only the way Orchestra
reaches the model changes.
~~~~

Source `docs/guides/claude-mode.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `77e0c8baca27404196d3c1536003321d8ea036df`; full-source SHA-256 `2983000d717fabb224f0bdb11d507289d2afe396abeee967758753e7d00050d3`.

Lines 12–15 inclusive; 394 excerpt bytes; excerpt SHA-256 `49a7876da430a01d5c808f696fabb28c9bdce67206ce3452c3f646e1882a26f1`.

~~~~text
- **Claude Code runs the model.** Every turn on a Claude model is a Claude Code turn, signed in with your Claude login.
- **Claude Code's own prompt is kept.** Orchestra adds a short note after it and never replaces it.
- **Anthropic's billing applies.** Anthropic decides how each turn is billed. Orchestra never changes its prompts,
  tools or requests to influence that, and never tests it.
~~~~

Source `docs/guides/claude-mode.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `77e0c8baca27404196d3c1536003321d8ea036df`; full-source SHA-256 `2983000d717fabb224f0bdb11d507289d2afe396abeee967758753e7d00050d3`.

Lines 24–32 inclusive; 850 excerpt bytes; excerpt SHA-256 `9fdde036f5b819eb5c8a9db8fea2282e55b9850da2df0c53565fccd47b001346`.

~~~~text
- **Delegation.** Maestro dispatches a seat with Orchestra's task tool, as in normal mode. Each dispatch is its own
  Session, which you open from the task row and follow live. A seat on a Claude model runs on Claude Code too; a seat
  on another provider's model runs as it would in normal mode.
- **Seats.** Each seat works by its own Orchestra prompt and skills, under its own permissions.
- **Permissions.** Every tool call is checked against Orchestra's permission rules before it runs.
- **Workflows, reviews and the board.** Governed workflows, review requests, Atlas and the board use Orchestra's own
  tools, exactly as in normal mode.
- **Project context.** The project's context and the active workflow's instructions reach the model with your message.
  They are sent again only when they change, and after the conversation is compacted.
~~~~

Source `docs/guides/claude-mode.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `77e0c8baca27404196d3c1536003321d8ea036df`; full-source SHA-256 `2983000d717fabb224f0bdb11d507289d2afe396abeee967758753e7d00050d3`.

Lines 38–46 inclusive; 552 excerpt bytes; excerpt SHA-256 `84a2536bfbd74cb2237eb2ed2e1c8c00c6a9b6ae57df3f6b2e2c50b640ef19c0`.

~~~~text
- Claude Code's built-in tools do the reading, editing and shell work; Orchestra's own tools, such as the board, the
  task tool and the skill tool, are offered to it beside them.
- Claude Code's own subagent tool is not used. Seats are always Orchestra Sessions.

## Known limits

- Claude Code's tool calls show with Orchestra's usual widgets (shell, read, edit, todos, task, ...).
- If Anthropic bills a turn as extra usage or refuses it, the app shows the provider's message. You can enable extra
  usage, use an API key, or pick another provider.
~~~~

## D03 — Claude maintenance: host/tool ownership, governed loading and billing restrictions

Artifacts: s1.runtime.maintenance_intent.l1.

Documentary/schema evidence only; no host execution or runtime acceptance follows.

Source `.orchestra/skills/claude-code-maintenance/SKILL.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7f3c5b9525fbe1b7bd7a34f60e6f143a8f5505d7`; full-source SHA-256 `dfdceecf6ba2395d80332762ae9b1bbc09b83b6d9ee69ac1d0c7a68b99d5cb9c`.

Lines 12–30 inclusive; 2018 excerpt bytes; excerpt SHA-256 `6cda13b5496393daeb28e4e5034d163c98df417d0df3894e3dac4369fd0d3fde`.

~~~~text
| Piece | Owner file | Rule |
|---|---|---|
| Host: stream, tool serving, gate, MCP server | `modules/engine-adapters/claude-code/src/v2/host.ts` | Every Claude Code call passes `decide()`; PreToolUse and `canUseTool` share it |
| Preset append and seat text | `modules/engine-adapters/claude-code/src/host/options.ts` (`append`, `environment`) | Appends only; never a custom system prompt or a main-thread agent |
| Governed playbook name | `modules/maestro/coordination/playbooks/maestro-run/governed/SKILL.md` (skill `maestro-run-governed`) | Must match the name the gate checks and the rule in `packages/core/src/agent/prompt/maestro.txt` |
| Skill permission for seats | `packages/core/src/tool/skill.ts`, tested in `modules/maestro/coordination/test/v2-seats.test.ts` | Permission is asserted at execution, so serving `skill` adds no bypass |

## Tool serving

- `UNSERVED` in `host.ts` lists the Orchestra tools Claude Code has as built-ins or that belong to Orchestra's own loop. A name there is never served over MCP. Adding a tool to `UNSERVED` removes it from Claude mode; check it is not an Orchestra tool the seat needs first.
- `skill` is served as `mcp__orchestra__skill`. Claude Code's built-in `Skill` tool does not know Orchestra's playbooks, so the append says so.
- Subagent tools (`Agent`, `Task`) are refused whenever Orchestra's `task` is served.

## Governed-work gate

- In `decide()`, a `maestro_*` tool is refused until its session has loaded `maestro-run-governed` through `mcp__orchestra__skill`. Excluded: `maestro_arsenal_*` and `maestro_workflows`.
- The loaded flag (`governedLoaded`, keyed by session id) is set only when the skill call returns without an error, in the MCP handler after execution.
- The check runs before the `callIDs` registration. A refused call never reaches the MCP handler, so registering it first would shift the queue of tool-use IDs for the next call of that name.
- The flag lives in process memory. A restart resets it, and the model reloads the playbook.
~~~~

Source `.orchestra/skills/claude-code-maintenance/SKILL.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `7f3c5b9525fbe1b7bd7a34f60e6f143a8f5505d7`; full-source SHA-256 `dfdceecf6ba2395d80332762ae9b1bbc09b83b6d9ee69ac1d0c7a68b99d5cb9c`.

Lines 42–48 inclusive; 1518 excerpt bytes; excerpt SHA-256 `8df1392d8bc28168eb0adc0893daa26d6dabaea5fad537dff90d7ff8d3cb6fba`.

~~~~text
- Only the `claude_code` preset is used. `query()` never carries a custom `systemPrompt`.
- Every tool call passes the gate first, and a failure to decide refuses the call (fail closed).
- `ENV_FLAGS` and the `CLAUDE_CODE_ENTRYPOINT` removal stay in `environment()`. Credentials are never added or removed.
- The owner's own Claude Code settings stay in charge: `settingSources` is `["project"]`, and `permissionMode` is `default`.
- Mid-session System Context changes reach Claude Code: `system` history messages not yet in `delivered` join the `UserPromptSubmit` hook text after the baseline. Record their ids only when the hook sent them, never when the prompt was merely handed. The compaction recall carries the baseline plus every update.
- Maestro may call only Claude Code tools mapped in `PERMISSIONS` plus the bookkeeping set `MAESTRO_BOOKKEEPING` (todos, task list, plan mode, shell output); any other built-in is refused in `decide()` before `turn.authorize`. Maestro's conductor limits (`modules/maestro/coordination/src/v2/conductor.ts`) run inside `turn.authorize`, which wraps authorization only, so in Claude mode a call counts once it is authorized and the write budget is measured on the worktree, not on the tool's input.
- Maestro's routing comes from the `<team>` System Context block (`modules/maestro/coordination/src/v2/team-source.ts`), which reaches Claude Code through the same path. The Maestro note in `host/options.ts` points at that list; never name seats or display names in the note.
~~~~

Source `.orchestra/skills/claude-mode-maintenance/SKILL.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `398b0505f2cb06d475eb4fcbf4f90f7b571d8270`; full-source SHA-256 `51cd45d3b4e3bff7e1ac50dd5bd9354efb1e8be616f84837fbbf512cfec19c20`.

Lines 25–40 inclusive; 1437 excerpt bytes; excerpt SHA-256 `65539d7e7fde20abcd3f0beb705fcc7b2f3ea439195dd20c6dcfc223cb9a0b5a`.

~~~~text
## Invariants

- `systemPrompt` is always the `claude_code` preset with `ClaudeHostOptions.append(...)`. Never a custom prompt
  (`test/preset-guard.test.ts`), and never the Context Epoch baseline. Maestro's append is its short note only.
- `Turn.context` goes in through the `UserPromptSubmit` hook, deduplicated by `contextHash` in host state, and again
  in the `SessionStart` compact hook.
- Claude mode differs from normal mode only in how the model is reached. The app shows the same screens and widgets;
  a change that makes Claude mode look or behave differently is a defect unless Anthropic's rules require it.
- Seats are dispatched through Orchestra's `task`, as in normal mode: a durable child Session. Never through Claude
  Code's `Agent`/`Task`, which are in `disallowedTools` and refused at the gate (`SUBAGENT_TOOLS`).
- A child Session runs on `engineOf`: its agent's own `engine`, else Orchestra's loop for a non-Anthropic model, else
  its parent's engine. The runner and `tool/task.ts` share this one function; never decide the engine twice.
- A hosted child's Anthropic models count as available without an API connection: the host holds the Claude sign-in,
  which the catalog never sees (`resolveModel`'s `hosted` in `tool/task.ts`). A child on Orchestra's own loop still
  needs a connected provider.
- A seat other than Maestro gets its own Orchestra prompt in the append (`turn.system` minus `turn.context`).
~~~~

Source `.orchestra/skills/claude-mode-maintenance/SKILL.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `398b0505f2cb06d475eb4fcbf4f90f7b571d8270`; full-source SHA-256 `51cd45d3b4e3bff7e1ac50dd5bd9354efb1e8be616f84837fbbf512cfec19c20`.

Lines 56–64 inclusive; 980 excerpt bytes; excerpt SHA-256 `4661bae23503a0102c3b80a85f017aa22c7bd557b2ab4c1308e2b26e4c8d7040`.

~~~~text
- `HOST_REACH` (`ListAgents`, `SendMessage`, `RemoteTrigger`, `PushNotification`) is refused before any permission
  check: these built-ins reach other Claude sessions on the machine, the account's routines or the owner's phone.
  When Claude Code adds a built-in that crosses the query's boundary, add it here.
- Governed dispatch stays MCP: `mcp__orchestra__task`, `mcp__orchestra__maestro_request_review`.
- Switching the engine in the app (`enableClaudeMode`, `setMaestroEngine`) goes through `updateConfig`. Its
  `onSuccess` runs while the mutation is still pending, which pauses the refresh queue, so the open directories it
  re-queues drain only on `queue.resume()` when `reload` settles (`packages/app-shell/src/context/server-sync.tsx`).
  Without it the composer keeps Maestro's old engine and drops every `executionHost` model, leaving "Select model".
- Billing: never change prompts, headers or tools to influence how Anthropic classifies usage, and never probe it.
~~~~

## D04 — Config guide and generated schema: both unresolved documentary/schema sides

Artifacts: s1.runtime.guides_intent.l1, s1.runtime.maintenance_intent.l1.

Documentary/schema evidence only; no host execution or runtime acceptance follows.

Source `docs/guides/config-errors.md`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `bf6413cf2175b7804616709506aec44b5e1f5c31`; full-source SHA-256 `8051b0ad4d4d638d808a04d00b82193fe455cc6cb409e4fff1bcc8c59e4e4d60`.

Lines 9–20 inclusive; 597 excerpt bytes; excerpt SHA-256 `bf036d753bb0f29caab3bd462475b5bdc1562e71180109cba15485f82cbefbeb`.

~~~~text
The error names the file and what is wrong:

- A syntax error gives the file path, the kind of problem (for example a missing comma) and where in the file it is.
- A value that does not match the schema gives the file path and the key that is wrong, for example that `model` must be a string.

## How to fix it

1. Open the file named in the error.
2. Fix the syntax or the value it points to. Comments and trailing commas are allowed in `.jsonc` and in `.json`.
3. Start again. If you want to run without the file for now, rename or move it.

An unknown extra key is not an error; it is ignored.
~~~~

Source `schema/config.json`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ba9b5d2121a9a3bda733cba0459094b69757ede6`; full-source SHA-256 `8fda412b89aa5630cfd7b2e2116a0789ab7b793423edfbf8dcec3927c6016747`.

Lines 1–4 inclusive; 109 excerpt bytes; excerpt SHA-256 `80e43edc1b9ca0dc0ac5f1ec0741047f1bcdd98eafabb0a4e3b49f39705efa4a`.

~~~~text
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$ref": "#/$defs/Config.Info",
  "$defs": {
~~~~

Source `schema/config.json`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ba9b5d2121a9a3bda733cba0459094b69757ede6`; full-source SHA-256 `8fda412b89aa5630cfd7b2e2116a0789ab7b793423edfbf8dcec3927c6016747`.

Lines 1054–1064 inclusive; 349 excerpt bytes; excerpt SHA-256 `f15989b4f6ed3b58925b54afe99ba9f0497e2e87da106a99d132c65135306e81`.

~~~~text
    "Config.Info": {
      "type": "object",
      "properties": {
        "$schema": {
          "type": "string",
          "description": "JSON schema reference for configuration validation"
        },
        "shell": {
          "type": "string",
          "description": "Default shell to use for terminal and shell tool execution"
        },
~~~~

Source `schema/config.json`; commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `ba9b5d2121a9a3bda733cba0459094b69757ede6`; full-source SHA-256 `8fda412b89aa5630cfd7b2e2116a0789ab7b793423edfbf8dcec3927c6016747`.

Lines 1234–1246 inclusive; 269 excerpt bytes; excerpt SHA-256 `b90d4d7b79ca7026bdfcbc8b74bc49500d52b2690b2f44acffad5fd01d3f6ac5`.

~~~~text
        "providers": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/$defs/ConfigV2.Provider"
          }
        }
      },
      "additionalProperties": false
    }
  },
  "allowComments": true,
  "allowTrailingCommas": true
}
~~~~


