// Sample data shaped like real Atlas output (own/query/doctor/memory-header) for the hugr-orchestra repo.
// Claims paraphrase real repository rules so the preview reads like the product, but every value is sample.
;(function (A) {
  // Deterministic 64-hex identifiers: nodeKey and content address are different ids (docs/reference/commands/node.md).
  const hex = (seed) => {
    let h = 2166136261
    const out = []
    for (let i = 0; i < 8; i++) {
      for (const c of `${seed}:${i}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0
      out.push(h.toString(16).padStart(8, "0"))
    }
    return out.join("")
  }

  const HEAD = "6ea93832"
  const BASE = "3f7bfa5d"

  const seats = {
    orch: { label: "Maestro", role: "Orchestrator", memory: false },
    backend: { label: "Backend", role: "Executes server and core work", memory: true },
    jimmy: { label: "Jimmy", role: "Explores and mines", memory: true },
    archie: { label: "Archie", role: "Plans and anchors knowledge", memory: true },
    patty: { label: "Patty", role: "Frontend execution", memory: false },
    billy: { label: "Billy", role: "Security · T0 ratification input", memory: false },
    lucy: { label: "Lucy", role: "Verification", memory: false },
    rosie: { label: "Rosie", role: "Documentation", memory: false },
    gustavo: { label: "Gustavo", role: "Steward (human)", memory: false, human: true },
  }

  const territories = [
    { id: "core", name: "Core runtime", globs: ["packages/core/**"], owner: "backend", tier: "T1", fresh: 196, drifted: 14, stale: 4, unknown: 0 },
    { id: "orchestra", name: "Orchestra host", globs: ["packages/orchestra/**"], owner: "backend", tier: "T1", fresh: 121, drifted: 9, stale: 2, unknown: 0 },
    { id: "server", name: "Server & protocol", globs: ["packages/server/**", "packages/protocol/**"], owner: "backend", tier: "T1", fresh: 88, drifted: 6, stale: 2, unknown: 0 },
    { id: "app", name: "App shell & UI", globs: ["packages/app-shell/**", "packages/ui/**", "apps/web/**"], owner: "patty", tier: "T2", fresh: 71, drifted: 7, stale: 0, unknown: 3 },
    { id: "client", name: "Client & SDK", globs: ["packages/client/**", "packages/sdk/**"], owner: "patty", tier: "T1", fresh: 52, drifted: 3, stale: 3, unknown: 0 },
    { id: "relay", name: "Relay workflows", globs: ["modules/relay/**"], owner: "archie", tier: "T1", fresh: 42, drifted: 2, stale: 0, unknown: 0 },
    { id: "atlas", name: "Atlas", globs: ["modules/atlas/**"], owner: "archie", tier: "T0", fresh: 19, drifted: 0, stale: 0, unknown: 0 },
    { id: "omni", name: "Omni spawner", globs: ["native/omni/**", "packages/core/src/omni.ts"], owner: "billy", tier: "T0", fresh: 13, drifted: 0, stale: 0, unknown: 0 },
  ]
  const uncovered = ["tooling/httpapi-codegen/**", "perf/**", "nix/**"]

  const f = (seed, rest) => ({ key: hex(`key:${seed}`), addr: hex(`addr:${seed}`), ...rest })
  const facts = [
    f("admit", {
      family: "predicate", tier: "T1", seal: "proven", freshness: "FRESH", truth: "HOLDS", slot: "invariant", territory: "core",
      claim: "SessionV2.prompt admits exactly one durable session_input row before it schedules a wake.",
      anchor: { kind: "symbol", path: "packages/core/src/session-v2/prompt.ts", qualifiedPath: "session-v2/prompt.ts::SessionV2.prompt", lines: [41, 52], hash: hex("sub:admit") },
      emitted: { by: "archie", door: "atlas-emit", at: HEAD, when: "2 days ago" }, ratified: { by: "orch", when: "2 days ago" },
      code: { start: 40, highlight: [41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52], lines: [
        "// Admission is durable; execution is advisory and may be skipped (resume: false).",
        "export const prompt = Effect.fn(\"SessionV2.prompt\")(function* (input: PromptInput) {",
        "  const store = yield* SessionStore.Service",
        "  const admitted = yield* store.admit({",
        "    sessionID: input.sessionID,",
        "    messageID: input.messageID,",
        "    delivery: input.delivery ?? \"steer\",",
        "  })",
        "  if (input.resume === false) return admitted",
        "  const execution = yield* SessionExecution.Service",
        "  yield* execution.wake(input.sessionID)",
        "  return admitted",
        "})",
      ] },
      relations: [{ kind: "same-as", key: "steer" }, { kind: "calls", key: "wake" }, { kind: "depends-on", key: "nospawn" }],
      lineage: [{ v: 3, at: HEAD, by: "archie", note: "Re-ground after the store split" }, { v: 2, at: "b1ec52a9", by: "archie", note: "Scope narrowed to admission only" }, { v: 1, at: "57a27891", by: "jimmy", note: "Mined from session tests" }],
    }),
    f("steer", {
      family: "advisory", tier: "T1", seal: "justified", freshness: "FRESH", truth: "advisory", slot: "rationale", territory: "core",
      claim: "Prompts steer by default and promote at the next safe provider-turn boundary.",
      anchor: { kind: "symbol", path: "packages/core/src/session-v2/runner.ts", qualifiedPath: "session-v2/runner.ts::promoteSteers", lines: [118, 141], hash: hex("sub:steer") },
      emitted: { by: "archie", door: "atlas-emit", at: HEAD, when: "2 days ago" }, ratified: { by: "orch", when: "2 days ago" },
      relations: [{ kind: "same-as", key: "admit" }, { kind: "subsumes", key: "queue" }],
    }),
    f("conflict", {
      family: "predicate", tier: "T1", seal: "proven", freshness: "DRIFTED", truth: "BROKEN", slot: "invariant", territory: "core", drift: "semantic",
      claim: "Reusing a prompt message ID with a different delivery mode fails with PromptConflict.",
      anchor: { kind: "symbol", path: "packages/core/src/session-v2/store.ts", qualifiedPath: "session-v2/store.ts::SessionStore.admit", lines: [88, 104], hash: hex("sub:conflict") },
      anchorNow: { qualifiedPath: "session-v2/store.ts::SessionStore.admit", lines: [88, 109], hash: hex("sub:conflict2") },
      emitted: { by: "backend", door: "atlas-emit", at: BASE, when: "5 days ago" }, ratified: { by: "orch", when: "5 days ago" },
      before: { start: 96, lines: ["  if (existing && existing.delivery !== input.delivery)", "    return yield* new PromptConflict({ messageID: input.messageID })", "  if (existing) return existing"] },
      after: { start: 96, lines: ["  if (existing && existing.delivery !== input.delivery)", "    yield* Effect.logWarning(\"delivery changed on retry\")", "  if (existing) return { ...existing, delivery: input.delivery }"] },
      relations: [{ kind: "depends-on", key: "admit" }],
    }),
    f("wake", {
      family: "advisory", tier: "T1", seal: "justified", freshness: "FRESH", truth: "advisory", slot: "gotcha", territory: "core",
      claim: "SessionExecution.wake is advisory: an idle or missing session is a no-op, never an error.",
      anchor: { kind: "symbol", path: "packages/core/src/session-v2/execution.ts", qualifiedPath: "session-v2/execution.ts::SessionExecution.wake", lines: [22, 37], hash: hex("sub:wake") },
      emitted: { by: "backend", door: "atlas-emit", at: HEAD, when: "1 day ago" }, ratified: { by: "orch", when: "1 day ago" },
      relations: [{ kind: "calls", key: "admit" }],
    }),
    f("stream", {
      family: "predicate", tier: "T1", seal: "proven", freshness: "DRIFTED", truth: "HOLDS", slot: "invariant", territory: "core", drift: "mechanical",
      claim: "The runner calls llm.stream exactly once per provider turn.",
      anchor: { kind: "symbol", path: "packages/core/src/session-v2/runner.ts", qualifiedPath: "session-v2/runner.ts::SessionRunner.turn", lines: [60, 84], hash: hex("sub:stream") },
      anchorNow: { qualifiedPath: "session-v2/runner.ts::SessionRunner.turn", lines: [64, 88], hash: hex("sub:stream2") },
      emitted: { by: "archie", door: "atlas-emit", at: BASE, when: "5 days ago" }, ratified: { by: "orch", when: "5 days ago" },
      before: { start: 60, lines: ["  const turn = Effect.fn(\"SessionRunner.turn\")(function* (request) {", "    const response = yield* llm.stream(request)"] },
      after: { start: 64, lines: ["  // Reload projected history before durable continuation.", "  const turn = Effect.fn(\"SessionRunner.turn\")(function* (request) {", "    const response = yield* llm.stream(request)"] },
      relations: [{ kind: "depends-on", key: "admit" }],
    }),
    f("queue", {
      family: "advisory", tier: "T2", freshness: "FRESH", truth: "advisory", territory: "core",
      claim: "A queued input stays pending until the session would otherwise become idle.",
      anchor: { kind: "symbol", path: "packages/core/src/session-v2/runner.ts", qualifiedPath: "session-v2/runner.ts::promoteQueued", lines: [143, 160], hash: hex("sub:queue") },
      emitted: { by: "jimmy", door: "atlas-emit", at: HEAD, when: "3 hours ago" }, origin: "mine · advisory arm",
      relations: [{ kind: "subsumed-by", key: "steer" }],
    }),
    f("coalesce", {
      family: "advisory", tier: "T2", freshness: "STALE", truth: "advisory", territory: "core",
      claim: "SessionRunCoordinator coalesces prompt wakeups for the same session.",
      anchor: { kind: "symbol", path: "packages/core/src/session-v2/coordinator.ts", qualifiedPath: "session-v2/coordinator.ts::SessionRunCoordinator", lines: [14, 58], hash: hex("sub:coalesce") },
      emitted: { by: "jimmy", door: "atlas-emit", at: BASE, when: "6 days ago" }, origin: "mine · advisory arm",
      relations: [],
    }),
    f("transition", {
      family: "transition", tier: "T1", seal: "proven", freshness: "FRESH", truth: "HOLDS", territory: "core",
      claim: "The drain loop moved from SessionPrompt.loop into SessionRunner between 3f7bfa5 and 6ea9383.",
      anchor: { kind: "file", path: "packages/core/src/session-v2/runner.ts", qualifiedPath: "session-v2/runner.ts", lines: [1, 212], hash: hex("sub:transition") },
      emitted: { by: "archie", door: "atlas-emit", at: HEAD, when: "2 days ago" }, ratified: { by: "orch", when: "2 days ago" },
      relations: [],
    }),
    f("vacuity", {
      family: "test-vacuity", tier: "T2", freshness: "FRESH", truth: "advisory", territory: "core",
      claim: "test/session/prompt.test.ts “admits once” asserts on a stub that cannot fail.",
      anchor: { kind: "block", path: "packages/core/test/session/prompt.test.ts", qualifiedPath: "prompt.test.ts::admits once", lines: [31, 47], hash: hex("sub:vacuity") },
      emitted: { by: "lucy", door: "atlas-emit", at: HEAD, when: "1 day ago" }, origin: "test-vacuity · assert-on-stub",
      relations: [{ kind: "depends-on", key: "admit" }],
    }),
    f("layers", {
      family: "relation", tier: "T1", seal: "proven", freshness: "FRESH", truth: "HOLDS", territory: "server",
      claim: "packages/server depends on packages/core, and core never depends on server.",
      anchor: { kind: "directory", path: "packages/server", qualifiedPath: "packages/server", lines: null, hash: hex("sub:layers") },
      emitted: { by: "backend", door: "atlas-emit", at: HEAD, when: "4 days ago" }, ratified: { by: "orch", when: "4 days ago" },
      relations: [{ kind: "depends-on", key: "clientneg" }],
    }),
    f("errors", {
      family: "predicate", tier: "T1", seal: "proven", freshness: "FRESH", truth: "HOLDS", territory: "server",
      claim: "Every public HttpApi endpoint declares explicit Schema.ErrorClass errors.",
      anchor: { kind: "directory", path: "packages/protocol/src/groups", qualifiedPath: "protocol/src/groups", lines: null, hash: hex("sub:errors") },
      emitted: { by: "backend", door: "atlas-emit", at: HEAD, when: "4 days ago" }, ratified: { by: "orch", when: "4 days ago" },
      relations: [],
    }),
    f("clientneg", {
      family: "negation", tier: "T1", seal: "proven", freshness: "FRESH", truth: "HOLDS", territory: "client", edgeModel: "import graph",
      claim: "Nothing in packages/client imports packages/core or packages/server.",
      anchor: { kind: "directory", path: "packages/client", qualifiedPath: "packages/client", lines: null, hash: hex("sub:clientneg") },
      emitted: { by: "backend", door: "atlas-emit", at: HEAD, when: "4 days ago" }, ratified: { by: "orch", when: "4 days ago" },
      relations: [{ kind: "depends-on", key: "layers" }],
    }),
    f("groups", {
      family: "predicate", tier: "T1", seal: "proven", freshness: "DRIFTED", truth: "BROKEN", territory: "client", drift: "semantic",
      claim: "Every Protocol group has a client name in packages/client/src/contract.ts.",
      anchor: { kind: "symbol", path: "packages/client/src/contract.ts", qualifiedPath: "client/src/contract.ts::groupNames", lines: [20, 55], hash: hex("sub:groups") },
      anchorNow: { qualifiedPath: "client/src/contract.ts::groupNames", lines: [20, 55], hash: hex("sub:groups2") },
      emitted: { by: "patty", door: "atlas-emit", at: BASE, when: "6 days ago" }, ratified: { by: "orch", when: "6 days ago" },
      before: { start: 52, lines: ["  \"server.actionsWorkflow\": \"actionsWorkflows\",", "  \"server.actionsRun\": \"actionsRuns\",", "} as const"] },
      after: { start: 52, lines: ["  \"server.actionsWorkflow\": \"actionsWorkflows\",", "} as const", "// server.actionsRun moved to splitGroups"] },
      relations: [],
    }),
    f("omni", {
      family: "predicate", tier: "T0", seal: "proven", freshness: "FRESH", truth: "HOLDS", territory: "omni",
      claim: "Only packages/core/src/omni.ts imports hugr-omni; every other spawn goes through it.",
      anchor: { kind: "file", path: "packages/core/src/omni.ts", qualifiedPath: "core/src/omni.ts", lines: [1, 96], hash: hex("sub:omni") },
      emitted: { by: "billy", door: "atlas-emit", at: HEAD, when: "8 days ago" }, ratified: { by: "gustavo", when: "8 days ago" },
      relations: [{ kind: "depends-on", key: "nospawn" }],
    }),
    f("nospawn", {
      family: "negation", tier: "T0", seal: "proven", freshness: "FRESH", truth: "HOLDS", territory: "omni", edgeModel: "import graph",
      claim: "Nothing outside the spawn allowlist imports child_process, cross-spawn or bun-pty.",
      anchor: { kind: "repo", path: ".", qualifiedPath: "repo", lines: null, hash: hex("sub:nospawn") },
      emitted: { by: "billy", door: "atlas-emit", at: HEAD, when: "8 days ago" }, ratified: { by: "gustavo", when: "8 days ago" },
      relations: [{ kind: "depends-on", key: "omni" }],
    }),
    f("units", {
      family: "advisory", tier: "T1", seal: "justified", freshness: "FRESH", truth: "advisory", territory: "relay",
      claim: "Archie anchors at most 8 knowledge units per plan (MAX_UNITS = 8).",
      anchor: { kind: "symbol", path: "packages/schema/src/atlas-knowledge.ts", qualifiedPath: "schema/src/atlas-knowledge.ts::MAX_UNITS", lines: [12, 12], hash: hex("sub:units") },
      emitted: { by: "archie", door: "atlas-emit", at: HEAD, when: "3 days ago" }, ratified: { by: "orch", when: "3 days ago" },
      relations: [],
    }),
    f("remount", {
      family: "advisory", tier: "T2", freshness: null, truth: "advisory", territory: "app",
      claim: "Chapter pages remount when the selected profile changes.",
      anchor: { kind: "symbol", path: "packages/app-shell/src/orchestra/chapter-route.tsx", qualifiedPath: "chapter-route.tsx::OrchestraChapterRoute", lines: [44, 98], hash: hex("sub:remount") },
      emitted: { by: "jimmy", door: "atlas-emit", at: HEAD, when: "5 hours ago" }, origin: "mine · advisory arm",
      relations: [],
    }),
  ]
  const byKey = Object.fromEntries(facts.map((x) => [x.key, x]))
  const keyOf = Object.fromEntries(["admit", "steer", "conflict", "wake", "stream", "queue", "coalesce", "transition", "vacuity", "layers", "errors", "clientneg", "groups", "omni", "nospawn", "units", "remount"].map((seed, i) => [seed, facts[i].key]))
  facts.forEach((x) => (x.relations = (x.relations ?? []).map((r) => ({ kind: r.kind, key: keyOf[r.key] }))))

  const abstentions = [
    { scope: "packages/orchestra/src/plugin", target: "@orchestra/core/session-v2", reason: "scope-dynamic", text: "Plugins load code at runtime, so “nothing here calls X” cannot be decided from the index." },
    { scope: "packages/app-shell", target: "window.api.spawn", reason: "target-unresolvable", text: "The target is a preload bridge the structural index cannot resolve to a definition." },
  ]

  const scopes = {
    "packages/core/src/session-v2": {
      territory: "core", role: "Durable prompt admission and the serialized Session runner (V2 core).", owner: "backend", tier: "T1",
      tokenEstimate: 1284, cap: 1500, advisoryDropped: 2,
      contains: ["prompt.ts", "runner.ts", "coordinator.ts", "execution.ts", "store.ts", "index.ts"],
      finer: ["packages/core/src/session-v2/prompt.ts", "packages/core/src/session-v2/runner.ts", "packages/core/src/session-v2/coordinator.ts", "packages/core/src/session-v2/execution.ts", "packages/core/src/session-v2/store.ts"],
      inv: [keyOf.admit, keyOf.conflict, keyOf.stream, keyOf.transition], gotcha: [keyOf.wake, keyOf.steer], advisory: [keyOf.queue, keyOf.coalesce, keyOf.vacuity],
      pull: [{ claim: "Session drains are process-local until clustering ships.", key: hex("key:pull1") }, { claim: "A batch of steers resets the provider-turn allowance once.", key: hex("key:pull2") }],
      dependent: 6,
    },
  }

  const blast = {
    unit: "packages/core/src/session-v2/prompt.ts",
    groups: [
      { distance: 1, nodes: [
        { path: "packages/core/src/session-v2/runner.ts", facts: 5, drifted: 1 },
        { path: "packages/core/src/session-v2/store.ts", facts: 3, drifted: 1 },
        { path: "packages/server/src/handlers/session.ts", facts: 2, drifted: 0 },
        { path: "packages/orchestra/src/session/prompt.ts", facts: 4, drifted: 0 },
      ] },
      { distance: 2, nodes: [
        { path: "packages/orchestra/src/claude-code/host/memory.ts", facts: 2, drifted: 0 },
        { path: "packages/orchestra/src/session/compaction.ts", facts: 3, drifted: 1 },
        { path: "packages/protocol/src/groups/session.ts", facts: 1, drifted: 0 },
        { path: "packages/client/src/generated/session.ts", facts: 0, drifted: 0 },
        { path: "packages/app-shell/src/pages/session/session-prompt.tsx", facts: 1, drifted: 0 },
        { path: "packages/orchestra/src/tool/task.ts", facts: 2, drifted: 0 },
      ] },
      { distance: 3, nodes: [
        { path: "packages/app-shell/src/components/prompt-input.tsx", facts: 0, drifted: 0 },
        { path: "packages/tui/src/session/composer.ts", facts: 1, drifted: 0 },
      ] },
    ],
  }

  const memory = {
    backend: {
      tokens: { awareness: 352, orientation: 188, rules: 431 },
      awareness: [
        { facet: "mission", state: "seeded", text: "Ship the V2 Session core without regressing durable admission." },
        { facet: "constitution", state: "seeded", text: "Schema → Core/Protocol → Server. Client never imports Core or Server." },
        { facet: "terrain", state: "drifted", text: "session-v2 store split moved admission; re-read store.ts before editing." },
        { facet: "ontology", state: "UN-SEEDED", text: "" },
        { facet: "taste", state: "seeded", text: "Inline single-use helpers; prefer early returns; no try/catch." },
      ],
      orientation: { goal: "Land the Atlas read projection for the chapter (W1).", last: "Drafted AtlasRead.Service port in core.", current: "Wiring the Protocol group server.atlasOwn.", state: "in progress · 2 of 5 steps" },
      rules: [
        ["Run bun typecheck from package directories, never tsc.", 0.94, "used 3h ago"],
        ["Never edit src/generated; run bun run generate in packages/client.", 0.9, "used 3h ago"],
        ["Effect: bind services before calling methods; no nested yields.", 0.82, "used 1d ago"],
        ["Spawn only through ChildProcessSpawner or Process.", 0.77, "used 2d ago"],
        ["Tests run through bun run test:ci, never locally.", 0.71, "used 2d ago"],
        ["Public JSON errors are explicit Schema.ErrorClass contracts.", 0.63, "used 4d ago"],
        ["Keep SessionExecution process-global and Session-ID based.", 0.55, "used 5d ago"],
        ["Never touch .atlas/ with file tools.", 0.49, "used 6d ago"],
        ["Prefer Schema.decodeUnknownOption over JSON.parse.", 0.38, "used 9d ago · decays in 19d"],
        ["Snake_case Drizzle fields.", 0.31, "used 12d ago · decays in 16d"],
        ["No star imports; no aliased imports.", 0.24, "used 15d ago · decays in 13d"],
        ["Branch names: at most three words, no slashes.", 0.18, "used 21d ago · decays in 7d"],
      ],
      recall: [
        { kind: "task", title: "Restore the Atlas fold after compaction", detail: "attempted: re-inject on compaction · failedWith: header lost on resume · lesson: restore before the first provider turn", at: "7dba2cbc" },
        { kind: "pr", title: "#658 Anchor Atlas knowledge for Archie and Relay", detail: "decisions: cap 8 units · reviewOutcomes: approved after Windows budget fix · knowledgeDelta: +6 facts", at: "cd8729a0" },
        { kind: "logbook", title: "Backend · session-v2 store split", detail: "shipped: admission moved to SessionStore · risks: delivery-mode retry semantics · openThreads: PromptConflict drift", at: HEAD },
      ],
    },
    jimmy: {
      tokens: { awareness: 290, orientation: 120, rules: 205 },
      awareness: [
        { facet: "mission", state: "seeded", text: "Find what is true about the code before anyone changes it." },
        { facet: "constitution", state: "seeded", text: "Mine candidates to staging; never promote on my own." },
        { facet: "terrain", state: "seeded", text: "Hot frontier: session-v2, relay authoring, app-shell chapters." },
        { facet: "ontology", state: "seeded", text: "Fact families: advisory, predicate, relation, negation, transition, test-vacuity." },
        { facet: "taste", state: "UN-SEEDED", text: "" },
      ],
      orientation: { goal: "Mine the app-shell chapter surface.", last: "Staged 14 advisory candidates.", current: "Waiting for review.", state: "blocked on ratification" },
      rules: [["Stay under the 200-site mine ceiling.", 0.88, "used 5h ago"], ["Quote evidence anchors for every candidate.", 0.81, "used 5h ago"], ["Abstain when the scope is dynamic.", 0.6, "used 2d ago"]],
      recall: [{ kind: "task", title: "Mine app-shell chapters", detail: "attempted: advisory arm over 41 sites · stoppedAt: budget 60% · lesson: skip generated i18n", at: HEAD }],
    },
    archie: {
      tokens: { awareness: 371, orientation: 201, rules: 388 },
      awareness: [
        { facet: "mission", state: "seeded", text: "Turn requests into plans anchored on Atlas knowledge." },
        { facet: "constitution", state: "seeded", text: "At most 8 units per plan; anchors are nodeKeys, not paths." },
        { facet: "terrain", state: "seeded", text: "Relay consumes anchors through relay-workflow-binding." },
        { facet: "ontology", state: "drifted", text: "Knowledge vs Memory split moved under CAMPAIGN-11." },
        { facet: "taste", state: "seeded", text: "Plans read as acceptance first, steps second." },
      ],
      orientation: { goal: "Plan the Atlas chapter W1 slice.", last: "Anchored 6 units.", current: "Reviewing drift on PromptConflict.", state: "in progress" },
      rules: [["Anchor with nodeKey; never with a content address.", 0.93, "used 2h ago"], ["Drop a unit rather than exceed MAX_UNITS.", 0.72, "used 1d ago"]],
      recall: [{ kind: "pr", title: "#664 Accept JSON-text anchor arguments", detail: "decisions: parse at the tool boundary · knowledgeDelta: none", at: "e7fa4e67" }],
    },
  }

  const history = [
    { day: "Today", items: [
      { tone: "warm", glyph: "drift", title: "4 facts drifted semantically", detail: "Detected by reconcile against merge-base 3f7bfa5", by: null, at: HEAD, when: "12 min ago" },
      { tone: "blue", glyph: "sparkle", title: "Jimmy staged 14 advisory candidates", detail: "mine · advisory arm · 41 sites · 0.6 of budget", by: "jimmy", at: HEAD, when: "3 h ago" },
      { tone: "good", glyph: "check", title: "Fact emitted: “A queued input stays pending…”", detail: "atlas-emit · T2 advisory · unratified", by: "jimmy", at: HEAD, when: "3 h ago", key: "queue" },
      { tone: "", glyph: "memory", title: "Backend wrote a task memory", detail: "atlas-memory-emit · task · Restore the Atlas fold after compaction", by: "backend", at: HEAD, when: "4 h ago", memory: true },
    ] },
    { day: "Yesterday", items: [
      { tone: "good", glyph: "check", title: "Fact ratified: “SessionExecution.wake is advisory…”", detail: "T1 · ratified by Maestro", by: "orch", at: HEAD, when: "1 d ago", key: "wake" },
      { tone: "blue", glyph: "link", title: "sameAs linked", detail: "“Prompts steer by default…” ≡ “SessionV2.prompt admits exactly one…”", by: "archie", at: HEAD, when: "1 d ago" },
      { tone: "", glyph: "history", title: "Fact superseded (v2 → v3)", detail: "“SessionV2.prompt admits exactly one…” re-grounded after the store split", by: "archie", at: HEAD, when: "2 d ago", key: "admit" },
    ] },
    { day: "Earlier", items: [
      { tone: "", glyph: "clock", title: "Rule decayed out of the injected set", detail: "Backend · “Prefer Bun.file over fs” · archived, never deleted", by: null, at: BASE, when: "9 d ago", memory: true },
      { tone: "good", glyph: "shield", title: "T0 ratified by Steward", detail: "“Only packages/core/src/omni.ts imports hugr-omni”", by: "gustavo", at: HEAD, when: "8 d ago", key: "omni" },
    ] },
  ]

  const health = {
    cas: { objects: 1320, referenced: 596, orphan: 724, corrupt: 0, unreadable: 0, missing: 0, sound: true },
    index: { builtAt: HEAD, head: HEAD, files: 4182, units: 31544, cold: "5.4 s", warm: "11 ms" },
    verify: { reproven: 612, broken: 4, unverifiable: 37, dangling: 4, ranAt: "12 min ago" },
    hotset: [["packages/core/src/session-v2", 41], ["packages/orchestra/src/maestro", 33], ["modules/relay/src/authoring", 18], ["packages/app-shell/src/orchestra", 12]],
  }

  const proposals = [
    { arm: "advisory", claim: "Chapter pages render ChapterEmpty when no profile is selected.", anchor: "chapter-route.tsx::OrchestraChapterRoute", sites: 3, refusal: null },
    { arm: "advisory", claim: "Actions persists only IDs and filters, never fetched data.", anchor: "chapters/actions.tsx::persisted", sites: 2, refusal: null },
    { arm: "dependency", claim: "app-shell/orchestra/atlas depends on @orchestra/client only.", anchor: "app-shell/src/orchestra", sites: 9, refusal: null },
    { arm: "count", claim: "The sidebar declares 20 navigation entries.", anchor: "orchestra/navigation.ts::navigation", sites: 1, refusal: "shape: count claims need an index-query check, not prose" },
    { arm: "advisory", claim: "Relay canvas wires never cross phase groups.", anchor: "relay/canvas.tsx", sites: 4, refusal: "truth: contradicted by relay/geometry.ts:212" },
  ]

  const ratify = [
    { kind: "T0", claim: "Desktop preload exposes no spawn capability to the renderer.", by: "billy", why: "T0 needs a human Steward. Billy supplied the security input.", anchor: "packages/desktop/src/preload/index.ts" },
    { kind: "T1", claim: "Every chapter page receives { server, directory } and nothing else.", by: "archie", why: "Governing tier; Maestro may ratify, Lucy may veto.", anchor: "chapter-route.tsx::ChapterPageProps" },
    { kind: "link", claim: "“A queued input stays pending…” ≡ “Queue delivery promotes one input at idle”", by: "archie", why: "sameAs edge through atlas-link. Retract appends; it never deletes.", anchor: "session-v2/runner.ts" },
  ]

  A.data = { semanticTotal: 4, mechanicalTotal: 37, HEAD, BASE, seats, territories, uncovered, facts, byKey, keyOf, abstentions, scopes, blast, memory, history, health, proposals, ratify }
})(window.Atlas)
