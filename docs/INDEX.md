# HuGR Relay — Documentation Index (hashed)

Integrity manifest for the Relay documentation set. Each hash is SHA-256 of the file's bytes.
Regenerate after any documentation change (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

- **Generated:** 2026-05-31T19:49:10Z
- **Files:** 13
- **Root hash** (SHA-256 of the sorted `<sha256>  <path>` manifest): `a18ffbbf5f3b5df29730dd69ddcc6bbcc6784d4af135fdc9904e7da5d88b0605`

| File | Lines | Bytes | SHA-256 |
|---|---|---|---|
| `README.md` | 113 | 6983 | `89f93c5cd2c470f3bc06b65c4bc69a43c4a1b374297a7bf68657a3ea5d47c89f` |
| `WHITEPAPER.md` | 260 | 25552 | `4d53c105dfb17436f20999317023e8b27b8689c133943bc98af2a9b2dec0857f` |
| `PRODUCT.md` | 429 | 38450 | `0d399ea94e7885cfb88ecb4dc05e0ae18bbb6027415a37f38f105df6fe462541` |
| `SPEC.md` | 256 | 13868 | `7c4b8b4a65ebfd0dbc1199fbf3a643f9fdb8dd9046a58b90a50d46a28a2ef889` |
| `CONTRIBUTING.md` | 30 | 1498 | `2f978b51720b084cd55d60bb38647c5c505cbe218d881f808f1c0dfb60300dba` |
| `CHANGELOG.md` | 71 | 5064 | `2ff99a81f927e59ed7cbdf463b5f144c3841f9a77eec96492866d994820dc89f` |
| `docs/concepts.md` | 121 | 5309 | `cca3f0b80023fbe7d673ace6a25bdaeb54e4352268a5171ca0b096616451b2bc` |
| `docs/getting-started.md` | 201 | 7560 | `430fca84bc40dd272df2cbc35b8f5d371c2c3235ff8a08f27645e296241ec360` |
| `docs/authoring-sprints.md` | 246 | 12105 | `785dabbc1545c1b36789464d90df12c3a6a5f8f5046fac218e57ac5f620eb986` |
| `docs/gates.md` | 248 | 8699 | `fc0a16d2f8c735d66aeb6d1dce9186f3c591c278a801ac0b748f8cc8824c90bd` |
| `docs/architecture.md` | 266 | 13374 | `33bc3f4a592ad429d8afaa78edfdf917b8313d2dfc410af6d76908bc5a209d21` |
| `docs/configuration.md` | 216 | 8271 | `8f84ee9f6322f06b9ce6ad768091f9d9866e631fd801dd886ee5be035df5da89` |
| `docs/faq.md` | 166 | 7813 | `5755679e358ff6525b6f3a0c213e42f4772c3a42d87ebed683839030c4af0ef6` |

## Verify

```bash
# from the relay/ root — recompute and compare to the table above
for f in README.md WHITEPAPER.md PRODUCT.md SPEC.md CONTRIBUTING.md CHANGELOG.md docs/*.md; do
  [ "$f" = docs/INDEX.md ] && continue
  shasum -a 256 "$f"
done
```
