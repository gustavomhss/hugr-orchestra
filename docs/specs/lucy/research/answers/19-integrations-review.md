# 19-integrations-review

session ses_fea62b66d3903062464c3aa47b0dd75a704b61e1222a5df3ec37918f4f0dfdf6

## Answer

**Conclusion.** A reviewer should treat every boundary change as a change to a contract with three layers: source/generated code, wire format and semantics. Each layer needs evidence a machine produced: a diff tool verdict (oasdiff, buf breaking), a consumer-driven contract check (Pact) or a test against the real dependency (Testcontainers). The reviewer's own judgment covers what those tools cannot express: ordering, duplicates, retries, auth and trust. In this repository most boundaries already have a gate a reviewer can rerun: `check:boundaries --base origin/dev`, `check:spawn-imports`, `check:generated` in `packages/client`, and the governed-tool gate in the claude-code host. The reviewer's job is to require those gates and to block "fixes" that grow their allowlists or ledgers.

**1. Contracts and interfaces**
- Check three kinds of compatibility separately: source, wire and semantic. Old clients must keep working against newer servers. New required request fields and changes to how defaults are serialized count as breaking (read; AIP-180).
- Match the strictness to what consumers actually depend on. In buf, a rename breaks generated code but not the wire format. Pick FILE/PACKAGE when generated code is consumed, WIRE/WIRE_JSON when only bytes are (read; buf docs).
- For OpenAPI, oasdiff's rule is: a change breaks if a request that was valid can now be rejected, or a response can now carry something clients were never written to handle. Run `oasdiff breaking base.yaml revision.yaml` in CI (read; oasdiff.com).
- Consumer-driven contracts: provider verification passes when each response contains at least the consumer's minimal expected data. Contract tests should check the messages, not the provider's behaviour (read; Pact docs).
- Generated-client drift: you can only trust it when "regenerate, then git diff --exit-code" runs as a gate (inferred from `packages/client/package.json:13-14`).

**2. Third parties**
- Webhooks:
  - Verify the signature over the raw, unparsed body, with a constant-time compare.
  - Deduplicate by event ID.
  - Never assume delivery order.
  - Acknowledge with a 2xx quickly and process asynchronously (read; Stripe webhooks).
- Sandbox and production differ. Stripe retries live events for up to three days, but sandbox events only three times over a few hours, so a sandbox test does not exercise production retry behaviour (read).
- SDK drift: an older SDK sees new event types as an unknown type, so handlers need a fallback branch (read; Stripe).
- Retries: create/update calls need idempotency keys. Stripe v1 replays the saved response for a repeated key, including 500 errors (read; Stripe idempotency).
- API misuse (calls in the wrong order, missing preconditions) is common, and static detectors have very low precision and recall. Do not rely on a linter here; check misuse by hand or with a targeted test (read; Amann et al., TSE 2018).

**3. Inter-process boundaries**
- Electron: validate the `sender` of every IPC message, and never expose raw `ipcRenderer` to web content (read; Electron security checklist).
- MCP:
  - Servers must not accept tokens that were not issued to them (no token passthrough).
  - Session IDs must be secure and non-deterministic.
  - Before launching a local server, a client must show the exact command untruncated.
  - URLs must never be opened through a shell (read; MCP security best practices).
- Version skew: require that an old client works against a new server, per AIP-180 (read).
- Startup ordering: tests should wait until a dependency is ready rather than merely started; Testcontainers uses wait strategies for this (read). I found no primary source on shutdown ordering (see limits).

**4. Testing strategy**
- Ask for real dependencies (Testcontainers) instead of mocks or in-memory fakes where behaviour matters (read).
- Use contract tests for the shape of each interface, so the services do not have to run together (read; Pact).
- What a reviewer should require for a boundary change (inferred): a compatibility-diff result, a contract or real-dependency test for each changed interaction, and an explicit test for each failure mode (duplicate, out-of-order, retry, timeout).

