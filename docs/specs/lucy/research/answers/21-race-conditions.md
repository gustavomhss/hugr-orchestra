# 21-race-conditions

session ses_f31869e4d015ee0fe5ef0e503fba638b8a1868729ce1e033c72052612f521f68

## Answer

**Conclusion.** You find races by reading for *windows*: places where a fact is checked or read and then acted on, with a scheduling point in between (an `await`, `yield*`, IPC hop, syscall, or another process). You prove a race by forcing one specific interleaving with barriers, `Deferred`, or injected yields, so the test fails every run. You refute one by showing the window can't open: one owner, an atomic primitive, or a durable compare-and-swap. Lu et al. found that ~92% of the real concurrency bugs they studied trigger by fixing the order of at most 4 accesses. So the job is to find that small ordering and pin it in a test.

**1. Taxonomy and what each leaves in code**
- *Data race* means unsynchronized memory access. A *race condition* is a logic bug and can exist with no data race at all. JS has no data races between fibers or promises, but it is full of race conditions. TSan only detects data races (read).
- *Atomicity violation*: read, then `await`, then write from the stale read. This is how lost updates happen. *Order violation*: code assumes A runs before B (init before use, listener before emit). Lu et al.: about a third of non-deadlock bugs are order violations, 34% involve several variables, and 73% were not fixed by adding or changing locks (read).
- *Check-then-act / TOCTOU*: `exists()` then `open()`, or `get()` then `set()`. Fixes are an atomic `mkdir`, `link(2)` failing with EEXIST, `renameat` on directory fds, or an SQL CAS (read).
- *Double execution*: two callers both see "idle" and both start. *Use-after-dispose*: a callback lands after `close()`. *Reentrancy*: a handler calls back into the mutator. *Stale read*: a cached snapshot is used across a yield. *ABA / recycled identity*: an id, name or generation is reused, so "same value" no longer means "same owner". The repo checks entry object identity to guard against this (read).

**2. Async JS/TS and Effect**
- Every `await` or `yield*` is a preemption point. A probe ran two `addUnsafe(1)` calls concurrently: the read, `await`, write version printed `unsafe=1`. Serializing the same two calls through a promise chain printed `locked=2` (ran).
- Effect: `race` and `raceFirst` interrupt the loser, and `raceFirst` waits until the loser is cleanly terminated. When one effect in a concurrent `forEach` is interrupted, its siblings are interrupted too (read).
- What to look for in review:
  - state mutated outside `SynchronizedRef.modify` or a `Semaphore`;
  - registration done after a fork (should be before);
  - `onInterrupt` cleanup that assumes it still owns the resource;
  - a missing `uninterruptibleMask` between "insert into map" and "fork owner".

**3. Multi-process and OS**
- SQLite WAL: readers and writers don't block each other, but only one writer runs at a time. `SQLITE_BUSY` still happens during last-connection cleanup and crash recovery, so a busy timeout plus short transactions are mandatory (read).
- POSIX `rename` keeps the target name visible throughout and replaces it atomically. `renameat` exists because path components can change concurrently (read).
- Electron: `requestSingleInstanceLock()` must come before any other startup side effect. Later launches arrive through `second-instance` (read).

**4. Evidence ladder** (weakest to strongest)
1. Stress and repeated runs: weak evidence.
2. Yield or delay injection, e.g. TSan adaptive delay at sync points (read).
3. A controlled scheduler. Shuttle is randomized and reproducible but "not sound"; Loom exhaustively permutes executions under C11 (read).
4. Record and replay. rr records multi-process workloads, has a chaos mode, and replays one failing run deterministically (read).
5. Model checking a small protocol.

For JS, the practical form is a test that controls the race with `Deferred` or gates, opens the window explicitly, asserts the bad outcome on the unfixed code, then asserts the good outcome after the fix.

**5. This repository**
- `SessionRunCoordinator` (`packages/core/src/session/run-coordinator.ts`):
  - a per-key `Entry` map; a wake during a drain sets `pendingWake`, and only one follow-up drain starts, as a successor;
  - `run` and `exclusive` insert and fork inside `uninterruptibleMask`;
  - `stop` compares the entry object so it never kills a successor (read).
