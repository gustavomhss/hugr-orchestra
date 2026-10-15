# R45 — supplied binary grammar/schema → backend code

Research date: 2026-10-03. **Verdict: useful, conditional niche; no new mandatory codec platform.** Rank by work removed after format and backend stack already chosen, not by benchmark claims.

## The backend specialist boundary

- Upstream supplies exact grammar/schema plus imports, protocol semantics, framing/packing, language/tool/runtime versions, authorized output/handler files, resource limits, fixtures and check commands. The backend specialist generates and integrates within that contract.
- Format migration, protocol discovery, reverse-engineering, schema inference and architecture selection remain upstream decisions. Unsupported supplied feature/version needs upstream resolution, not silent format substitution.
- No project-specific schema or fixture corpus supplied here. Vendor specimens below stand in for concrete handoffs; full linked schemas are inputs, not reconstructed designs. Cases describe expected outcomes from source review, not executed results.
- Evidence: primary docs, release/package metadata, tagged source and published generated output. Commands documented only; no installs, generators, services, tests or downloaded-code execution performed.

| Rank | Mechanism | Real backend work removed | Applicability |
|---|---|---|---|
| 1 | Kaitai Struct: supplied byte-layout grammar → parser; selected targets also writer | Endian/bit reads, offsets, nested records, repeated fields, grammar assertions | Frozen external/custom binary layout already described by `.ksy` |
| 2 | FlatBuffers: supplied `.fbs` → builders, buffer accessors, structural verifier | Table layout, offset arithmetic, serialization construction and known-field verification | Input/output already FlatBuffers |
| 3 | Cap’n Proto: supplied `.capnp` → Reader/Builder accessors over segmented messages | Field layout, pointer access, defaults, message building and runtime serialization | Existing Cap’n Proto contract; strongest evidence for C++ |

These mechanisms are not interchangeable encodings. Ranks 2–3 cannot implement arbitrary existing byte layouts by merely translating their schemas.

## 1. Kaitai Struct — strongest fit for frozen binary layouts

**Exact specimen:** `user_types.ksy`, copied from official serialization guide’s “User-defined types” example [K2]:

```yaml
meta:
  id: user_types
  endian: le
seq:
  - id: one
    type: chunk
types:
  chunk:
    seq:
      - id: len_body
        type: u4
      - id: body
        size: len_body
```

```sh
kaitai-struct-compiler --read-write --no-auto-read -t python user_types.ksy
```

- **Produced:** `user_types.py`; `UserTypes`, nested `Chunk`, `_read`, `_check`, `_write`, fields `one.len_body`/`one.body`. Runtime supplies stream primitives. Read-write mode requires explicit `_read()`; constructors do not parse automatically. Read-only generation omits `--read-write --no-auto-read` [K2].
- **Actual output inspected:** guide includes generated `UserTypes._check` parent/root checks; published RTP Python parser shows generated bit reads, integer reads, conditional records and seek-backed lazy properties [K2], [K4]. Compiler replaces cursor/layout plumbing, not domain interpretation.
- **Remaining code:** obtain bounded frame/file; map parse errors; apply supplied semantic/CRC rules; dispatch handler. For writing, populate lengths and parent/root links, call `_check()` on every modified object, then `_write()` on root with correctly sized stream. `_check()` is not recursive; some stream-dependent checks occur only while writing. Lengths/offsets and cached-instance invalidation still need caller care [K2].
- **Version/languages/license:** current compiler release **0.11**, 2025-09-07. JVM compiler needs Java 8+; parses into C++/C#/Go/Java/JS/Lua/Nim/Perl/PHP/Python/Ruby, with entry-level Rust support. Writing introduced in 0.11 for **Java and Python only**. Python runtime 0.11 metadata supports Python 3.4+ and legacy 2.7; retain supplied supported stack pin. Compiler GPL-3.0-or-later; Python/most runtimes MIT, JS runtime Apache-2.0. Compiler license explicitly excludes supplied schemas/generated output; imported format licenses remain separate [K1], [K2], [K3], [K5], [K7].
- **Bounds/evolution:** `contents`/`valid` enforce declared constraints; bare `u4` length provides no application quota. Python 0.11 `read_bytes` checks exact length and raises `EndOfStreamError`; large reads on seekable streams first check remaining bytes. This is not a cap on valid large bodies, repeat counts, decompression or nesting. Substreams can copy bytes. Format evolution must already be expressed by supplied version/switch/size rules; no automatic compatibility guarantee [K2], [K6].
- **Case contract:** valid `02 00 00 00 68 69` → length 2, body `b"hi"`; writer should reproduce these bytes. Truncated `02 00 00 00 68` → `EndOfStreamError`. Adversarial `ff ff ff ff 68 69` → declared-length mismatch; on bounded seekable input, runtime rejects before huge read. Valid bytes plus `00` still permit parsing first record: caller enforces supplied single-frame/trailing-byte policy. A body containing forbidden business content remains structurally valid.
- **Maturity:** established parser ecosystem; official site names mitmproxy, Kismet and OWASP ZAP users. Writer feature is newer and target-limited; do not transfer parser maturity to every serializer/backend [K1], [K2].

