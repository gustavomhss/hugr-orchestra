# Pinned Lean backend dependency

Native integration consumes the published HuGR-Lean 0.4.0 package (Lean 2.0
summarize mode plus the lossless profile engine and the local raw store). This is an
ordinary bundled dependency, not a parser fork or release.

- Package: `hugr-lean@0.4.0`; backend imports only `hugr-lean/core` and `hugr-lean/raw`.
- Donor repository: https://github.com/gustavomhss/HuGR-Lean.
- Source commit: `0660c2b5dc9249816330603160aadfaeb33e5fc7` (tag `v0.4.0`, release PR #161).
- Source tree: `af1e9f1bd9781588fde339737e6c006886c64a4f`.
- Artifact: `hugr-lean-0.4.0-0660c2b5dc92.tgz`, 205370 bytes, the exact npm registry tarball
  `https://registry.npmjs.org/hugr-lean/-/hugr-lean-0.4.0.tgz`.
- SHA-256: `5ff983c58aa056d82059d5edd5b428478dda50a7683a201b7d844949aa1712a3`
  (equals the GitHub release asset `hugr-lean-0.4.0.tgz.sha256` of release `v0.4.0`;
  the release `.tgz` asset is byte-identical to the npm tarball).
- SHA-512 (npm `dist.integrity`): `sha512-mN7VGI6MBXiswd5ye0zJZML5loxhdrL3/HJbzvvXT8Cv6kMTyYsR7YorNYk6REdwEE4E4BfiwnuzZljOCDlkew==`;
  npm `dist.shasum` `5acd3ab1c9b31b3e6f07508b24fc8201d5e32fc7`.
- Provenance: npm SLSA v1 attestation (`https://registry.npmjs.org/-/npm/v1/attestations/hugr-lean@0.4.0`)
  binds the same SHA-512 subject to `refs/tags/v0.4.0` at commit `0660c2b5…` built by
  `.github/workflows/release.yml`, run https://github.com/gustavomhss/HuGR-Lean/actions/runs/38402476737.
- License: MIT, copyright 2026 gmhelmold. The package includes its complete
  LICENSE, NOTICE and donor license materials (52 notice files: LICENSE, NOTICE,
  `licenses/TRS-MIT.txt` and every shipped `SOURCES.md`).
- Modification record: archive bytes unchanged; filename gains the immutable source suffix.
  No implementation/profile material copied into Orchestra source. Packaging copies
  complete LICENSE, NOTICE, licenses/** and all shipped SOURCES.md byte-for-byte.

Verification performed when vendoring (reproducible):

```sh
npm view hugr-lean@0.4.0 dist --json          # integrity, shasum, attestations URL
curl -sSfLO https://registry.npmjs.org/hugr-lean/-/hugr-lean-0.4.0.tgz
openssl dgst -sha512 -binary hugr-lean-0.4.0.tgz | base64   # == dist.integrity
gh release download v0.4.0 -R gustavomhss/HuGR-Lean -p '*'   # .tgz identical, .sha256 matches
```

`getProfiles()`, `tokenizeCommand()`, `filter()`, `summarize()`, `recoveryLine()` and
`RawStore`/`recallLines()` come from this actual archive. Classifier prefix evidence
lives at `fixtures/profiles/*/cases.json` in the pinned MIT source; identification is
attribution, not proof that every command grammar reduces. Playwright's witnessed Node
CLI path contains `@`, rejected by the frozen tokenizer: those invocations remain
unattributed. Previous engine stamps (`hugr-lean@0.2.0:*`) stay decodable so saved
profile history keeps counting after the upgrade.
