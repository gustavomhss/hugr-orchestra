# HuGR Relay — Documentation Index (hashed)

Integrity manifest for the Relay documentation set. Each hash is SHA-256 of the file's bytes.
Regenerate after any documentation change (`bin/gen-doc-index.py`).

- **Generated:** 2026-06-01T14:53:39Z
- **Files:** 16
- **Root hash** (SHA-256 of the sorted `<sha256>  <path>` manifest): `17fed4266f98227c332597981cf3efe88ece40da07aab1701e629f0683e5a01e`

| File | Lines | Bytes | SHA-256 |
|---|---|---|---|
| `README.md` | 113 | 6983 | `89f93c5cd2c470f3bc06b65c4bc69a43c4a1b374297a7bf68657a3ea5d47c89f` |
| `WHITEPAPER.md` | 261 | 25552 | `4d53c105dfb17436f20999317023e8b27b8689c133943bc98af2a9b2dec0857f` |
| `PRODUCT.md` | 430 | 38450 | `0d399ea94e7885cfb88ecb4dc05e0ae18bbb6027415a37f38f105df6fe462541` |
| `SPEC.md` | 277 | 15347 | `0ada9d89f01c7f0102ade6318da3c96cc7dae232b4355fad86495c073b46e062` |
| `CONTRIBUTING.md` | 30 | 1557 | `0ec40378b3573adeea93cc3b6ca4c2e2a9e541c5e4ec9ee779dfac4d36cb672a` |
| `CHANGELOG.md` | 102 | 7631 | `546a131070d8a50a0c0a5238b2716eaa8bb339f00971775851bf54e11e0d348f` |
| `docs/architecture.md` | 266 | 13374 | `33bc3f4a592ad429d8afaa78edfdf917b8313d2dfc410af6d76908bc5a209d21` |
| `docs/authoring-sprints.md` | 246 | 12105 | `785dabbc1545c1b36789464d90df12c3a6a5f8f5046fac218e57ac5f620eb986` |
| `docs/auto-decompose.md` | 61 | 2959 | `a72e0d02d8c632035829644a18e18a6a337c96d0a46ddc89ae0bdb140f7b735e` |
| `docs/concepts.md` | 121 | 5309 | `cca3f0b80023fbe7d673ace6a25bdaeb54e4352268a5171ca0b096616451b2bc` |
| `docs/configuration.md` | 237 | 9484 | `085cbab8598bfe9ff5e2aec7629e25b7889b7ec7fc62d6dad7bf129a3dcbfd4e` |
| `docs/faq.md` | 166 | 7813 | `5755679e358ff6525b6f3a0c213e42f4772c3a42d87ebed683839030c4af0ef6` |
| `docs/gates.md` | 248 | 8699 | `fc0a16d2f8c735d66aeb6d1dce9186f3c591c278a801ac0b748f8cc8824c90bd` |
| `docs/getting-started.md` | 201 | 7560 | `430fca84bc40dd272df2cbc35b8f5d371c2c3235ff8a08f27645e296241ec360` |
| `docs/per-agent-arms.md` | 93 | 4472 | `f7fad9bc29e16f60a7f1798c081093145a6122709d2d31eca98dde28c61be42c` |
| `docs/trace-corpus.md` | 52 | 2500 | `06ecf57e2a0932788a241634b06c1bce8dfdf2679e813db2a6b7ad9bb13606f4` |

## Verify

```bash
# from the relay/ root — recompute and compare to the table above
for f in README.md WHITEPAPER.md PRODUCT.md SPEC.md CONTRIBUTING.md CHANGELOG.md docs/*.md; do
  [ "$f" = docs/INDEX.md ] && continue
  shasum -a 256 "$f"
done
```