## 2. FlatBuffers — strongest prechosen-format builder/verifier path

**Exact specimen:** complete tagged [`samples/monster.fbs`][F2], including `MyGame.Sample`, `Color`, `Equipment`, `Vec3`, `Monster`, `Weapon`, deprecated `friendly`, defaults and `root_type Monster`.

```sh
flatc --cpp monster.fbs
```

- **Produced:** `monster_generated.h`, `GetMonster`, field accessors, `MonsterBuilder`/`CreateMonster`, `FinishMonsterBuffer`, `VerifyMonsterBuffer`; relies on FlatBuffers headers. Published generated counterpart inspected; it additionally contains optional object/mutation helpers, so this minimal command is not claimed to reproduce its entire checked-in text [F3].
- **Remaining code:** bound and assemble supplied transport frame; construct strings/vectors before parent tables; finish root; send builder bytes. On untrusted C++ input, invoke `VerifyMonsterBuffer(flatbuffers::Verifier&)` and check result **before** `GetMonster`; retain buffer lifetime and prevent mutation after verification. Then apply domain policy and dispatch. Optional size-prefixed framing must match upstream wire contract [F4], [F5].
- **Version/languages/license:** GitHub latest-release metadata reports **v25.12.19-2026-02-06-03fffb2**, published 2026-02-06, non-prerelease; generated version assertion is **25.12.19**. Pin exact compiler/runtime pair, not “latest.” Tagged build defaults to C++11; project Apache-2.0. Also supports Rust, Go, Java/Kotlin, C#, Python, JS/TS and others; features/verifiers differ by target [F1], [F3], [F9], [F11].
- **Verifier limits:** C++ checks offsets, field extents, alignment, vectors and string termination for known schema paths. Defaults: depth 64, table visits 1,000,000; tune to supplied limits. Bound total input before constructing verifier; constructor’s max-size assertion is not application-level rejection handling. Verification does not prove scalar ranges, enum membership, business validity or arbitrary unknown-field contents. Actual generated `VerifyEquipment` has `default: return true` for unknown discriminants; handler must honor supplied unknown-variant policy [F3], [F5].
- **Evolution:** append table fields or preserve explicit IDs; deprecate rather than remove; retain defaults, types and union discriminants; existing struct layout is fixed. Documented check: `flatc --conform old.fbs new.fbs`. This checks supported schema-evolution rules, not business compatibility or peer deployment readiness [F6].
- **Case contract:** supplied valid binary matching official sample → `hp=80`, `mana=150`, `name="MyMonster"`, equipped Axe damage 5. Keep first 3 bytes → verifier rejects missing root offset; replace bytes 0–3 with `ff ff ff ff` → invalid root offset rejected. A correctly built `hp=-1` buffer remains structurally valid: supplied domain rule must decide acceptance. Read/write round trips compare values unless upstream requires particular golden bytes; equivalent FlatBuffers can have different physical layouts [F3], [F5], [F10].
- **Maturity/value:** mature C++ implementation, concrete production format in TensorFlow Lite’s `schema.fbs` with `TFL3` identifier [F8]. Buffer-backed access avoids mandatory object-tree unpacking; I/O, building, verification and optional `UnPack` still cost work/copies. No blanket end-to-end “zero copy.”
- **Documentation trap:** support matrix says Rust verifier “No,” but tagged Rust `root`/`root_with_opts` actually invoke verification; `_unchecked` skips it. Prefer target source over stale matrix, without claiming verifier perfection [F7], [F12].

