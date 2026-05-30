# HuGR Relay — Documentation Index (hashed)

Integrity manifest for the Relay documentation set. Each hash is SHA-256 of the file's bytes.
Regenerate after any documentation change (see [CONTRIBUTING.md](../CONTRIBUTING.md)).

- **Generated:** 2026-05-30T17:51:43Z
- **Files:** 12
- **Root hash** (SHA-256 of the sorted `<sha256>  <path>` manifest): `e753e747a436da8808d3c9161c01f037591813e1985f4afa67bd62fe4836c87d`

| File | Lines | Bytes | SHA-256 |
|---|---|---|---|
| `README.md` | 59 | 3517 | `0cc04f331f6e62ce21a7bf1a1ece581b7634ae7ebbedcf5bc4d1b710fdf6c0e0` |
| `WHITEPAPER.md` | 203 | 10270 | `cceb9470f6c1e26ff27a06055ddb2388c910d13ac71535c695cfa2a757871ea3` |
| `SPEC.md` | 188 | 9455 | `7964e25027ba3ceab1d67093511e99d503ce34826795fc08b463ec82880ae047` |
| `CONTRIBUTING.md` | 30 | 1498 | `2f978b51720b084cd55d60bb38647c5c505cbe218d881f808f1c0dfb60300dba` |
| `CHANGELOG.md` | 23 | 1078 | `3bd98c586ce38f9449c0b50e4eb4b4663e9bb66fb66abf800113580c52514485` |
| `docs/concepts.md` | 121 | 5309 | `cca3f0b80023fbe7d673ace6a25bdaeb54e4352268a5171ca0b096616451b2bc` |
| `docs/getting-started.md` | 201 | 7560 | `430fca84bc40dd272df2cbc35b8f5d371c2c3235ff8a08f27645e296241ec360` |
| `docs/authoring-sprints.md` | 246 | 12105 | `785dabbc1545c1b36789464d90df12c3a6a5f8f5046fac218e57ac5f620eb986` |
| `docs/gates.md` | 248 | 8699 | `fc0a16d2f8c735d66aeb6d1dce9186f3c591c278a801ac0b748f8cc8824c90bd` |
| `docs/architecture.md` | 260 | 12673 | `7e607d5ea49ba56f68f3468a37cad6807d556497fb2bb75b1fef08b59e6dcd89` |
| `docs/configuration.md` | 216 | 8271 | `8f84ee9f6322f06b9ce6ad768091f9d9866e631fd801dd886ee5be035df5da89` |
| `docs/faq.md` | 166 | 7813 | `5755679e358ff6525b6f3a0c213e42f4772c3a42d87ebed683839030c4af0ef6` |

## Verify

```bash
# from the relay/ root — recompute and compare to the table above
for f in README.md WHITEPAPER.md SPEC.md CONTRIBUTING.md CHANGELOG.md docs/*.md; do
  [ "$f" = docs/INDEX.md ] && continue
  shasum -a 256 "$f"
done
```
