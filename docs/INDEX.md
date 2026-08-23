# HuGR Relay — Documentation Index (hashed)

Integrity manifest for the Relay documentation set. Each hash is SHA-256 of the file's bytes.
Regenerate after any documentation change (`bin/gen-doc-index.py`).

- **Generated:** 2026-08-23T23:46:08Z
- **Files:** 26
- **Root hash** (SHA-256 of the sorted `<sha256>  <path>` manifest): `538105e259378978f1ddddfae4d9c1074d9c988364cb52d5640f12f9fc75f763`

| File | Lines | Bytes | SHA-256 |
|---|---|---|---|
| `README.md` | 116 | 7293 | `fc0a26b896cad1ee125865591663cd936520e37cf081a4fefa9365d9b6a82337` |
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
| `docs/configuration.md` | 319 | 13887 | `b1204b0a8ba2d907e4c2dd538597a4da5a11089f4b09b1baa3790532edcba3aa` |
| `docs/control-plane.md` | 608 | 33406 | `d0bd54f18fc9d5a4fd709d2cdd9185400ac162e8950d54f45443a8c8adee4948` |
| `docs/daemon.md` | 176 | 9663 | `7956af420e4334638b22a3e994c18d15d1495bbfdf5cc6fd19b37cb20f1a445f` |
| `docs/enforcement-model.md` | 266 | 14716 | `cb9a26f7f740e4430c209d1ff902128ea97c4a90f302f26d9e54adc385f26ad9` |
| `docs/faq.md` | 166 | 7813 | `5755679e358ff6525b6f3a0c213e42f4772c3a42d87ebed683839030c4af0ef6` |
| `docs/gates.md` | 426 | 18985 | `61f6ba2160959b985cddc4664bff6a410be3ab19cd7dd71f0aca0dde3c719efa` |
| `docs/getting-started.md` | 201 | 7560 | `430fca84bc40dd272df2cbc35b8f5d371c2c3235ff8a08f27645e296241ec360` |
| `docs/guardrails.md` | 111 | 6214 | `3849f0a3a2b576e864f28b8f74e94cae314dae844cd3d14b5a30eb09953c6f63` |
| `docs/per-agent-arms.md` | 149 | 6940 | `711eb139ce13eff2875d3c67ba4413cc756b68ca89fb5bd06bf80bccca55e3eb` |
| `docs/profiles.md` | 742 | 40860 | `a8be29451638fe9f78e786a9b39a0b86d89a0256ede36a5ca83fa2f622bc7171` |
| `docs/relay-v2.md` | 582 | 35622 | `4d210a91f52647325e14e0523a6c9a4d9a45a420bf5f2a827af957a07b32681d` |
| `docs/sdk.md` | 97 | 4681 | `0643dfff7f31e5a462f3d8735776712647d15467d20e20de61b41b3ae39516a8` |
| `docs/spec-library.md` | 125 | 6858 | `c3d528a3b3a47c0f2ee592a492954b33fcf3c7a8eeef91cb52a339f6ecd9c7af` |
| `docs/telemetry.md` | 171 | 9237 | `4a0dd40572465c3b3b600a865b11b144c195fdb766aa164c1cb5317de05325f1` |
| `docs/trace-corpus.md` | 52 | 2500 | `06ecf57e2a0932788a241634b06c1bce8dfdf2679e813db2a6b7ad9bb13606f4` |

## Verify

```bash
# from the relay/ root — recompute and compare to the table above
for f in README.md WHITEPAPER.md PRODUCT.md SPEC.md CONTRIBUTING.md CHANGELOG.md docs/*.md; do
  [ "$f" = docs/INDEX.md ] && continue
  shasum -a 256 "$f"
done
```