## 3. Cap’n Proto — checked pointer access for existing segmented format

**Exact specimen:** complete v1.5.0 [`c++/samples/addressbook.capnp`][C3], file ID `0x9eb32e19f86ee174`, C++ namespace annotation, `Person` fields/union and `AddressBook.people` intact.

```sh
capnp compile -oc++ addressbook.capnp
```

- **Produced:** `addressbook.capnp.h` and `addressbook.capnp.c++`; `addressbook::AddressBook::Reader/Builder`, `Person::Reader/Builder`, getters/setters/init methods and schema data. Link `libcapnp` + `libkj`. Generated `schema.capnp.h` inspected as concrete output fixture: version guard `1005000`, scalar reads, pointer helpers and setters; sample application demonstrates corresponding AddressBook API [C4], [C5], [C8].
- **Remaining code:** create `MallocMessageBuilder`, initialize root/people and populate fields; use supplied packed/unpacked reader/writer pair. Runtime supplies standard segment framing; application still owns transport buffering, partial-read/error handling, byte quotas, buffer/reader lifetimes, semantic checks and handlers. RPC is separate and not needed merely to serialize [C2], [C8].
- **Version/languages/license:** official install page and tag identify **1.5.0**; tagged CMake requires C++14. Install docs specify GCC 7+, Clang 6+, VS2019+. MIT. Generated header requires matching compiler/library version. Rust/Go/Java/C#/Python/JS implementations have independent maintainers, versions and feature coverage; C++ claims do not automatically transfer [C1], [C4], [C9], [C10].
- **Bounds/verifier model:** checked readers validate pointers when traversed; obtaining root is not whole-message validation. Default `ReaderOptions`: nesting 64; traversal 8×1024×1024 words (64 MiB), charging repeated dereferences too. Traversal budget is not transport/input-size quota. Traverse all fields needed by supplied validation before side effects; handle errors for whole operation. Unchecked reading/builder views of untrusted memory bypass these guarantees [C2], [C5].
- **Evolution:** preserve IDs, ordinals, types and defaults; add higher-numbered fields. Missing fields read defaults; unknown enum/union values need explicit caller handling. Copying a newer struct into preallocated struct-list elements can drop unknown fields (`setWithCaveats`). These are wire rules, not semantic validation [C2], [C7].
- **Case contract:** supplied valid AddressBook fixture containing Alice → ID 123, name Alice, email `alice@example.com`. For a supplied **unpacked, single-segment** buffer, retain only its 8-byte segment table → missing segment rejected; overwrite bytes 4–7 (segment word count) with `ff ff ff ff` → bounded `FlatArrayMessageReader` rejects premature end. Cases assume exceptions enabled and handler maps `kj::Exception` to rejection; no-exceptions fallback values are not proof of validity. Empty input is treated as empty message by this reader, so supplied framing must reject it when prohibited. Out-of-bounds child pointer fails when followed. Empty/malformed email remains structurally representable [C2], [C5], [C6], [C8].
- **Maturity/value:** established production use at Cloudflare, documented by project author/Workers lead [C11]. Unpacked, aligned, live buffers support direct access; packing/unpacking, network I/O and builder deep copies prevent blanket “zero-copy” claims. C++ guide still contains obsolete C++11/security-review prose; tagged build and later project statements supersede those passages [C1], [C2], [C9], [C11].

## Researched reserves and exclusions

