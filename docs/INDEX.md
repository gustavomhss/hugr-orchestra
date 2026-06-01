# HuGR Relay — Documentation Index (hashed)

Integrity manifest for the Relay documentation set. Each hash is SHA-256 of the file's bytes.
Regenerate after any documentation change (`bin/gen-doc-index.py`).

- **Generated:** 2026-06-01T16:35:58Z
- **Files:** 18
- **Root hash** (SHA-256 of the sorted `<sha256>  <path>` manifest): `d6bde15513e5542a0ceb4f5ae403f0ceb514a146d22d2ae976e8158a5b569b05`

| File | Lines | Bytes | SHA-256 |
|---|---|---|---|
| `README.md` | 113 | 6983 | `89f93c5cd2c470f3bc06b65c4bc69a43c4a1b374297a7bf68657a3ea5d47c89f` |
| `WHITEPAPER.md` | 276 | 34262 | `ec73d23a11a2479fccfeba5755498075920547dd267f4331e0eb8cf10b228368` |
| `PRODUCT.md` | 452 | 41985 | `d506df7971338dc45d566c7afba9bdacc836a23b31066fd68a83e7a14b594d71` |
| `SPEC.md` | 298 | 17094 | `9f5a7e08d829b6054538cb4261981a7fc97d886ee3a305d3b698afad9de197e6` |
| `CONTRIBUTING.md` | 30 | 1557 | `0ec40378b3573adeea93cc3b6ca4c2e2a9e541c5e4ec9ee779dfac4d36cb672a` |
| `CHANGELOG.md` | 154 | 12071 | `9da254fd6047bb7e6d58a148f47d6d95b5dedd1196e18e3b166550c87d959b38` |
| `docs/architecture.md` | 266 | 13374 | `33bc3f4a592ad429d8afaa78edfdf917b8313d2dfc410af6d76908bc5a209d21` |
| `docs/authoring-sprints.md` | 246 | 12105 | `785dabbc1545c1b36789464d90df12c3a6a5f8f5046fac218e57ac5f620eb986` |
| `docs/auto-decompose.md` | 61 | 2959 | `a72e0d02d8c632035829644a18e18a6a337c96d0a46ddc89ae0bdb140f7b735e` |
| `docs/compaction.md` | 84 | 3781 | `63bbf7b052e31dcc90f3ba4864c83577f8a8a838fdc32ca1bf53eba8a1336b2b` |
| `docs/concepts.md` | 121 | 5309 | `cca3f0b80023fbe7d673ace6a25bdaeb54e4352268a5171ca0b096616451b2bc` |
| `docs/configuration.md` | 237 | 9484 | `085cbab8598bfe9ff5e2aec7629e25b7889b7ec7fc62d6dad7bf129a3dcbfd4e` |
| `docs/faq.md` | 166 | 7813 | `5755679e358ff6525b6f3a0c213e42f4772c3a42d87ebed683839030c4af0ef6` |
| `docs/gates.md` | 248 | 8699 | `fc0a16d2f8c735d66aeb6d1dce9186f3c591c278a801ac0b748f8cc8824c90bd` |
| `docs/getting-started.md` | 201 | 7560 | `430fca84bc40dd272df2cbc35b8f5d371c2c3235ff8a08f27645e296241ec360` |
| `docs/per-agent-arms.md` | 93 | 4472 | `f7fad9bc29e16f60a7f1798c081093145a6122709d2d31eca98dde28c61be42c` |
| `docs/sdk.md` | 66 | 3120 | `77213b84ad6b4143507cf245bccaab4a9d73ee2e8f65b74ee99a6261c5a7835b` |
| `docs/trace-corpus.md` | 52 | 2500 | `06ecf57e2a0932788a241634b06c1bce8dfdf2679e813db2a6b7ad9bb13606f4` |

## Verify

```bash
# from the relay/ root — recompute and compare to the table above
for f in README.md WHITEPAPER.md PRODUCT.md SPEC.md CONTRIBUTING.md CHANGELOG.md docs/*.md; do
  [ "$f" = docs/INDEX.md ] && continue
  shasum -a 256 "$f"
done
```