- Accepted races documented in code:
  - a revoked scheduled-task claim "can admit one run past the repeat limit" (`scheduled-task.ts:179-180`);
  - concurrent Session creation that loses the projection race adopts the existing Session (`session.ts:399`) (read).
- Merge queue: `git worktree add` runs one at a time because concurrent adds race on git's lock files (`board/queue-red.ts:149`) (read).
- Actions: the request is registered before the durable claim, so disposal can't race the CAS, and time is sampled after SQLite's write reservation (`actions/operations.ts:138-146`) (read).
- File locks: `effect-flock` uses atomic `mkdir`, with a breaker directory and a staleness re-check before breaking a stale lock. The Atlas sidecar uses `link(2)`+EEXIST as a CAS, after a *measured* 8-writer race lost 1–5 nodes while every writer reported ok (read).
- Database: WAL, `busy_timeout = 5000` (read).
- `KeyedMutex` counts holders plus waiters, so an entry isn't deleted under a waiter (read).
- PTY: an attach queues the replay chunks and a cursor meta frame before activating the attachment, then races the socket drain against input, with `ensuring(detach)` (read).

**Where to look in this repo:** wake/interrupt/run interleavings on one Session; CAS rows whose loser path re-reads; lease expiry vs settle; dispose vs in-flight request; checkout/worktree concurrency in the queue; PTY detach vs late writes.

