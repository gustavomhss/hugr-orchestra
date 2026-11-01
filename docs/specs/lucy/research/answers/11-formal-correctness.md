# 11-formal-correctness

session ses_bfc4e0b8381f1af25199b75bb334725ea8ce1b8c90b51ece58b34d5d9fbb7f36

## Answer

**Conclusion.** A strong AI reviewer should work in layers. It can run cheap checks itself: types, exhaustive matching, assertions and property tests. It should ask for a design model (TLA+, P or Quint) only when a change touches concurrency, crash recovery or durable state that example tests cannot cover. It should not ask for full proof (Lean, Dafny, Verus) except for small, stable, high-stakes kernels. LLMs now write Dafny proofs well, but they are still weak at Lean and Verus proofs. This repo has no TLA+ or Lean 4 files. Property tests (fast-check) exist only in the Atlas module, and Atlas already documents a decision rule for when formal methods pay off.

**1. Model checking in industry**
- Azure Cosmos DB: a small TLA+ spec of what users can observe found two documentation issues, both since fixed, and offered a fix for an outage in a service that depends on Cosmos DB (read: arXiv 2210.13661).
- MongoDB: generating test cases from a TLA+ model worked for Realm Sync. Checking real server traces against an abstract spec did not (read: arXiv 2006.00915).
- Trace validation, which replays real execution traces through TLC to check them against the spec, found spec-vs-code mismatches in every program its authors tried (read: arXiv 2404.16075).
- Datadog: when the design gained a sequencer, re-running TLC found a NoLostMsg violation. Datadog also says models check the design, not the implementation, and are tedious to keep current (read: Datadog blog, 2024).
- AWS (P language, PObserve, S3 strong consistency): I saw this only in search snippets. The CACM and ACM Queue pages could not be fetched, so treat it as unverified.
- How a reviewer checks code against a spec: ask for (a) a log-to-spec trace check (TLC trace validation or PObserve), or (b) model-generated tests, or (c) ShardStore-style refinement: a reference model in the same language, reused as the test mock, plus conformance property tests.

**2. Proof tools and LLMs**
- The vericoding benchmark (Sept 2025, 12,504 specs) measured off-the-shelf LLM success at 82% in Dafny, 44% in Verus/Rust and 27% in Lean (read: arXiv 2509.22908).
- On VERINA, the best model (o3) proved only 4.9% of tasks on a single try, even though its code was 72.6% correct (read: arXiv 2505.23135).
- Kani is a bit-precise model checker for Rust. Harnesses use `kani::any()` to cover all input values, and it checks for panics and undefined behaviour (read: Kani README).
- What follows: an agent can reliably drive a proof assistant only when the tool's verdict is the oracle and the spec was written or reviewed by a human. A wrong spec gives a vacuous proof.

**3. Correctness by construction in this stack**
- `packages/core` already uses Effect branded IDs, for example `Schema.String.pipe(Schema.brand("AccountID"))` (read: code_search, `packages/core/src/account.ts:7`).
- A reviewer can demand: brands for every ID or unit kind, Schema-decoded refinements at boundaries, `Match.exhaustive` or `never` checks on unions, and invariant assertions that stay on (inferred).

