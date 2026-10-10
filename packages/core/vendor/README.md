# Pinned Lean backend dependency

Native integration consumes the expanded PR129 runtime plus its public immutable
selection API. This is an ordinary bundled dependency, not a parser fork or release.

- Package: `hugr-lean@0.2.0`; backend imports only `hugr-lean/core`.
- Donor repository: https://github.com/gustavomhss/HuGR-Lean.
- Expansion base: merged PR129, `db767483c06b57614fbed6c3fe7f70ae810e46a4`.
- Artifact source commit: `465fb4c04773f1a40733c9f4c334b980e3195646` (Lean PR132).
- Source tree: `c3a77068a1b72d57ba39ca1b1aa145e0b6e506d7`.
- Artifact: `hugr-lean-0.2.0-native-465fb4c04773.tgz`, 387905 bytes.
- SHA-256: `369206cd0a468904d7896c3e729535911e9258a7d4a3e9c8eedb078b6a096ec1`.
- SHA-512: `db19186dd33de27256391307179b3ca20fdfc0f395e1eff0a47511e0eef6294eca4eb894d13759ee46e23dd741239bd9d74779bb52c2582adc718b3c1ae82519`.
- CI producer: https://github.com/gustavomhss/HuGR-Lean/actions/runs/38015375615,
  artifact `lean-package-465fb4c04773f1a40733c9f4c334b980e3195646`.
  Download includes actual tgz, pack metadata, candidate identity, source/tree/archive
  provenance and `licenseRoot` containing every shipped license and SOURCES.md.
- License: MIT, copyright 2026 gmhelmold. The package includes its complete
  LICENSE, NOTICE and donor license materials.
- Modification record: archive bytes unchanged; filename gains immutable source suffix.
  No implementation/profile material copied into Orchestra source. Packaging copies
  complete LICENSE, NOTICE, licenses/** and all shipped SOURCES.md byte-for-byte.

`getProfiles()` and `tokenizeCommand()` come from this actual archive. Classifier
prefix evidence lives at `fixtures/profiles/*/cases.json` in the pinned MIT source;
identification is attribution, not proof that every command grammar reduces.
Playwright's witnessed Node CLI path contains `@`, rejected by the frozen tokenizer:
those invocations remain exact and unattributed. No invented direct/npx aliases.
The retained `hugr-lean-0.2.0.tgz` is historical; dependency selects only the new pin.
Schema engine metadata stamp is parent-owned and must be updated before expanded
metadata claims. Package pin alone does not certify native telemetry or dashboard UI.
