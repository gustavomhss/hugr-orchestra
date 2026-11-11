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