**Not examined:** git history search is not permitted in this worktree, so the "races fixed in commits" part is code comments only. Not captured: the Node.js concurrency study (Wang et al., ASE'17 — found but not captured), deterministic simulation (FoundationDB/TigerBeetle), Effect Scope/Semaphore pages.

**Reproduce:** `probe_run` script: two concurrent `addUnsafe(1)` with `await setTimeout(0)` between read and write prints `unsafe=1 locked=2`.

## Claims

[
 {
  "proposition": "Lu et al. (ASPLOS'08): ~1/3 of non-deadlock bugs are order violations, ~34% involve multiple variables, ~92% trigger by enforcing order among <=4 memory accesses, ~73% not fixed by adding/changing locks.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_75252dcf9c881eeb9186930887",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_5ac3a7e71b315592592bf9804b",
      "revision": 1
     },
     "representation": "text",
     "digest": "091285c214bd0480603515d96218a6a9415aa48f16e4d0bac8d81273100242fb"
    },
    "quote": "About 92% of the examined concurrency bugs can be reliably triggered by enforcing certain orders among no more than 4 memory accesses"
   }
  ]
 },
 {
  "proposition": "In a single-threaded JS runtime a read/await/write split loses an update deterministically under two concurrent calls; serializing through a promise chain removes it.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_ac3760f3056d5ebbfb8be7e59d",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_0098a3d52ba45e148a1de0684b",
      "revision": 1
     },
     "representation": "structured-json",
     "digest": "59d7786a83235d48c981bfeb9094260fc10a8affc238e661fdcaa846f209a333"
    },
    "pointer": "/verdict"
   }
  ]
 },
 {
  "proposition": "Effect raceFirst interrupts the loser and does not resume until the loser is cleanly terminated; interrupting one effect in a concurrent forEach interrupts all concurrent effects.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_ac3760f3056d5ebbfb8be7e59d",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_237374426bd5c14b90388ae73c",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "223df1b46913ecb021d82ae7e24f469fcbab4c8d0d2243fa1da65ea31781c08b"
    },
    "quote": "it will not resume until the loser is cleanly terminated"
   }
  ]
 },
 {
  "proposition": "SQLite WAL allows only one writer at a time and can still return SQLITE_BUSY during last-connection cleanup and crash recovery.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_9896ecd3a75beb0a7b6e08f28b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d8d0fc8dc682b484941f13c312",
      "revision": 1
     },
     "representation": "text",
     "digest": "2caa18f5b74c19ee7b47cabe97e3b08ae4e5219e23fa86ea1007cff4fc088470"
    },
    "quote": "since there is only one WAL file, there can only be one writer at\na time."
   }
  ]
 },
 {
  "proposition": "POSIX rename keeps the new name visible throughout and referring to old or new file; renameat exists to avoid races from concurrent path changes.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_9896ecd3a75beb0a7b6e08f28b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_30ffba7bd46df159af1f842d73",
      "revision": 1
     },
     "representation": "text",
     "digest": "125e5cadd061ba0a85529eec4480fd04cde209392bf7866f97bb0130034f62a9"
    },
    "quote": "without\nexposure to race conditions"
   }
  ]
 },
 {
  "proposition": "The desktop main process takes Electron's single-instance lock and quits if it fails, then routes later launches through second-instance.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_9896ecd3a75beb0a7b6e08f28b",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_83c4555f733ebe506063252cf4",
      "revision": 1
     },
     "representation": "text",
     "digest": "18590b31a8d75cf4ad8b1c0694dc968b69de731ea0be512a8bb405ef6b18aad3"
    },
    "quote": "if (!app.requestSingleInstanceLock()) {"
   }
  ]
 },
 {
  "proposition": "Shuttle is randomized, reproducible and not sound; Loom is exhaustive permutation testing under the C11 model.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_6c47b91c5c26b1ba73081c6b7c",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_ec12262bf44edab69adbe50856",
      "revision": 1
     },
     "representation": "text",
     "digest": "daa14f6dce13eb4ff6e018d45fbbed022702dbfea918d812b576d69815c45137"
    },
    "quote": "Shuttle is not sound (a passing Shuttle test does not prove the code\nis correct), but it scales to much larger test cases than Loom."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_747c380de7e1f0015baad7fca1",
      "revision": 1
     },
     "representation": "markdown",
     "digest": "56cf2a0b445ef26c12a1ef7c0bb303771bd5e113217e18f3dcd9092e0aba74bc"
    },
    "quote": "It runs a test many times, permuting the possible concurrent executions of that test under the"
   }
  ]
 },
 {
  "proposition": "ThreadSanitizer detects data races and offers adaptive delay injection at sync points; rr records multi-process workloads, has chaos mode and replays deterministically.",
  "nature": "extraction",
  "subquestion": {
   "id": "rque_6c47b91c5c26b1ba73081c6b7c",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_6788f4b72d2ebf7299c0c98333",
      "revision": 1
     },
     "representation": "text",
     "digest": "03e22cd41e6bd7ce7073119c746ae9714740d7f06949143dbb6d88b5ec7dbcc1"
    },
    "quote": "Adaptive Delay is an optional ThreadSanitizer feature that injects delays at\nsynchronization points"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_dc2e2307a826ec16e7a9fbc0bd",
      "revision": 1
     },
     "representation": "text",
     "digest": "62ea3d342fed1d549864661a0920fb06b8acfcb587d58446e1173606c9faa389"
    },
    "quote": "Chaos mode to\n  make intermittent bugs more reproducible"
   }
  ]
 },
 {
  "proposition": "SessionRunCoordinator serializes per key: a wake during an active entry only sets pendingWake (one coalesced successor), run inserts and forks inside uninterruptibleMask, and stop checks entry identity so it never interrupts a successor.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_5f6f9c2211a3102ea56666f984",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_a650f4d60f6794aced64b9c9b9",
      "revision": 1
     },
     "representation": "text",
     "digest": "369d3e9a2f8769b363b50937c628a291dab3f874b6a2d5f31b9a307fbf349cfa"
    },
    "quote": "// The entry object is process-local ownership. A completed waiter's successor is a different owner."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_a650f4d60f6794aced64b9c9b9",
      "revision": 1
     },
     "representation": "text",
     "digest": "369d3e9a2f8769b363b50937c628a291dab3f874b6a2d5f31b9a307fbf349cfa"
    },
    "quote": "          entry.pendingWake = true"
   }
  ]
 },
 {
  "proposition": "The repo documents accepted or handled races: a revoked scheduled claim can admit one run past the repeat limit; concurrent Session creation losing the projection race adopts the existing Session.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_5f6f9c2211a3102ea56666f984",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_d26a5732e87174152b49ef2c8a",
      "revision": 1
     },
     "representation": "text",
     "digest": "e4b881bfa8a720d842f636e86756df92d2036233e41fefc31903e534030e96c5"
    },
    "quote": "so this race can admit one run past the repeat limit."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_28ca56e76a3a347405a18988d7",
      "revision": 1
     },
     "representation": "text",
     "digest": "ab464e4cbacbb82726ea189ceeffc28cd66c0a0c7fd9346c284561441867d25e"
    },
    "quote": "// Concurrent creation lost the projection race. The existing Session identity wins."
   }
  ]
 },
 {
  "proposition": "The merge queue adds git worktrees one at a time because concurrent git worktree add races on lock files; Actions registers the request before the durable claim and samples time after SQLite's write reservation.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_5f6f9c2211a3102ea56666f984",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_5ea404bb744aebf998b1991f01",
      "revision": 1
     },
     "representation": "text",
     "digest": "b81ade37bb61a0ac5f1fe8a2022f4794af8061451f42d58a5939cb6478ed81d8"
    },
    "quote": "// Checkouts are added one at a time: concurrent `git worktree add` on one repository can race on its lock files."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_ea7a29215ef4fb4ad3615618b1",
      "revision": 1
     },
     "representation": "text",
     "digest": "de4b2b33e737d25d092fd0c01f646300f29d373d62df3ec7345fa3066d1d027b"
    },
    "quote": "// Register before the durable claim so disposal cannot race the CAS/cleanup"
   }
  ]
 },
 {
  "proposition": "Cross-process guards: effect-flock uses atomic mkdir with a breaker and staleness re-check; the Atlas sidecar commit uses link(2) EEXIST as a CAS after a measured 8-writer race lost nodes; the database sets WAL and busy_timeout 5000; KeyedMutex counts holders and waiters before deleting an entry.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_5f6f9c2211a3102ea56666f984",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_5c24a01241ab29a6d42884a25d",
      "revision": 1
     },
     "representation": "text",
     "digest": "9e4bf990a59e4bbf2ac65279e0d9d4899f891868ab7ac2360643171c3ddaa143"
    },
    "quote": "// We own the breaker — double-check staleness, nuke, recreate"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_783945238682d22d275feed2e5",
      "revision": 1
     },
     "representation": "text",
     "digest": "1526d451f566c665fb48255245b4ed6e14e5dacff21822900966117266469822"
    },
    "quote": "EEXIST ⇒ another writer got there first ⇒ go to 1."
   },
   {
    "source": {
     "artifact": {
      "id": "cart_26e36ac93294c7c5b9e5973bde",
      "revision": 1
     },
     "representation": "text",
     "digest": "2d8aedc68aac7a774981dc9180e47d93fe5e2219199643f62cdab2056e58ffaa"
    },
    "quote": "yield* db.run(\"PRAGMA busy_timeout = 5000\")"
   },
   {
    "source": {
     "artifact": {
      "id": "cart_35c3137fe675fe396c1c5f81ed",
      "revision": 1
     },
     "representation": "text",
     "digest": "e5a8e2b09efe31d44173872ced31e4f5eee7b2632f52511fde30ca391c63f09d"
    },
    "quote": "`users` counts holders and waiters so an entry is not removed while a waiter"
   }
  ]
 },
 {
  "proposition": "The PTY websocket handler queues the replay and cursor frame before activating the attachment, then races the outbox drain against socket input and always detaches via ensuring.",
  "nature": "observation",
  "subquestion": {
   "id": "rque_5f6f9c2211a3102ea56666f984",
   "revision": 1
  },
  "evidence": [
   {
    "source": {
     "artifact": {
      "id": "cart_aa219e42c70f14e0d307a9b190",
      "revision": 1
     },
     "representation": "text",
     "digest": "f558e80309479b5b0aef7d67285e0469fa02f74107ddf6394d7ccac5f55782fa"
    },
    "quote": "Effect.ensuring(Effect.sync(() => attachment.detach())),"
   }
  ]
 }
]
