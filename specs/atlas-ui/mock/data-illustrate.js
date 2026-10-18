// Illustrated mode (default): the real store plus what a working Atlas would hold after some stewardship, so
// every screen shows the product in use. Facts and claims stay real; what is added here is marked `example`:
// slot classification, ratified tiers, territories, seeded awareness, and memory for Archie and Jimmy.
// "Real store" in the top bar turns all of it off.
;(function (A) {
  let on = true
  try { on = localStorage.getItem("atlas-data") !== "real" } catch {}
  A.illustrated = on
  if (!on) return
  const R = A.real

  // Slot classification, the way genesis now classifies each mined fact into the closed vocabulary.
  const rules = [
    ["security-property", /secret|scrub|credential|leak|authori[sz]|unauthori|\btoken\b/i],
    ["perf-bound", /O\(|latency|budget|\bcap(ped|s)?\b|bounded|ceiling|at most \d/i],
    ["count", /exactly (one|two|three|four|five|six|seven|eight|nine|ten|\d+)|\b\d+ (entries|members|commands|files|tests|rows|slots|tools)/i],
    ["dependency", /\bimports?\b|depends on|re-export|before (it|the)|must run/i],
    ["definition", /\bmeans\b|is defined as|refers to|vocabulary/i],
    ["gotcha", /silently|despite|even though|although|unlike|\bbut\b|instead of/i],
    ["sideeffect", /\bwrites?\b|mutat|appends?|deletes?|stdout|stderr|exit(s)? (with )?(code )?[0-9]/i],
    ["ownership", /\bowner|\bowns\b|lifetime|concurren|\block\b/i],
    ["precondition", /must be|requires|only if|unless/i],
    ["postcondition", /\breturns?\b|yields|produces/i],
    ["contract", /signature|interface|type-only|\bexport/i],
    ["invariant", /\balways\b|\bevery\b|\bnever\b/i],
    ["rationale", /because|so that|in order to/i],
  ]
  R.facts.forEach((x) => {
    const hit = rules.find(([, re]) => re.test(x.claim))
    if (hit) Object.assign(x, { slot: hit[0], example: true })
  })

  // Ratification: two load-bearing facts per core package become T1 (Maestro ratified), and the clearest
  // secret-handling facts become T0, ratified by a person with Billy's security input.
  const core = ["packages/kernel", "packages/knowledge", "packages/grounding", "packages/retrieval", "packages/memory", "packages/index", "packages/persist", "packages/tools"]
  core.forEach((unit) => R.facts.filter((x) => x.file.startsWith(`${unit}/`) && !x.drift && ["invariant", "contract", "postcondition", "precondition"].includes(x.slot)).slice(0, 2)
    .forEach((x) => Object.assign(x, { tier: "T1", ratifiedBy: "maestro", example: true })))
  R.facts.filter((x) => x.slot === "security-property" && !x.drift && /persist|adapter-io|memory/.test(x.file)).slice(0, 3)
    .forEach((x) => Object.assign(x, { tier: "T0", ratifiedBy: "you", securityBy: "billy", example: true }))
  // Waiting for a decision: proposed for the governing band by a reviewer.
  R.facts.filter((x) => x.tier === "T2" && !x.drift && ["invariant", "ownership"].includes(x.slot) && /genesis|cli/.test(x.file)).slice(0, 4)
    .forEach((x, i) => Object.assign(x, { proposedTier: "T1", proposedBy: i % 2 ? "lucy" : "archie", example: true }))

  R.territories = [
    { name: "Identity & storage", owner: "backend", tier: "T0", globs: ["packages/kernel/**", "packages/persist/**", "packages/contracts/**"] },
    { name: "Knowledge lifecycle", owner: "backend", tier: "T1", globs: ["packages/knowledge/**", "packages/grounding/**"] },
    { name: "Retrieval & memory", owner: "archie", tier: "T1", globs: ["packages/retrieval/**", "packages/memory/**", "packages/index/**"] },
    { name: "Genesis", owner: "jimmy", tier: "T1", globs: ["packages/genesis/**"] },
    { name: "Product surface", owner: "backend", tier: "T1", globs: ["packages/cli/**", "packages/tools/**", "packages/mcp-server/**", "packages/adapter-io/**"] },
    { name: "Verification", owner: "lucy", tier: "T2", globs: ["packages/e2e/**", "packages/e2e-blackbox/**", "harness/**"] },
    { name: "Documentation", owner: "rosie", tier: "T2", globs: ["docs/**"] },
  ]
  R.awareness = [
    { facet: "mission", state: "seeded", source: "docs/design/product-definition.md", text: "Serve agents the currently-true, task-relevant, minimal slice of what the codebase knows, retrieved by structure, never by similarity." },
    { facet: "constitution", state: "seeded", source: "3 T0 facts", text: R.facts.filter((x) => x.tier === "T0").map((x) => x.claim.split(/[.;—]/)[0]).join(" · ") },
    { facet: "terrain", state: "seeded", source: "7 territories", text: "Identity & storage (T0, Backend) · Knowledge lifecycle · Retrieval & memory (Archie) · Genesis (Jimmy) · Product surface · Verification · Documentation" },
    { facet: "ontology", state: "seeded", source: `${R.facts.filter((x) => x.slot === "definition").length} definition facts`, text: "fact · unit · pack · band · tier · slot · anchor · drift · staging · door" },
    { facet: "taste", state: "seeded", source: "CONVENTIONS.md", text: "A claim carries its derivation, or it does not ship. Refusing beats guessing. A gate must be able to fail. Mutation-probe anything load-bearing. One file, one seam." },
  ]

  // Memory for the other bound members, shaped exactly like the live runs (task units, calls, checkpoints).
  const t0 = Date.UTC(2026, 9, 14, 9, 12)
  const iso = (min) => new Date(t0 + min * 60000).toISOString()
  const ms = (min) => t0 + min * 60000
  const say = (min, role, text, model = "claude-opus") => ({ role, model: role === "assistant" ? model : null, at: ms(min), tokens: role === "assistant" ? { in: 4200, out: 380, cache: 9100 } : { in: 0, out: 0, cache: 0 }, parts: [{ type: "text", text }] })
  const tool = (min, name, input, receipt) => ({ role: "assistant", model: "claude-opus", at: ms(min), tokens: { in: 900, out: 120, cache: 12000 }, parts: [{ type: "tool", tool: name, status: "completed", input, output: "", ...(receipt ? { receipt } : {}) }] })
  const task = (member, unit, title, start, steps, checkpoints, transcript) => ({ run: "example", example: true, member, unit, title, taskRef: `tsk_${unit.toLowerCase().replace(/[^a-z0-9]/g, "")}`, seatSession: `ses_${member}_${unit.toLowerCase().replace(/[^a-z0-9]/g, "")}`, maestroSession: "ses_maestro_example", steps, checkpoints, admissions: steps.filter((s) => s.kind === "resume").map((s) => ({ ok: true, residency: "admitted", unit, ref: { eventId: "c0ffee" + unit.length.toString(16).repeat(20) }, at: ms(start + s.offset + 1) })), transcript, diff: "" })
  const step = (kind, start, offset, len, packet, result) => ({ label: kind, kind, offset, start: iso(start + offset), end: iso(start + offset + len), model: "anthropic/claude-opus", packet, result })
  const ck = (min, entry, outcome = "admitted", refusal = null, reason = "") => ({ outcome, refusal, reason, ref: outcome === "admitted" ? `e${min.toString(16).padStart(4, "0")}`.repeat(8) : null, entry, at: ms(min) })

  A.spawns.push(
    task("archie", "WP-ATLAS-W1", "Plan the Atlas read projection (W1)", 0,
      [step("dispatch", 0, 0, 18, "Plan W1 of the Atlas chapter: the read projection. Anchor every unit on Own units. Record a plan revision and a task checkpoint before you return.", "Archie recorded plan revision 2: five work packages anchored on own_knowledge, own_retrieval and own_tools, with acceptance first."),
       step("resume", 0, 40, 6, "Resume WP-ATLAS-W1: quote your checkpoint's stoppedAt, then fold in Maestro's review: split WP-3 so the boundary entry lands first.", "Archie quoted the checkpoint and split WP-3 into the boundary entry and the server group."),
       step("continue", 0, 52, 14, "Continue: finish the revision and checkpoint the final shape.", "Plan revision 3 recorded; Maestro adopted it.")],
      [ck(17, { taskId: "WP-ATLAS-W1", attempted: ["Drafted 5 WPs anchored on own_knowledge, own_retrieval, own_tools", "Recorded plan revision 2"], failedWith: [], stoppedAt: "Revision 2 recorded; waiting for Maestro's review of WP-3 ordering.", lesson: "Anchor every work package on an Own unit; a raw path is not a plan anchor." }),
       ck(65, { taskId: "WP-ATLAS-W1", attempted: ["Split WP-3 into boundary entry and server group", "Recorded plan revision 3"], failedWith: [], stoppedAt: "Both phases complete: revision 3 adopted by Maestro; nothing left in this unit.", lesson: "Land the boundary entry before any server group that reads through it." })],
      [say(0, "user", "Plan W1 of the Atlas chapter: the read projection. Anchor every unit on Own units."), tool(2, "atlas_context", "{\"action\":\"catalog\"}"), tool(4, "atlas_context", "{\"action\":\"unit\",\"unit\":\"packages/knowledge\"}"), say(16, "assistant", "Revision 2: five WPs, acceptance first, each anchored on an Own unit."), tool(17, "atlas_memory_emit", "{\"entry\":{\"taskId\":\"WP-ATLAS-W1\",…}}", { op: "emit", outcome: "admitted" })]),
    task("archie", "WP-DRIFT-Q", "Plan the drift review queue", 120,
      [step("dispatch", 120, 0, 9, "Plan the drift review queue for Curation. Use the current catalog.", "Archie stopped: the Atlas source changed after its plan revision, so it held instead of planning on stale context.")],
      [ck(128, { taskId: "WP-DRIFT-Q", attempted: ["Loaded own_knowledge", "Drafted queue ordering by commit"], failedWith: ["AtlasContextHeld: plan-grounding-stale — the Atlas source changed after this plan revision"], stoppedAt: "Held before recording a revision; needs a fresh catalog read.", lesson: "After a merge, call maestro_catalog_context again before recording a revision." })],
      [say(120, "user", "Plan the drift review queue for Curation."), tool(122, "maestro_catalog_context", "{}"), say(127, "assistant", "Held: plan-grounding-stale. I will not plan on a catalog that changed under me."), tool(128, "atlas_memory_emit", "{\"entry\":{\"taskId\":\"WP-DRIFT-Q\",…}}", { op: "emit", outcome: "admitted" })]),
    task("jimmy", "MINE-RETRIEVAL", "Mine packages/retrieval", 300,
      [step("dispatch", 300, 0, 24, "Mine packages/retrieval with the advisory and dependency arms, symbol sites, budget 60.", "Jimmy staged 34 candidates and abstained on 6 sites with a dynamic scope.")],
      [ck(301, { taskId: "MINE-RETRIEVAL" }, "refused", "undetermined-kind", "MEM-5 kind derivation: no template matched the entry"),
       ck(323, { taskId: "MINE-RETRIEVAL", attempted: ["Ran advisory and dependency arms over 40 symbol sites"], failedWith: [], stoppedAt: "Both phases complete: 34 candidates staged, 6 abstained (scope-dynamic).", lesson: "Abstain when a folder loads code at runtime; never guess an absence." })],
      [say(300, "user", "Mine packages/retrieval with the advisory and dependency arms."), tool(305, "bash", "atlas mine packages/retrieval"), say(322, "assistant", "34 candidates staged; 6 sites abstained because the scope loads code at runtime.")]),
    task("jimmy", "DEF-ADR", "Turn docs/adr into definitions", 420,
      [step("dispatch", 420, 0, 12, "Read docs/adr and propose definition facts for the ontology facet. Phase 1 only: ADR-0001 to ADR-0008.", "Jimmy proposed 9 definitions from the first eight ADRs and stopped at the phase boundary.")],
      [ck(431, { taskId: "DEF-ADR", attempted: ["Proposed 9 definition facts from ADR-0001…0008"], failedWith: [], stoppedAt: "Phase 1 done; ADR-0009 onwards not started.", lesson: "One definition per ADR term; link it to the ADR rather than restating it." })],
      [say(420, "user", "Propose definition facts from docs/adr, phase 1 only."), say(430, "assistant", "Nine definitions proposed; stopping at ADR-0008 as the packet asks.")]),
  )

  A.illustrations = {
    indexed: {
      backend: [
        { rule: "Stop at the packet's phase boundary and checkpoint exactly where you stopped.", scope: "phased packets", unit: "T-LIVE-2", frecency: 1 },
        { rule: "Never write outside the dispatch writePaths; report the hold instead of retrying another path.", scope: "edit tools", unit: "T-LIVE-3", frecency: 0.5 },
        { rule: "Match the file's existing style before adding methods: no semicolons, no explicit return types.", scope: "counter.ts", unit: "T-LIVE-4", frecency: 0.25 },
      ],
      archie: [
        { rule: "Anchor every work package on an Own unit, never on a raw file path.", scope: "plans", unit: "WP-ATLAS-W1", frecency: 1 },
        { rule: "After a merge, call maestro_catalog_context again before recording a revision.", scope: "plan revisions", unit: "WP-DRIFT-Q", frecency: 0.5 },
        { rule: "Drop a unit rather than carry more than eight into one plan.", scope: "plans", unit: "WP-ATLAS-W1", frecency: 0.5 },
      ],
      jimmy: [{ rule: "Abstain when a folder loads code at runtime; never guess an absence.", scope: "mining", unit: "MINE-RETRIEVAL", frecency: 1 }],
    },
    archived: { backend: [{ rule: "Prefer Bun.file over fs for every read.", scope: "*", unit: "manual", frecency: 0.05 }] },
    prs: {
      archie: [{ prId: "#658", title: "Anchor Atlas knowledge for Archie and Relay", decisions: ["Cap a plan at 8 Own units", "Freeze unit bodies into the anchor by hash"], reviewOutcomes: ["Approved after the Windows time-budget fix"], knowledgeDelta: ["+6 facts in packages/retrieval", "1 fact superseded in packages/knowledge"] }],
      backend: [{ prId: "#664", title: "Accept JSON-text anchor arguments", decisions: ["Parse at the tool boundary, keep the schema strict"], reviewOutcomes: ["Approved, no changes"], knowledgeDelta: ["none"] }],
    },
  }
})(window.Atlas)