**4. Simulation and testing**
- FoundationDB runs a whole cluster deterministically in one process. They estimate about one trillion CPU-hours of simulation (read: FoundationDB testing docs).
- TigerBeetle's VOPR stubs out clock, network and disk, and replays any failure from a seed plus the git commit. TigerBeetle calls assertions "a force multiplier" for this kind of testing (read: TigerBeetle VOPR docs).
- Cost: retrofitting deterministic simulation onto a Go service with three binaries was "challenging" at Datadog (read: Datadog blog). In short, it needs determinism designed in, or a deterministic hypervisor like Antithesis.
- KLEE and concolic execution (OSDI'08) generate high-coverage tests for C programs. They do not apply to TypeScript, and I captured only the paper's title page.

**5. Decision rule (inferred, matching Atlas `formal-decision`)**
- **Always run, any change:** type check, exhaustive matching, brand and refinement review, and invariant assertions.
- **Propose:** property tests or a reference-model test for any pure function, codec, merge, fold or ordering logic. Differential or metamorphic tests for parsers and rewrites.
- **Require:** a design model (TLA+, Quint or P, checked with TLC or Apalache) only when all three of Atlas's conditions hold: high consequence and hard to recover, combinatorial interleavings or crash orderings, and cheap to keep alive. Also require model-based or trace conformance tests when such a model already exists.
- **Rarely require:** deterministic simulation for consensus or durable storage cores, and proof in Dafny, Verus or Lean for small stable kernels.
- **What an LLM can drive reliably today:** property tests, Schema and type design, TLC runs on small models, Kani harnesses and Dafny proofs. Lean and Verus proofs on non-trivial code are not reliable yet.

**This repo**
- There are no `*.tla`, `*.lean`, `*.qnt`, `*.als` or `*.dfy` files: the search found no files with those extensions (ran: code_search).
- fast-check appears only under `modules/atlas` (about 30 test files, for example `modules/atlas/packages/kernel/test/merge-fold.test.ts:17`). It does not appear in `packages/`, `apps/`, `modules/maestro` or `modules/engine-adapters` (ran: code_search, 0 hits, coverage complete).
- Atlas's skill `modules/atlas/.claude/skills/formal-decision/SKILL.md` already encodes a three-part rule and a tool-per-problem-shape table (read).

**Not examined:** the AWS CACM 2015 and 2025 articles (fetch failed); full papers beyond their abstracts; Alloy, Quint, F*, Liquid Haskell, Creusot, Prusti and Z3/cvc5 documentation (not captured); Antithesis documentation.

**Reproduce the repo check:** `rg -l 'from "fast-check"' packages apps modules` and `git ls-files '*.tla' '*.lean'`.

## Claims

[
 {
  "proposition": "A small TLA+ spec of Cosmos DB's user-visible behavior led to two public documentation fixes.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_c8df4487d151a579d66842f4be",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3504026dd8a85979e0098c6af1",
      "revision": 1
     },
     "representation": "text",
     "digest": "d5661dfc836fe2f901bccbb79dda4d57ea35b4bc32cfdffa0f5c691eaa7d5734"
    },
    "quote": "Using this model, we were able to raise two key issues in Cosmos DB's public-facing documentation, which have since been addressed."
   }
  ]
 },
 {
  "proposition": "At MongoDB, model-based test-case generation from TLA+ succeeded for Realm Sync while trace-checking the Server against an abstract spec was impractical.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_c8df4487d151a579d66842f4be",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a5318b452bcf1e70fea2fad952",
      "revision": 1
     },
     "representation": "text",
     "digest": "5ea4f35ef85f74d0474f248369b55d4a42c58ee16191137a4c942105b63e19ea"
    },
    "quote": "We found MBTC to be impractical for testing that the Server conformed to a highly abstract specification. MBTCG was highly successful for Realm Sync, however."
   }
  ]
 },
 {
  "proposition": "TLA+ trace validation with TLC detected spec-implementation discrepancies in every distributed program it was applied to.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_c8df4487d151a579d66842f4be",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_72193e0e96042d5842350a8879",
      "revision": 1
     },
     "representation": "text",
     "digest": "5a3a3eced513a4793d1b645db3c8b43e6d86a0512f50d7842007f2aba5ca6162"
    },
    "quote": "We have applied our approach to several distributed programs, detecting discrepancies between the specifications and the implementations in all cases."
   }
  ]
 },
 {
  "proposition": "Datadog's TLC re-run after a design change found a NoLostMsg violation, and Datadog notes models validate design, not implementation.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_c8df4487d151a579d66842f4be",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_629824ffde3e25208a36cfbc2d",
      "revision": 1
     },
     "representation": "text",
     "digest": "d55e1e9de03771d9d10eb62afbc0724b55affbbe7cfd82b8d784711825d847a5"
    },
    "quote": "When we re-ran model checking, TLC found a case where the NoLostMsg property failed."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_629824ffde3e25208a36cfbc2d",
      "revision": 1
     },
     "representation": "text",
     "digest": "d55e1e9de03771d9d10eb62afbc0724b55affbbe7cfd82b8d784711825d847a5"
    },
    "quote": "While modeling and lightweight simulation can validate the design of a system, they do not validate its implementation."
   }
  ]
 },
 {
  "proposition": "Off-the-shelf LLM vericoding succeeds 82% in Dafny, 44% in Verus/Rust and 27% in Lean.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_2904e3361ff80db8f9c120dbbb",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d1747f97f0f8974c71041a118f",
      "revision": 1
     },
     "representation": "text",
     "digest": "307d6c754dc5ba0445663422226a98d2c75889194e083c478ffc0a91029d8331"
    },
    "quote": "We find vericoding success rates of 27% in Lean, 44% in Verus/Rust and 82% in Dafny using off-the-shelf LLMs."
   }
  ]
 },
 {
  "proposition": "On VERINA (Lean), proof generation is the weakest part of verifiable code generation for state-of-the-art LLMs.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_2904e3361ff80db8f9c120dbbb",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_7f111c0367417c3eb206ceca44",
      "revision": 1
     },
     "representation": "text",
     "digest": "87ee4307c805fd54e9a9790d135cfd66df1c343613ad8d6a529e4e2eb235a664"
    },
    "quote": "Our extensive evaluation of state-of-the-art LLMs reveals significant challenges in verifiable code generation, especially in proof generation"
   }
  ]
 },
 {
  "proposition": "Kani checks Rust harnesses over all valid inputs for spec violations and panics.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_2904e3361ff80db8f9c120dbbb",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_fd52876f48041089d9991a1a07",
      "revision": 1
     },
     "representation": "text",
     "digest": "6e4a517a521ed4eb648f4f47176e7d2d6f242144dd4b6028832e3cbdd7e19fa8"
    },
    "quote": "Kani will try to prove that all valid inputs produce outputs that satisfy the specification, without panicking or exhibiting unexpected behavior."
   }
  ]
 },
 {
  "proposition": "packages/core already uses Effect Schema branded types for IDs, so brand/refinement review applies directly in this stack.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_32e81e4354abf5281b885293d5",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_bf1c9c4ac2d764dba39dead697",
      "revision": 1
     },
     "representation": "text",
     "digest": "d2c53b97fb300562328f4bfdf2738d83609c2ee6c6e1ff077aa2ada6798e9d71"
    },
    "quote": "packages/core/src/account.ts:7: export const ID = Schema.String.pipe(Schema.brand(\"AccountID\"))"
   }
  ]
 },
 {
  "proposition": "FoundationDB's deterministic simulation runs whole clusters in one process at an estimated trillion CPU-hours.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_300a2b6a3a505d7688b8036efd",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_e2fb1701253dd4f643089b401b",
      "revision": 1
     },
     "representation": "text",
     "digest": "17167ef4cdc52a29eafe65b59e3ffef6321c98e44f02a5289486ae6e43a03a64"
    },
    "quote": "we estimate that we have run the equivalent of roughly one trillion CPU-hours of simulation on FoundationDB."
   }
  ]
 },
 {
  "proposition": "TigerBeetle's VOPR pairs deterministic simulation with always-on assertions.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_300a2b6a3a505d7688b8036efd",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d09a4a38ec66c922b4e9707b73",
      "revision": 1
     },
     "representation": "text",
     "digest": "9d5b6889e62cc159659b6efa6346d65e8a2b0bd0c390e94356ed8400bd12de69"
    },
    "quote": "Assertions are a force multiplier when used with simulation testing and fuzzing."
   }
  ]
 },
 {
  "proposition": "Retrofitting deterministic simulation onto an existing non-deterministic service is costly.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_300a2b6a3a505d7688b8036efd",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_629824ffde3e25208a36cfbc2d",
      "revision": 1
     },
     "representation": "text",
     "digest": "d55e1e9de03771d9d10eb62afbc0724b55affbbe7cfd82b8d784711825d847a5"
    },
    "quote": "Applying deterministic simulation techniques to Courier has been challenging."
   }
  ]
 },
 {
  "proposition": "The repo's Atlas formal-decision skill gates formal models behind a three-conjunct rule and defaults most invariants to reference model plus PBT, with conformance sampled not proven.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_0f070980d7304cac2be6783b86",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_81bf615d1c6533cb95505d7fa4",
      "revision": 1
     },
     "representation": "text",
     "digest": "2a2b09cee4fb6c659adae454ac44cfdc503ef7f6f01870243b81d360ca3611d2"
    },
    "quote": "## The decision rule — a cluster earns a formal model only if ALL THREE hold"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_81bf615d1c6533cb95505d7fa4",
      "revision": 1
     },
     "representation": "text",
     "digest": "2a2b09cee4fb6c659adae454ac44cfdc503ef7f6f01870243b81d360ca3611d2"
    },
    "quote": "conformance testing is **sampled, not proven**"
   }
  ]
 },
 {
  "proposition": "A risk-tiered rule follows: always-run types/exhaustiveness/assertions, propose PBT/differential tests, require design models only for high-consequence combinatorial state, and reserve proofs and DST for small critical kernels; LLMs drive PBT, TLC, Kani and Dafny reliably but not Lean/Verus proofs.",
  "nature": "inference",
  "subquestion": {
   "id": "rque_0f070980d7304cac2be6783b86",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_81bf615d1c6533cb95505d7fa4",
      "revision": 1
     },
     "representation": "text",
     "digest": "2a2b09cee4fb6c659adae454ac44cfdc503ef7f6f01870243b81d360ca3611d2"
    },
    "quote": "**Most invariants fail #2** → they get an executable reference model + property-based testing, not a formal"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_d1747f97f0f8974c71041a118f",
      "revision": 1
     },
     "representation": "text",
     "digest": "307d6c754dc5ba0445663422226a98d2c75889194e083c478ffc0a91029d8331"
    },
    "quote": "We find vericoding success rates of 27% in Lean, 44% in Verus/Rust and 82% in Dafny using off-the-shelf LLMs."
   }
  ]
 },
 {
  "proposition": "fast-check property tests exist only in modules/atlas; packages, apps, maestro and engine-adapters TypeScript has none.",
  "nature": "observation",
  "scope": "universal",
  "subquestion": {
   "id": "rque_9328f737593aa657221d723752",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d2b2e3600c65dc76b25703a8fd",
      "revision": 1
     },
     "representation": "text",
     "digest": "3d7991d870d8d8640e22f022fde133cfa88f1defc453e14acff900bc63977ef0"
    },
    "quote": "modules/atlas/packages/kernel/test/merge-fold.test.ts:17: import fc from \"fast-check\""
   },
   {
    "source": {
     "artifact": {
      "id": "cart_f7ba7a8be03a903b172f170ded",
      "revision": 1
     },
     "representation": "text",
     "digest": "9532e0d20d04a40288876551deb2c98be19663902cd12379faf4eec065f816c7"
    },
    "quote": "0 hit(s)"
   }
  ]
 },
 {
  "proposition": "Atlas property tests assert algebraic laws (commutative, associative, idempotent, convergent) rather than pinned outputs.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_9328f737593aa657221d723752",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_4b0cdda535e8ede1fcc3a66136",
      "revision": 1
     },
     "representation": "text",
     "digest": "15e6802e5d45a74c81ed0281a44641e4c49ff4705bcbcbecfe9b3939068364fc"
    },
    "quote": "assertions are RELATIONAL / law-level (commutative · associative · idempotent · convergent ·"
   }
  ]
 },
 {
  "proposition": "No TLA+, Lean, Quint, Alloy or Dafny source files exist in the working tree.",
  "nature": "observation",
  "scope": "universal",
  "subquestion": {
   "id": "rque_9328f737593aa657221d723752",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_699108962bc8b95e8033c19b9e",
      "revision": 1
     },
     "representation": "text",
     "digest": "f7f38fa5cb374afb2a43504b42af65bd6968969055dffb42f6f3b9e9872a0774"
    },
    "quote": "0 hit(s)"
   }
  ]
 }
]