**5. This repository**
- `check:boundaries` checks import rules R0-R15 against `script/module-architecture.json`. A ledger entry that no longer occurs fails as stale. Any growth of the ledger fails under `--base` (read, `script/check-module-boundaries.ts:2-12`). CI runs it with `--base origin/dev` (read, `.github/workflows/test.yml:324-326`).
- `check:spawn-imports` fails on any spawning import (cross-spawn, bun-pty, node-pty, child_process, hugr-omni, MCP stdio transport) that is not in `script/spawn-allowlist.json`. The list can only shrink (read, `script/check-spawn-imports.ts:2-6`). CI runs it (read, `test.yml:318-320`).
- Both gate scripts, the allowlist and AGENTS.md are protected paths that need an approver (read, `script/guards/rules/protected-paths.toml:20`).
- `packages/client` has a `check:generated` script that runs `bun run generate` and fails on a diff in `src/generated` or `src/generated-effect` (read, `packages/client/package.json:13-14`). Whether CI runs it for the client is unverified (see limits).
- In the claude-code host, governed `maestro_*` tools are refused until the session loads `maestro-run-governed`. `maestro_arsenal_*` and `maestro_workflows` are excluded (read, `modules/engine-adapters/claude-code/src/v2/host.ts:38-42`).
- The MCP Dock is only a logical module (`app-dock`). Its physical extraction is deferred because it touches Electron IPC/preload and the spawn allowlist, so a Dock change can cross IPC, spawning and MCP boundaries all at once (read, `docs/architecture/phase-plans/70-80-source.md:20,112`).

**What a reviewer must verify here (inferred):**
- `bun run check:boundaries --base origin/dev` and `bun run check:spawn-imports` are green.
- After a Protocol or HttpApi change, `bun --cwd packages/client run check:generated` is clean and the regenerated files are committed, not hand-edited.
- No new allowlist or ledger entries.
- A change that touches the governed gate keeps three files in step: `maestro.txt`, `host.ts` and the playbook.