| Candidate | Concrete mechanism, versions and disposition |
|---|---|
| **Bebop — niche reserve** | Supplied `.bop` → `bebopc --include person.bop build --generator ts:person.ts` → TS records plus encode/decode; e.g. official `struct Person { string name; uint32 age; }`. Compiler **3.2.3**, 2025-09-16; Apache-2.0. C#/TS/Rust/C++/Go/Python/Dart targets advertised; TS runtime manifest at that compiler tag still says 2.0.2, so pin runtime separately. Messages support new indexed fields; structs freeze ordered layout. TS generator skips remaining message on unknown field. Reviewed runtime `readBytes()` advances to declared end then uses clamping `subarray`; this routine alone does not establish truncated-input rejection. Source-level finding, not reproduced exploit. Fixtures/tests establish real development activity; inspected sources provide weaker production evidence than selected formats. Useful when already mandated, not reason to migrate [B1], [B2], [B3], [B4], [B5], [B6], [B7], [B8]. |
| **pest — text grammar niche** | `.pest` + `#[derive(Parser)]` → Cargo proc-macro codegen → `Rule`, `Parser::parse`, nested `Pairs`; AST conversion/semantic actions remain caller code. **2.9.2**, 2026-09-21; Rust ≥1.83; MIT OR Apache-2.0. API accepts UTF-8 `&str`, not arbitrary byte slices. Full-input grammar needs SOI/EOI; parse success may otherwise mean matched prefix. Real users include Tera/Vector per project README. Strong for supplied text DSL, not binary layout/writer generation [P1], [P2], [P3], [P4]. |
| **LALRPOP — supplied token/CFG niche** | `.lalrpop` → `lalrpop grammar.lalrpop` → `grammar.rs`, or approved build script `lalrpop::process_src()` → `OUT_DIR`; typed parser/actions, LR(1) by default. **0.23.1**, 2026-09-17; Rust ≥1.86; Apache-2.0 OR MIT. Custom lexer can yield `Result<(Loc, Tok, Loc), Error>` from binary-derived tokens, so not categorically text-only. Byte extraction/endian rules, length framing, semantic validation and serialization still need supplied code/design. RustPython/Solang use demonstrates parser maturity, not automatic codec generation [L1], [L2], [L3], [L4]. |
| **quicktype schema mode — adjacent, not binary** | Supplied JSON Schema → `quicktype -s schema schema.json -l typescript -o models.ts` → models/JSON converters. Current npm **26.0.0**, Node ≥20.19.0, Apache-2.0; broad language support. Useful with already chosen JSON; sample-based schema inference outside the backend specialist remit. Generated converter checks are target-specific, not evidence of complete JSON Schema/business validation. Adds little distinct binary-frontier value [Q1], [Q2]. |

## Handoff value and required evidence for an actual implementation

- Deliver generated parser/accessor/builder files plus small framing/domain adapters in supplied allowlist. Preserve schema as source of truth; hand-editing generated output loses reproducibility.
- Owner-supplied checks should exercise valid golden input, truncated framing/body, hostile lengths/offsets/depth, structural-but-semantic invalidity, trailing bytes, and relevant old/new schema pairs. Assert designated failure boundary and bounded resource behavior, not merely “did not crash.”
- Confirm actual target codec calls in handler path, compiler/runtime compatibility and output serialization interoperability. Round trip alone can hide matching encoder/decoder bugs; independent supplied golden bytes matter when byte identity is contractual.
- **Recommendation:** activate whichever matching mechanism upstream already chose. Value is removing repetitive layout/codec code; framing, domain policy and format ownership stay explicit.

## Primary sources inspected

- Kaitai: [overview/license matrix][K1], [serialization and exact specimen][K2], [release][K3], [generated parser][K4], [compiler license][K5], [runtime bounds][K6], [Python support][K7].
- FlatBuffers: [release][F1], [schema][F2], [generated header][F3], [C++ integration][F4], [verifier][F5], [evolution][F6], [Rust source][F7], [production schema][F8], [C++ version][F9], [sample values][F10], [license/languages][F11], [support matrix][F12].
- Cap’n Proto: [release/install/license][C1], [integration/limits][C2], [schema][C3], [generated header][C4], [reader limits][C5], [framing bounds][C6], [evolution][C7], [sample][C8], [C++ version][C9], [other languages][C10], [production maturity][C11].
- Reserves: [Bebop release][B1], [TS guide][B2], [CLI][B3], [byte reader][B4], [generator][B5], [runtime version][B6], [license][B7], [struct evolution][B8]; [pest metadata][P1], [API][P2], [users][P3], [full-input grammar][P4]; [LALRPOP release/users][L1], [Rust version][L2], [codegen][L3], [custom lexer][L4]; [quicktype schema mode][Q1], [package metadata][Q2].

