// The Own protocol (specs/hugr-maestro/own-protocol.md): Atlas turns what it knows about each unit of code into one
// fixed, verified skill file; Orchestra loads exactly those bytes, and anything missing or stale holds. Badges say
// how far each part is: Designed (spec only), Built (code exists), Runs (something actually calls it today).
;(function (A) {
  const M = () => A.m
  const R = () => A.m.R
  const SNAP = { snapshot: "genesis-own-v1", revision: "1a235323361717d13a44d3c184bad13649f59e60", unit: "packages/genesis", owner: "atlas-foundation", tier: "T1",
    blobs: [["packages/genesis/src/extract.ts", "c75db0d6"], ["packages/genesis/src/index.ts", "c8751049"], ["packages/genesis/src/types.ts", "7a5534c1"]],
    fact: ["genesis:deterministic-bootstrap", "Genesis builds deterministic structural state before governed fact seeding."], contentHash: "ffbb8d080afd5c48" }
  const badge = { D: ["Designed", ""], B: ["Built", "blue"], R: ["Runs", "good"] }
  const pill = (k) => `<span class="at-own-badge ${badge[k][1]}">${badge[k][0]}</span>`
  // own-artifact.ts:87 — base64url of the unit id: injective, so two units can never share a skill name.
  const b64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

  const STEPS = [
    { id: "know", actor: "Atlas", icon: "atlas", title: "Know", line: "Atlas composes each module's owner from its facts: role, terrain, ratified rules, traps, hints, what depends on it, which owner to ask next.", state: "R", detail: ["Composed from the index and the facts only: no model call, the same bytes every time.", "1,500 characters, ratified facts first, nothing dropped silently.", "The people named in it are whoever may write the module's group in policy.json."], code: "retrieval/src/own.ts:161 · adapter-io/src/own-source.ts:150" },
    { id: "review", actor: "A person", icon: "eye", title: "Review", line: "A maintainer reviews a snapshot of those owners as JSON before anything is published.", state: "D", detail: ["Nothing builds the reviewed JSON from the live store yet: today it is prepared by hand.", "Export refuses a fact that isn't up to date."], code: "retrieval/src/own-snapshot.ts:192" },
    { id: "publish", actor: "Materializer", icon: "download", title: "Publish", line: "A script checks the snapshot against the repository and writes one owner skill per module, plus a coverage list.", state: "R", detail: ["Refuses input from .atlas, a revision outside this branch's history, and any file whose bytes differ at that revision or now.", "Writes OWN-SNAPSHOT.json and .orchestra/skills/own/<id>/SKILL.md together, or nothing."], code: "scripts/materialize-own-snapshot.mjs:117" },
    { id: "guard", actor: "CI", icon: "shield", title: "Guard", line: "CI re-renders every skill and compares bytes and source files. Any difference is a HOLD.", state: "R", detail: ["own-snapshot-guard runs on epic pull requests and on demand.", "A changed source file turns the unit's skill stale."], code: "own-snapshot.ts:235 · .github/workflows/test.yml:129" },
    { id: "verify", actor: "Orchestra", icon: "lock", title: "Verify", line: "Before any agent reads, Orchestra re-reads the catalog and snapshot, checks the revision and every source file, and pins an identity.", state: "R", detail: ["About fifty named holds, each with its evidence; nine come with a next step.", "It re-reads everything a second time to catch a change in between."], code: "orchestra maestro/atlas-source.ts:53" },
    { id: "use", actor: "Maestro & agents", icon: "agents", title: "Use", line: "Maestro plans on exact unit IDs and records context that is GROUNDED. Agents load exactly those bytes.", state: "R", detail: ["The plan pins catalog, snapshot, revision and identity: if any changes, validation, review, approval and dispatch hold.", "Backend, Jimmy and Archie read with atlas_context; Archie can freeze up to 8 units for a work package."], code: "maestro/plan-revision.ts:153 · context-record.ts:106 · tool/atlas-context.ts:40" },
  ]
  const GHOST = [["Territory catalog", "Publishing the list of territories, owners and tiers. Built as a function; nothing calls it and no catalog file exists.", "B"], ["Impact on a pull request", "Which units a change touches and what depends on them, so a maintainer refreshes exactly those. Built, not wired.", "B"], ["Re-classification", "Moving a fact between Core, Ratified and Hint as a signed act.", "D"]]

  A.views.own = (state) => {
    const q = state.query
    const at = STEPS.find((s) => s.id === q.step) ?? STEPS[4]
    const edited = q.edit === "1"
    const href = (patch) => `#/own?${new URLSearchParams(Object.fromEntries(Object.entries({ u: q.u ?? "", step: at.id, edit: edited ? "1" : "", name: q.name ?? "", ...patch }).filter(([, v]) => v)))}`
    const illus = !!R().illustrated
    const units = M().snapshot.units
    const chain = [
      ["Source file", edited ? "Its bytes changed" : "Matches the snapshot", "artifacts-invalid"],
      ["Skill own_cGFja2…", edited ? "Held: the published owner no longer matches the code" : "Ready", "artifacts-invalid"],
      ["Plan WP-ATLAS-W1", edited ? "Held: made on an older owner" : "Grounded", "plan-grounding-stale"],
      ["Validation · review · approval · dispatch", edited ? "All held until the plan is recorded again" : "Open", "contextIsCurrent"],
    ]
    const name = q.name ?? "src/billing"
    const other = name.startsWith("src/") ? name.replace(/^src\//, "crates/") : `src/${name.split("/").at(-1)}`
    // One owner per unit: role from its first ratified rule (or the published summary), neighbours from the unit graph.
    const leafOf = (id) => (id === "(root)" ? "root" : id.split("/").at(-1))
    const ug = M().unitGraph()
    const owners = ug.units.filter((u) => u.id !== "(root)").map((u) => {
      const b = M().briefing(u.id)
      const published = units.includes(u.id)
      // A published owner says what its committed skill says, not what the live store would compose now.
      const pack = M().snapshot.packs[u.id]
      const gov = pack ? pack.invariants : b.gov
      return { id: u.id, leaf: leafOf(u.id), b, gov, files: u.files.size, rules: gov.length,
        role: M().snapshot.packs[u.id]?.summary ?? b.gov[0]?.claim ?? b.here[0]?.claim ?? "No facts yet.",
        uses: ug.edges.filter((e) => e.source === u.id).map((e) => e.target), usedBy: ug.edges.filter((e) => e.target === u.id).map((e) => e.source),
        people: M().packOwner(u.id),
        state: u.drifted && published ? ["Published · would hold: code changed", "warm"] : published ? ["Published", "good"] : u.drifted ? ["Not published · code changed", "warm"] : ["Not published yet", ""] }
    })
    const pick = owners.find((o) => o.id === q.u) ?? owners.find((o) => M().snapshot.packs[o.id]) ?? owners.find((o) => units.includes(o.id)) ?? owners[0]
    return {
      crumbs: [["Atlas", "#/overview"], ["Ownership"]],
      html: `<div class="at-page wide">
      <section class="at-gen-hero"><div><div class="mx-eyebrow">The engine · Ownership</div><h1>Every module gets an owner</h1><p>Atlas turns each module of your code into its owner: <code>own_auth</code>, <code>own_billing</code>, <code>own_genesis</code>. An owner is a skill that knows its module the way a senior engineer would: what it is for, which files it covers, the rules it must keep, the traps, what breaks when it changes, and which owner to ask next. When Maestro works in a module it hands the agent that owner, published and verified. If the owner is missing or out of date, the work holds; there is no fallback to search.</p></div></section>

      <div class="at-own-status">
        <div><span class="at-sdot ${units.length > 1 ? "good" : "warm"}"></span><b>${units.length} ${units.length === 1 ? "unit" : "units"} published</b><small>${units.map((u) => A.esc(u.split("/").at(-1))).join(", ")}${illus && units.length > 1 ? ' <span class="at-pill">example</span>' : ""}</small></div>
        <div><span class="at-sdot ${M().snapshot.catalog ? "good" : "warm"}"></span><b>Territory catalog</b><small>${M().snapshot.catalog ? 'present <span class="at-pill">example</span>' : "missing: no file exists yet"}</small></div>
        <div><span class="at-sdot ${illus ? "good" : "warm"}"></span><b>Orchestra</b><small>${illus ? 'connected <span class="at-pill">example</span>' : "not configured: every grounded read holds"}</small></div>
      </div>

      <section class="at-panel at-arch-block"><header class="at-panel-head"><div><h3>${A.icon("agents")}The owners of this repository</h3><small>One per module. Pick one to see what it knows and what it hands an agent.</small></div></header>
        <div class="at-owners">${owners.map((o) => `<a class="at-owner ${o.id === pick.id ? "on" : ""}" href="${href({ u: o.id })}"><div class="at-owner-top"><code>own_${A.esc(o.leaf)}</code><span class="at-sdot ${o.state[1]}"></span></div><p>${A.esc(o.role)}</p><small>${o.files} files · ${o.rules} rules · ${o.uses.length + o.usedBy.length} neighbours</small><small class="at-owner-state">${o.state[0]}</small></a>`).join("")}</div>
        <div class="at-owner-sheet">
          <div class="at-owner-main">
            <div class="at-owner-title"><code>own_${A.esc(pick.leaf)}</code><span class="at-pill">${pick.state[0]}</span></div>
            <p class="at-lead">${A.esc(pick.role)}</p>
            <div class="at-owner-secs">
              <div><h4>${A.icon("territory")}Terrain</h4><p><b>${A.esc(pick.id)}</b> · ${pick.files} files${pick.people.length ? ` · written by ${pick.people.map(A.esc).join(", ")}` : ""}</p></div>
              <div><h4>${A.icon("shield")}Rules it keeps</h4>${pick.gov.length ? pick.gov.slice(0, 4).map((x) => `<p>${A.tier(x.tier)} ${A.esc(x.claim)}</p>`).join("") : '<p class="muted">No ratified rules yet: everything it knows is a hint.</p>'}</div>
              <div><h4>${A.icon("drift")}Traps</h4>${pick.b.gotchas.length ? pick.b.gotchas.slice(0, 3).map((x) => `<p>${A.esc(x.claim)}</p>`).join("") : '<p class="muted">None ratified.</p>'}</div>
              <div><h4>${A.icon("info")}Hints</h4><p>${pick.b.adv.length} advisory facts, sent last and never more than 750 characters.</p></div>
            </div>
          </div>
          <div class="at-owner-side">
            <h4>Breaks if it changes</h4>${pick.usedBy.length ? pick.usedBy.map((u) => `<a class="at-owner-link" href="${href({ u })}">${A.icon("arrow")}own_${A.esc(leafOf(u))}</a>`).join("") : '<p class="muted">Nothing outside depends on it.</p>'}
            <h4>Asks next</h4>${pick.uses.length ? pick.uses.map((u) => `<a class="at-owner-link" href="${href({ u })}">${A.icon("arrow")}own_${A.esc(leafOf(u))}</a>`).join("") : '<p class="muted">It depends on no other module.</p>'}
            <div class="at-owner-task"><small>A task lands here</small><p>Maestro picks <code>own_${A.esc(pick.leaf)}</code> for the agent.${pick.usedBy.length ? ` Because ${pick.usedBy.length} ${pick.usedBy.length === 1 ? "module depends" : "modules depend"} on it, those owners are part of the impact.` : ""}${pick.uses.length ? ` To go deeper the agent follows its pointer to <code>own_${A.esc(leafOf(pick.uses[0]))}</code>, and nothing else.` : ""}</p></div>
          </div>
        </div>
        <p class="mx-note">Handles here are the module's last folder, as <code>atlas own</code> names them. The published file uses the whole path, encoded, so two modules both called billing can never share one; see “Names that can't collide” below.</p></section>

      <h2 class="at-own-h">How an owner stays true</h2>
      <ol class="at-own-flow">${STEPS.map((s, i) => `<li><a class="${s.id === at.id ? "on" : ""}" href="${href({ step: s.id })}"><span class="at-own-ic">${A.icon(s.icon)}</span><small>${s.actor}</small><b>${i + 1}. ${s.title}</b>${pill(s.state)}</a></li>`).join("")}</ol>
      <section class="at-own-detail"><div><h2>${A.icon(at.icon)}${at.title} <small>${at.actor}</small></h2><p class="at-lead">${at.line}</p><ul class="at-gen-facts">${at.detail.map((d) => `<li>${A.icon("checkc")}${A.esc(d)}</li>`).join("")}</ul>${A.tech([["Code", `<code>${A.esc(at.code)}</code>`]])}</div>
        <div class="at-own-ghost"><div class="at-gen-sample-k">${A.icon("info")}Planned around it</div>${GHOST.map(([t, d, s]) => `<div class="at-own-ghostrow"><b>${t}</b>${pill(s)}<p>${d}</p></div>`).join("")}</div></section>

      <div class="at-own-grid">
        <section class="at-panel"><header class="at-panel-head"><div><h3>${A.icon("drift")}One byte flips it to HOLD</h3><small>The published owner of ${SNAP.unit} is bound to its three source files.</small></div>${A.btn(edited ? "Undo the edit" : "Edit index.ts", "go", { value: href({ edit: edited ? "" : "1" }), primary: !edited, icon: edited ? "back" : "code" })}</header>
          <div class="at-panel-body">${SNAP.blobs.map(([f, h]) => { const changed = edited && f.endsWith("index.ts"); return `<div class="at-own-blob ${changed ? "bad" : ""}"><code class="at-mono">${A.esc(f.split("/").slice(1).join("/"))}</code><span class="grow"></span><code class="at-sha">${h}</code>${changed ? `${A.icon("arrow")}<code class="at-sha bad">3f9a1c07</code><span class="at-pill">simulated</span>` : A.icon("checkc", "good")}</div>` }).join("")}
            <div class="at-own-chain">${chain.map(([t, s, code], i) => `<div class="at-own-link ${edited ? "bad" : "good"}" style="animation-delay:${i * 120}ms"><span>${A.icon(edited ? "lock" : "checkc")}</span><div><b>${t}</b><small>${s}</small></div><code>${edited ? code : ""}</code></div>`).join("")}</div>
            ${edited ? `<p class="mx-note">To unblock: a maintainer re-materializes the snapshot, then Maestro records the plan again. ${A.esc(A.refusal("artifacts-invalid"))}.</p>` : ""}</div></section>

        <section class="at-panel"><header class="at-panel-head"><div><h3>${A.icon("hash")}Names that can't collide</h3><small>A skill is named after the whole unit path, encoded, not after its last folder.</small></div></header>
          <div class="at-panel-body"><label class="mx-field"><span>Unit</span><input id="own-name" value="${A.esc(name)}" data-own-name></label>
            <div class="at-own-names">
              <div><small>${A.esc(name)}</small><code>own_${A.esc(b64(name))}</code></div>
              <div><small>${A.esc(other)}</small><code>own_${A.esc(b64(other))}</code></div>
              <div class="bad"><small>Old leaf-only name, for both</small><code>own_${A.esc(name.split("/").at(-1))}</code><span>collides</span></div>
            </div>
            <p class="mx-note">The published unit packages/genesis is <code>own_${b64(SNAP.unit)}</code>.</p></div></section>
      </div>

      <section class="at-panel at-arch-block"><header class="at-panel-head"><div><h3>${A.icon("fact")}The owner file an agent loads</h3><small>Committed today at <code>.orchestra/skills/own/${b64(SNAP.unit)}/SKILL.md</code></small></div></header>
        <div class="at-own-skill">
          <div class="at-own-receipt"><div class="at-gen-sample-k">${A.icon("lock")}Receipt</div><dl class="at-kv">
            <dt>Snapshot</dt><dd>${SNAP.snapshot}</dd><dt>Revision</dt><dd><code class="at-sha">${SNAP.revision.slice(0, 12)}</code></dd><dt>Coverage</dt><dd>COMPLETE</dd>
            <dt>Source files</dt><dd>${SNAP.blobs.length}, each with its git blob</dd><dt>Facts</dt><dd><code>${SNAP.fact[0]}</code></dd><dt>Content hash</dt><dd><code class="at-sha">${SNAP.contentHash}</code></dd></dl></div>
          <div class="at-own-body">
            <h4>Role</h4><p>Genesis owns deterministic bootstrap and governed fact seeding.</p>
            <h4>Terrain</h4><p>Owner ${SNAP.owner} · Tier ${A.tier(SNAP.tier)} · ${SNAP.blobs.length} files</p>
            <h4>Governing facts</h4><p>${A.tier("T1")} ${A.esc(SNAP.fact[1])}</p>
            <h4>Advisory facts · Relations · Drill</h4><p class="muted">empty</p>
          </div></div>
        <p class="mx-note">This one unit is a curated example, not exported from the live store. ${A.help("OWN-SNAPSHOT.json holds packages/genesis with one T1 invariant the store doesn't have; coverage is written as COMPLETE rather than computed.")}</p></section>

      <section class="at-panel at-arch-block"><header class="at-panel-head"><div><h3>${A.icon("territory")}The people behind an owner</h3><small>The skill owns the module for agents. People decide what it may say: "owner" in Atlas also names four kinds of people, and only their group may write the module's facts.</small></div></header>
        <div class="at-own-owners">
          <div><b>Territory owner</b>${pill("B")}<p>Named in the territory catalog with the territory's tier. The catalog doesn't exist yet.</p></div>
          <div><b>Writer of its facts</b>${pill("R")}<p>Whoever may write the unit's group in policy.json. Who owns it is who may write it: one lookup.</p></div>
          <div><b>Suggested owner</b>${pill("B")}<p>From git blame, with an override. Built, nothing calls it.</p></div>
          <div><b>Seat by class</b>${pill("D")}<p>Archie plans, Backend builds, reviewers review, Jimmy discovers, Rosie maintains. A map in the docs; it grants no capability.</p></div>
        </div>
        <div class="at-own-tiers">${[["T0", "Core", "Must be right. Needs the ratifier name billy."], ["T1", "Ratified", "Load-bearing. Needs any approval key."], ["T2", "Hint", "The default. Advisory, nobody signed it."]].map(([t, w, d]) => `<div>${A.tier(t)}<p>${d}</p></div>`).join("")}</div>
        <div class="at-outside">${A.icon("shield")}<span><b>Authority comes from the fact, not the request.</b> Writing over a Core fact while declaring it a hint is refused: the class is read from what is already stored. The ratifier name is a guard against accidents, not a login; and the CODEOWNERS files under modules/atlas have no effect in this repository.</span></div></section>
      </div>`,
      after: () => {
        const input = document.querySelector("[data-own-name]")
        input?.addEventListener("change", () => A.go(href({ name: input.value.trim() || "src/billing" })))
      },
    }
  }
})(window.Atlas)
