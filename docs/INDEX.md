# HuGR Relay — Documentation Index (hashed)

Integrity manifest for the Relay documentation set. Each hash is SHA-256 of the file's bytes.
Regenerate after any documentation change (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

- **Generated:** 2026-05-31T19:39:06Z
- **Files:** 13
- **Root hash** (SHA-256 of the sorted `<sha256>  <path>` manifest): `d4625180c552e1887f61b6d15d33cccd071982cfba4de36cdf54d2d27eb5ffa0`

| File | Lines | Bytes | SHA-256 |
|---|---|---|---|
| `README.md` | 105 | 6652 | `99909662c8eab23209c697d8c9ac2e578982c5f5617d791021a6416d4c26c017` |
| `WHITEPAPER.md` | 260 | 25552 | `4d53c105dfb17436f20999317023e8b27b8689c133943bc98af2a9b2dec0857f` |
| `PRODUCT.md` | 429 | 38450 | `0d399ea94e7885cfb88ecb4dc05e0ae18bbb6027415a37f38f105df6fe462541` |
| `SPEC.md` | 237 | 12485 | `169ba7671d79c88fc7365e8c08315496c2ec284fdd9327f61d97ffa592abe983` |
| `CONTRIBUTING.md` | 30 | 1498 | `2f978b51720b084cd55d60bb38647c5c505cbe218d881f808f1c0dfb60300dba` |
| `CHANGELOG.md` | 54 | 3697 | `d78f6e9622acda98a647503c17ed21455286d15acc8b7c96eada3da9a4c7184c` |
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
