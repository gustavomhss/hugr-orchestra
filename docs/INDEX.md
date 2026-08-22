# HuGR Relay — Documentation Index (hashed)

Integrity manifest for the Relay documentation set. Each hash is SHA-256 of the file's bytes.
Regenerate after any documentation change (`bin/gen-doc-index.py`).

- **Generated:** 2026-08-22T23:42:53Z
- **Files:** 23
- **Root hash** (SHA-256 of the sorted `<sha256>  <path>` manifest): `78fd2ff9bb370270f2b19ea4eccba9984dc921a2c0266126090239ed88931fe8`

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
| `docs/control-plane.md` | 532 | 28612 | `41b7021fd204165b38b6d74f7c6a2f5505ea890cf47691dabdf57b8fe6180c43` |
| `docs/daemon.md` | 103 | 5919 | `1054cf7bc3627911bbe3bb99b913e4343569729ec8c37340631ed68195daab93` |
| `docs/faq.md` | 166 | 7813 | `5755679e358ff6525b6f3a0c213e42f4772c3a42d87ebed683839030c4af0ef6` |
| `docs/gates.md` | 259 | 9373 | `5f2e4ca16607afa85c546a71b239008f8e9882485cb1a3f88876fc7d7304175f` |
| `docs/getting-started.md` | 201 | 7560 | `430fca84bc40dd272df2cbc35b8f5d371c2c3235ff8a08f27645e296241ec360` |
| `docs/guardrails.md` | 111 | 6214 | `3849f0a3a2b576e864f28b8f74e94cae314dae844cd3d14b5a30eb09953c6f63` |
| `docs/per-agent-arms.md` | 93 | 4472 | `f7fad9bc29e16f60a7f1798c081093145a6122709d2d31eca98dde28c61be42c` |
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
