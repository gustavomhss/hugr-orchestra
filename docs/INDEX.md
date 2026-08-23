# HuGR Relay — Documentation Index (hashed)

Integrity manifest for the Relay documentation set. Each hash is SHA-256 of the file's bytes.
Regenerate after any documentation change (`bin/gen-doc-index.py`).

- **Generated:** 2026-08-23T06:11:43Z
- **Files:** 26
- **Root hash** (SHA-256 of the sorted `<sha256>  <path>` manifest): `0b5d708dce21e0e23f81bffef9158daca20eecbbb7f46f6dd48cc1fb74fae3a8`

| File | Lines | Bytes | SHA-256 |
|---|---|---|---|
| `README.md` | 113 | 6983 | `89f93c5cd2c470f3bc06b65c4bc69a43c4a1b374297a7bf68657a3ea5d47c89f` |
| `WHITEPAPER.md` | 276 | 34262 | `ec73d23a11a2479fccfeba5755498075920547dd267f4331e0eb8cf10b228368` |
| `PRODUCT.md` | 452 | 41985 | `d506df7971338dc45d566c7afba9bdacc836a23b31066fd68a83e7a14b594d71` |
| `SPEC.md` | 312 | 18430 | `89a6028568ed2b53b0f9ffcbacc89dbebbe20dfe6c4ed159b65937933bec3ee3` |
| `CONTRIBUTING.md` | 30 | 1557 | `0ec40378b3573adeea93cc3b6ca4c2e2a9e541c5e4ec9ee779dfac4d36cb672a` |
| `CHANGELOG.md` | 205 | 16654 | `11a3a67ed0f24ed494804758b952b1fe4e1c4f42aafb32574f8c878111e52fde` |
| `docs/architecture.md` | 283 | 14542 | `30fec8f42bb9597cb747999c55fa9beb5e29b7313a822b5b71c1051ff01a221d` |
| `docs/authoring-sprints.md` | 320 | 16461 | `7955d22e2c94499e60d80ce5bf588360f6c28f69cfaa8535bd6844fbaa222044` |
| `docs/auto-decompose.md` | 61 | 2959 | `a72e0d02d8c632035829644a18e18a6a337c96d0a46ddc89ae0bdb140f7b735e` |
| `docs/compaction.md` | 84 | 3781 | `63bbf7b052e31dcc90f3ba4864c83577f8a8a838fdc32ca1bf53eba8a1336b2b` |
| `docs/concepts.md` | 121 | 5309 | `cca3f0b80023fbe7d673ace6a25bdaeb54e4352268a5171ca0b096616451b2bc` |
| `docs/configuration.md` | 279 | 11560 | `32f164e9d3419fe514e4e1006b375915bb15c9042cdfd94ab5b673bf1c7d27cf` |
| `docs/control-plane.md` | 608 | 33406 | `d0bd54f18fc9d5a4fd709d2cdd9185400ac162e8950d54f45443a8c8adee4948` |
| `docs/daemon.md` | 176 | 9663 | `7956af420e4334638b22a3e994c18d15d1495bbfdf5cc6fd19b37cb20f1a445f` |
| `docs/enforcement-model.md` | 246 | 13338 | `c1ae62cedc26f8544a943ba0e50f704d6b18cf390ed01f1bc2f3ddd48dd59d1e` |
| `docs/faq.md` | 166 | 7813 | `5755679e358ff6525b6f3a0c213e42f4772c3a42d87ebed683839030c4af0ef6` |
| `docs/gates.md` | 420 | 18521 | `0e809f530471a0b9cd0d2c94d4d61fa4c6e2d363daec16f2886a19179bb33bf0` |
| `docs/getting-started.md` | 201 | 7560 | `430fca84bc40dd272df2cbc35b8f5d371c2c3235ff8a08f27645e296241ec360` |
| `docs/guardrails.md` | 111 | 6214 | `3849f0a3a2b576e864f28b8f74e94cae314dae844cd3d14b5a30eb09953c6f63` |
| `docs/per-agent-arms.md` | 93 | 4472 | `f7fad9bc29e16f60a7f1798c081093145a6122709d2d31eca98dde28c61be42c` |
| `docs/profiles.md` | 165 | 7415 | `bc9f65e0edeaa149a715690eda4a944d5d9d7446d8ab5c2d50915c9fd7e3f3e7` |
| `docs/relay-v2.md` | 549 | 33375 | `e23e415e06ad2c12f9ebd86c67a3b527510f3a3f8b0d4b6d95b2a8bd4f9b38a9` |
| `docs/sdk.md` | 66 | 3120 | `77213b84ad6b4143507cf245bccaab4a9d73ee2e8f65b74ee99a6261c5a7835b` |
| `docs/spec-library.md` | 125 | 6858 | `c3d528a3b3a47c0f2ee592a492954b33fcf3c7a8eeef91cb52a339f6ecd9c7af` |
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