[K1]: https://kaitai.io/
[K2]: https://doc.kaitai.io/serialization.html
[K3]: https://github.com/kaitai-io/kaitai_struct_compiler/releases/tag/0.11
[K4]: https://formats.kaitai.io/rtp_packet/src/python/rtp_packet.py
[K5]: https://github.com/kaitai-io/kaitai_struct_compiler/blob/0.11/README.md#licensing
[K6]: https://github.com/kaitai-io/kaitai_struct_python_runtime/blob/v0.11/kaitaistruct.py#L388-L429
[K7]: https://github.com/kaitai-io/kaitai_struct_python_runtime/blob/v0.11/setup.cfg
[F1]: https://github.com/google/flatbuffers/releases/tag/v25.12.19-2026-02-06-03fffb2
[F2]: https://github.com/google/flatbuffers/blob/v25.12.19-2026-02-06-03fffb2/samples/monster.fbs
[F3]: https://github.com/google/flatbuffers/blob/v25.12.19-2026-02-06-03fffb2/samples/monster_generated.h
[F4]: https://flatbuffers.dev/languages/cpp/
[F5]: https://github.com/google/flatbuffers/blob/v25.12.19-2026-02-06-03fffb2/include/flatbuffers/verifier.h
[F6]: https://flatbuffers.dev/evolution/
[F7]: https://github.com/google/flatbuffers/blob/v25.12.19-2026-02-06-03fffb2/rust/flatbuffers/src/get_root.rs
[F8]: https://github.com/tensorflow/tensorflow/blob/master/tensorflow/compiler/mlir/lite/schema/schema.fbs
[F9]: https://github.com/google/flatbuffers/blob/v25.12.19-2026-02-06-03fffb2/CMakeLists.txt#L61-L63
[F10]: https://github.com/google/flatbuffers/blob/v25.12.19-2026-02-06-03fffb2/samples/sample_binary.cpp
[F11]: https://github.com/google/flatbuffers/blob/v25.12.19-2026-02-06-03fffb2/README.md
[F12]: https://flatbuffers.dev/support/
[C1]: https://capnproto.org/install.html
[C2]: https://capnproto.org/cxx.html
[C3]: https://github.com/capnproto/capnproto/blob/v1.5.0/c++/samples/addressbook.capnp
[C4]: https://github.com/capnproto/capnproto/blob/v1.5.0/c++/src/capnp/schema.capnp.h
[C5]: https://github.com/capnproto/capnproto/blob/v1.5.0/c++/src/capnp/message.h
[C6]: https://github.com/capnproto/capnproto/blob/v1.5.0/c++/src/capnp/serialize.c++
[C7]: https://capnproto.org/language.html#evolving-your-protocol
[C8]: https://github.com/capnproto/capnproto/blob/v1.5.0/c++/samples/addressbook.c++
[C9]: https://github.com/capnproto/capnproto/blob/v1.5.0/c++/CMakeLists.txt
[C10]: https://capnproto.org/otherlang.html
[C11]: https://capnproto.org/news/2023-07-28-capnproto-1.0.html
[B1]: https://github.com/6over3/bebop/releases/tag/v3.2.3
[B2]: https://docs.bebop.sh/guide/getting-started-typescript/
[B3]: https://github.com/6over3/bebop/blob/v3.2.3/Laboratory/TypeScript/compile-schemas.sh
[B4]: https://github.com/6over3/bebop/blob/v3.2.3/Runtime/TypeScript/index.ts#L164-L173
[B5]: https://github.com/6over3/bebop/blob/v3.2.3/Core/Generators/TypeScript/TypeScriptGenerator.cs
[B6]: https://github.com/6over3/bebop/blob/v3.2.3/Runtime/TypeScript/package.json
[B7]: https://github.com/6over3/bebop/blob/v3.2.3/LICENSE.TXT
[B8]: https://docs.bebop.sh/reference/struct/
[P1]: https://github.com/pest-parser/pest/blob/v2.9.2/pest/Cargo.toml
[P2]: https://docs.rs/pest/2.9.2/pest/trait.Parser.html
[P3]: https://github.com/pest-parser/pest/blob/master/README.md
[P4]: https://github.com/pest-parser/book/blob/master/src/grammars/syntax.md#start-and-end-of-input
[L1]: https://docs.rs/lalrpop/0.23.1/lalrpop/
[L2]: https://github.com/lalrpop/lalrpop/blob/0.23.1/Cargo.toml
[L3]: https://lalrpop.github.io/lalrpop/quick_start_guide.html
[L4]: https://lalrpop.github.io/lalrpop/lexer_tutorial/003_writing_custom_lexer.html
[Q1]: https://github.com/glideapps/quicktype#generating-code-from-json-schema
[Q2]: https://registry.npmjs.org/quicktype/latest
