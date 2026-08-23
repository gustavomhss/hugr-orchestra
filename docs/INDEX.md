# HuGR Relay — Documentation Index (hashed)

Integrity manifest for the Relay documentation set. Each hash is SHA-256 of the file's bytes.
Regenerate after any documentation change (`bin/gen-doc-index.py`).

- **Generated:** 2026-08-23T03:56:11Z
- **Files:** 25
- **Root hash** (SHA-256 of the sorted `<sha256>  <path>` manifest): `0a9b8973abb85e76fc288a704d1b004946a127de1b87dd2a2f7949dc4da54b7b`

| File | Lines | Bytes | SHA-256 |
|---|---|---|---|
| `README.md` | 113 | 6983 | `89f93c5cd2c470f3bc06b65c4bc69a43c4a1b374297a7bf68657a3ea5d47c89f` |
| `WHITEPAPER.md` | 276 | 34262 | `ec73d23a11a2479fccfeba5755498075920547dd267f4331e0eb8cf10b228368` |
| `PRODUCT.md` | 452 | 41985 | `d506df7971338dc45d566c7afba9bdacc836a23b31066fd68a83e7a14b594d71` |
| `SPEC.md` | 312 | 18430 | `89a6028568ed2b53b0f9ffcbacc89dbebbe20dfe6c4ed159b65937933bec3ee3` |
| `CONTRIBUTING.md` | 30 | 1557 | `0ec40378b3573adeea93cc3b6ca4c2e2a9e541c5e4ec9ee779dfac4d36cb672a` |
| `CHANGELOG.md` | 205 | 16654 | `11a3a67ed0f24ed494804758b952b1fe4e1c4f42aafb32574f8c878111e52fde` |
| `docs/architecture.md` | 266 | 13374 | `33bc3f4a592ad429d8afaa78edfdf917b8313d2dfc410af6d76908bc5a209d21` |
| `docs/authoring-sprints.md` | 246 | 12105 | `785dabbc1545c1b36789464d90df12c3a6a5f8f5046fac218e57ac5f620eb986` |
| `docs/auto-decompose.md` | 61 | 2959 | `a72e0d02d8c632035829644a18e18a6a337c96d0a46ddc89ae0bdb140f7b735e` |
| `docs/compaction.md` | 84 | 3781 | `63bbf7b052e31dcc90f3ba4864c83577f8a8a838fdc32ca1bf53eba8a1336b2b` |
| `docs/concepts.md` | 121 | 5309 | `cca3f0b80023fbe7d673ace6a25bdaeb54e4352268a5171ca0b096616451b2bc` |
| `docs/configuration.md` | 237 | 9484 | `085cbab8598bfe9ff5e2aec7629e25b7889b7ec7fc62d6dad7bf129a3dcbfd4e` |
| `docs/control-plane.md` | 540 | 29297 | `732ce3202d64833a8fec3a9b6eb5d20ecdf475888f8bf2ba6cd2f6abcba0b958` |
| `docs/daemon.md` | 103 | 5919 | `1054cf7bc3627911bbe3bb99b913e4343569729ec8c37340631ed68195daab93` |
| `docs/enforcement-model.md` | 246 | 13338 | `c1ae62cedc26f8544a943ba0e50f704d6b18cf390ed01f1bc2f3ddd48dd59d1e` |
| `docs/faq.md` | 166 | 7813 | `5755679e358ff6525b6f3a0c213e42f4772c3a42d87ebed683839030c4af0ef6` |
| `docs/gates.md` | 294 | 11486 | `b2178b70b73250dd03bdcd289d8d96507511b3cac2364313127b45e81ac5a891` |
| `docs/getting-started.md` | 201 | 7560 | `430fca84bc40dd272df2cbc35b8f5d371c2c3235ff8a08f27645e296241ec360` |
| `docs/guardrails.md` | 111 | 6214 | `3849f0a3a2b576e864f28b8f74e94cae314dae844cd3d14b5a30eb09953c6f63` |
| `docs/per-agent-arms.md` | 93 | 4472 | `f7fad9bc29e16f60a7f1798c081093145a6122709d2d31eca98dde28c61be42c` |
| `docs/relay-v2.md` | 536 | 32385 | `129ae0016c1131a524ceb0a79f56b18de81608d753611a8e86259d2705606c66` |
| `docs/sdk.md` | 66 | 3120 | `77213b84ad6b4143507cf245bccaab4a9d73ee2e8f65b74ee99a6261c5a7835b` |
| `docs/spec-library.md` | 82 | 4549 | `4fc9abeb6cd2c1431c88438d7d18dad005da824861fd284f07aee0a7e92928c7` |
| `docs/telemetry.md` | 84 | 4491 | `3f7497754ddf6f0c331c6bb0cc18e0738c30d9fd53fa188093a3ae5ee4d4fc25` |
| `docs/trace-corpus.md` | 52 | 2500 | `06ecf57e2a0932788a241634b06c1bce8dfdf2679e813db2a6b7ad9bb13606f4` |

## Verify

```bash
# from the relay/ root — recompute and compare to the table above
for f in README.md WHITEPAPER.md PRODUCT.md SPEC.md CONTRIBUTING.md CHANGELOG.md docs/*.md; do
  [ "$f" = docs/INDEX.md ] && continue
  shasum -a 256 "$f"
done
```