**Not examined:**
- Integration postmortems: none were captured within the time budget.
- Spring Cloud Contract, Microsoft API guidelines, Stripe rate limits and pagination guidance (AIP-158), record/replay tools (the repo's `tooling/http-recorder`), ephemeral environments.
- Shutdown-ordering sources.
- Whether `test.yml:389` runs the client `check:generated`.
- The internals of the omni and MCP Dock runtime code.

**Reproduce:** `bun run check:boundaries --base origin/dev && bun run check:spawn-imports && bun --cwd packages/client run check:generated`

## Claims

[
 {
  "proposition": "AIP-180 requires old clients to work against newer servers and forbids adding new required fields to existing requests or changing how defaulted fields serialize.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_5b379292b49fa0d6452f752ed2",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_e24c784a5adc0c8067dafc1d9c",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "0ae929df2fec59e969b16af86502aa6c16a89349817c59d862e15a01703d3a31"
    },
    "quote": "Old clients **must** be able to work against newer servers (with the same major version number)."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_e24c784a5adc0c8067dafc1d9c",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "0ae929df2fec59e969b16af86502aa6c16a89349817c59d862e15a01703d3a31"
    },
    "quote": "New required fields **must not** be added to existing request messages or resources."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_e24c784a5adc0c8067dafc1d9c",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "0ae929df2fec59e969b16af86502aa6c16a89349817c59d862e15a01703d3a31"
    },
    "quote": "APIs **must not** change the way a field with a default value is serialized."
   }
  ]
 },
 {
  "proposition": "buf breaking distinguishes generated-code breakage from wire breakage and tells users to choose the category matching what consumers depend on.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_5b379292b49fa0d6452f752ed2",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_3f3453cb918d1b4824a6514751",
      "revision": 1
     },
     "representation": "text",
     "digest": "0fea2a95627f2de3615ad994fe46cdc97406d4fb1e1024699f35d4825f6f0800"
    },
    "quote": "Renaming an existing field breaks generated source code but leaves the wire format intact."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_3f3453cb918d1b4824a6514751",
      "revision": 1
     },
     "representation": "text",
     "digest": "0fea2a95627f2de3615ad994fe46cdc97406d4fb1e1024699f35d4825f6f0800"
    },
    "quote": "Pick the category that matches what your consumers actually depend on."
   }
  ]
 },
 {
  "proposition": "oasdiff defines a breaking OpenAPI change as one where a previously valid request can be rejected or a response can carry something clients were not written to handle.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_5b379292b49fa0d6452f752ed2",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0018969ac8e942c3c44e4e9192",
      "revision": 1
     },
     "representation": "text",
     "digest": "2b536584277349b7aaaa731e95bc6cc73168e0883178513da18a2b7f68cc42ab"
    },
    "quote": "a change is breaking if a request that was valid before can now be rejected, or a response can now carry something clients were never written to handle"
   }
  ]
 },
 {
  "proposition": "Pact provider verification passes when responses contain at least the consumer's minimal expected data, and contract tests should focus on messages rather than behaviour.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_5b379292b49fa0d6452f752ed2",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_5aa2e902ea2e9d733ce05b3495",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "bee979346bba58aacaa2185e2cc2abc52f53b38e7060caa15c3ed95a2c3a3204"
    },
    "quote": "Provider verification passes if each request generates a response that contains at least the data described in the minimal expected response."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_5aa2e902ea2e9d733ce05b3495",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "bee979346bba58aacaa2185e2cc2abc52f53b38e7060caa15c3ed95a2c3a3204"
    },
    "quote": "Contract tests should focus on the messages (requests and responses) rather than the behaviour"
   }
  ]
 },
 {
  "proposition": "Stripe webhooks may be delivered more than once and out of order; handlers must verify the Stripe-Signature over the payload with constant-time comparison and dedupe by event ID.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_c634804b2bbb32c1e262b884fe",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_bed360d60386b63ff7b7989434",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f644983058c4c278f0ec2492504929cdd8050bc39016da9c0559257119c8a4da"
    },
    "quote": "Webhook endpoints might occasionally receive the same event more than once."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_bed360d60386b63ff7b7989434",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f644983058c4c278f0ec2492504929cdd8050bc39016da9c0559257119c8a4da"
    },
    "quote": "guarantee the delivery of events in the order that"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_bed360d60386b63ff7b7989434",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f644983058c4c278f0ec2492504929cdd8050bc39016da9c0559257119c8a4da"
    },
    "quote": "Verifies the webhook request is generated by Stripe using the JSON payload, the `Stripe-Signature` header"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_bed360d60386b63ff7b7989434",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f644983058c4c278f0ec2492504929cdd8050bc39016da9c0559257119c8a4da"
    },
    "quote": "To protect against timing attacks, use a constant-time-string comparison to compare the expected signature to each of the received signatures."
   }
  ]
 },
 {
  "proposition": "Stripe sandbox retry behaviour differs from live mode, and older SDKs surface newer event types as unknown, so sandbox tests and pinned SDKs do not cover production behaviour.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_c634804b2bbb32c1e262b884fe",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_bed360d60386b63ff7b7989434",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f644983058c4c278f0ec2492504929cdd8050bc39016da9c0559257119c8a4da"
    },
    "quote": "We retry event deliveries created in a sandbox three times over the course of a few hours."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_bed360d60386b63ff7b7989434",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f644983058c4c278f0ec2492504929cdd8050bc39016da9c0559257119c8a4da"
    },
    "quote": "Events that were introduced after this SDK version release are"
   }
  ]
 },
 {
  "proposition": "Stripe idempotency keys make retries safe; a repeated key replays the saved response including 500 errors.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_c634804b2bbb32c1e262b884fe",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_db973a2a120e61ba1530280a58",
      "revision": 1
     },
     "representation": "text",
     "digest": "fd3d6f889a557f5535d7ac5e5e79c1898ac378b287c45e56a67880b5e5318ee3"
    },
    "quote": "Retries with the same key return the saved response, including `500` errors."
   }
  ]
 },
 {
  "proposition": "Research on API misuse finds static misuse detectors have extremely low precision and recall, so misuse must be reviewed or tested directly.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_c634804b2bbb32c1e262b884fe",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f1ed08d450ed09a6ec563cd251",
      "revision": 1
     },
     "representation": "text",
     "digest": "64107102dfac6ab2b6df0d8a36a7514f70198f6fe441a500727f18f1cc8e3ba9"
    },
    "quote": "suffer from extremely low precision and recall"
   }
  ]
 },
 {
  "proposition": "Electron requires validating the sender of all IPC messages; MCP forbids token passthrough, requires secure session IDs, untruncated command display before launching local servers, and no shell for opening URLs.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_58545cc59cc4ba688439b3184b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_07b9b744bd590ee39d89b9be87",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f2638ac41fce0d620eea3262e32f5a724b1bd3f73e7de5464c2bc45447d3f681"
    },
    "quote": "You should be validating the `sender` of **all** IPC messages by default."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6b4e170bb9f6ce64981e383ce2",
      "revision": 1
     },
     "representation": "text",
     "digest": "91fe938394ce86939b94c36e5040e42baa3a481725d2a900ba53bb5d833962f1"
    },
    "quote": "MCP servers **MUST NOT** accept any tokens that were not explicitly"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6b4e170bb9f6ce64981e383ce2",
      "revision": 1
     },
     "representation": "text",
     "digest": "91fe938394ce86939b94c36e5040e42baa3a481725d2a900ba53bb5d833962f1"
    },
    "quote": "MCP servers **MUST** use secure, non-deterministic session IDs."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6b4e170bb9f6ce64981e383ce2",
      "revision": 1
     },
     "representation": "text",
     "digest": "91fe938394ce86939b94c36e5040e42baa3a481725d2a900ba53bb5d833962f1"
    },
    "quote": "Show the exact command that will be executed, without truncation"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_6b4e170bb9f6ce64981e383ce2",
      "revision": 1
     },
     "representation": "text",
     "digest": "91fe938394ce86939b94c36e5040e42baa3a481725d2a900ba53bb5d833962f1"
    },
    "quote": "**MUST NOT** use shell commands (e.g., `cmd.exe`, `sh`, PowerShell) to open URLs"
   }
  ]
 },
 {
  "proposition": "Testcontainers supports testing against the same services used in production instead of mocks, and its wait strategies address readiness of dependencies before use.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_d0d85d642ad2ca7178b731b92f",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_74c6fb04b4583184e95ddff19f",
      "revision": 1
     },
     "representation": "text",
     "digest": "021a036a5b5a47638a32fcab4d759040247434b027ad4092983689395fb819ab"
    },
    "quote": "you can write tests that depend on the same services you use in production without mocks or in-memory services"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_74c6fb04b4583184e95ddff19f",
      "revision": 1
     },
     "representation": "text",
     "digest": "021a036a5b5a47638a32fcab4d759040247434b027ad4092983689395fb819ab"
    },
    "quote": "Docker containers need to be started and fully initialized before using them in your tests."
   }
  ]
 },
 {
  "proposition": "A boundary change should come with a compatibility-diff verdict, a contract or real-dependency test per changed interaction, and explicit failure-mode tests (duplicate, out-of-order, retry, timeout).",
  "nature": "inference",
  "subquestion": {
   "id": "rque_d0d85d642ad2ca7178b731b92f",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_5aa2e902ea2e9d733ce05b3495",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "bee979346bba58aacaa2185e2cc2abc52f53b38e7060caa15c3ed95a2c3a3204"
    },
    "quote": "the contract between the consumer and provider is fully tested without having to spin up the services together"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_bed360d60386b63ff7b7989434",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "f644983058c4c278f0ec2492504929cdd8050bc39016da9c0559257119c8a4da"
    },
    "quote": "Webhook endpoints might occasionally receive the same event more than once."
   }
  ]
 },
 {
  "proposition": "check:boundaries checks import rules against script/module-architecture.json, fails on stale ledger entries and, with --base, on ledger growth; CI runs it with --base origin/dev.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_a8690225543efb42dac621efae",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_db417a9cd056a2d13c1b2c7113",
      "revision": 1
     },
     "representation": "text",
     "digest": "b3e6d8f9c87ae363767a74d9a57da58864c3c99cd56bb18d204aebfa12bc4468"
    },
    "lines": {
     "start": 2,
     "end": 12
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_24020b9e44f3c59cb2307bf9e8",
      "revision": 1
     },
     "representation": "text",
     "digest": "6056f81d2a227688473472761f0660071f578e5833c0a5fd160093fd2c2ffda0"
    },
    "lines": {
     "start": 318,
     "end": 326
    }
   }
  ]
 },
 {
  "proposition": "check:spawn-imports fails on unlisted spawning imports or MCP stdio transport use and on stale allowlist entries, so the allowlist only shrinks; the gate files are protected paths.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_a8690225543efb42dac621efae",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_f8c50595825c7ab0e7f829cb7b",
      "revision": 1
     },
     "representation": "text",
     "digest": "a3a42fdf4ab4e20282ab71a82e95b02be9dec4e59a39b403a2a29db838b780d8"
    },
    "lines": {
     "start": 2,
     "end": 6
    }
   },
   {
    "source": {
     "artifact": {
      "id": "cart_23ee8d1470ac091c9a17c4c19d",
      "revision": 1
     },
     "representation": "text",
     "digest": "ed6293ebaa7384880e45429cf61585991c80f223f2c36eb61126bd12b4ee69fa"
    },
    "quote": "\"script/check-spawn-imports.ts\", \"script/spawn-allowlist.json\"]"
   }
  ]
 },
 {
  "proposition": "packages/client's check:generated reruns generate and fails on any diff in src/generated or src/generated-effect.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_a8690225543efb42dac621efae",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_b9ffc1b4fc2c72c5628295c3ad",
      "revision": 1
     },
     "representation": "text",
     "digest": "51b66c7fc36db3d6d165d1db65a463a3a2369276a757aaf6c899199b2573bf91"
    },
    "lines": {
     "start": 13,
     "end": 14
    }
   }
  ]
 },
 {
  "proposition": "The claude-code host refuses governed maestro_* tools until maestro-run-governed loads, excluding maestro_arsenal_* and maestro_workflows.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_a8690225543efb42dac621efae",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_88347bbbe1a22f59ca87c5fe03",
      "revision": 1
     },
     "representation": "text",
     "digest": "ff9b9da8c6220124fe44359b4026802c70fe1c038c235ce033ee99562adf0630"
    },
    "lines": {
     "start": 38,
     "end": 42
    }
   }
  ]
 },
 {
  "proposition": "The MCP Dock is a logical module app-dock whose physical extraction is deferred because it spans Electron IPC/preload and the spawn allowlist; layer tags are enforced by turbo boundaries plus check:boundaries with a shrink-only ledger.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_a8690225543efb42dac621efae",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_91c15f9f4ff044cdfa551c1bf8",
      "revision": 1
     },
     "representation": "text",
     "digest": "deb2eaeb60c04d02784b03b888266a54aa566607363b7516c57f0a25d162fccf"
    },
    "quote": "physical extraction deferred (72 desktop files, 59 path references incl. `native.yml`, `bunfig.toml`, spawn allowlist)"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_91c15f9f4ff044cdfa551c1bf8",
      "revision": 1
     },
     "representation": "text",
     "digest": "deb2eaeb60c04d02784b03b888266a54aa566607363b7516c57f0a25d162fccf"
    },
    "quote": "MCP Dock physical extraction to `modules/app-dock` | 59 path references, Electron IPC/preload, spawn allowlist"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_91c15f9f4ff044cdfa551c1bf8",
      "revision": 1
     },
     "representation": "text",
     "digest": "deb2eaeb60c04d02784b03b888266a54aa566607363b7516c57f0a25d162fccf"
    },
    "quote": "layer tags enforced by `turbo boundaries` + `check:boundaries` with a shrink-only ledger"
   }
  ]
 }
]
