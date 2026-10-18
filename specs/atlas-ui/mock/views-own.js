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
    { id: "know", actor: "Atlas", icon: "atlas", title: "Know", line: "Atlas composes a briefing per unit from its facts: role, owner, ratified facts, hints, what depends on it, where to drill.", state: "R", detail: ["Composed from the index and the facts only: no model call, the same bytes every time.", "1,500 characters, ratified facts first, nothing dropped silently.", "The owner shown is whoever may write the unit's group in policy.json."], code: "retrieval/src/own.ts:161 · adapter-io/src/own-source.ts:150" },
    { id: "review", actor: "A person", icon: "eye", title: "Review", line: "A maintainer reviews a snapshot of those briefings as JSON before anything is published.", state: "D", detail: ["Nothing builds the reviewed JSON from the live store yet: today it is prepared by hand.", "Export refuses a fact that isn't up to date."], code: "retrieval/src/own-snapshot.ts:192" },
    { id: "publish", actor: "Materializer", icon: "download", title: "Publish", line: "A script checks the snapshot against the repository and writes one skill file per unit, plus a coverage list.", state: "R", detail: ["Refuses input from .atlas, a revision outside this branch's history, and any file whose bytes differ at that revision or now.", "Writes OWN-SNAPSHOT.json and .orchestra/skills/own/<id>/SKILL.md together, or nothing."], code: "scripts/materialize-own-snapshot.mjs:117" },
    { id: "guard", actor: "CI", icon: "shield", title: "Guard", line: "CI re-renders every skill and compares bytes and source files. Any difference is a HOLD.", state: "R", detail: ["own-snapshot-guard runs on epic pull requests and on demand.", "A changed source file turns the unit's skill stale."], code: "own-snapshot.ts:235 · .github/workflows/test.yml:129" },
    { id: "verify", actor: "Orchestra", icon: "lock", title: "Verify", line: "Before any agent reads, Orchestra re-reads the catalog and snapshot, checks the revision and every source file, and pins an identity.", state: "R", detail: ["About fifty named holds, each with its evidence; nine come with a next step.", "It re-reads everything a second time to catch a change in between."], code: "orchestra maestro/atlas-source.ts:53" },
    { id: "use", actor: "Maestro & agents", icon: "agents", title: "Use", line: "Maestro plans on exact unit IDs and records context that is GROUNDED. Agents load exactly those bytes.", state: "R", detail: ["The plan pins catalog, snapshot, revision and identity: if any changes, validation, review, approval and dispatch hold.", "Backend, Jimmy and Archie read with atlas_context; Archie can freeze up to 8 units for a work package."], code: "maestro/plan-revision.ts:153 · context-record.ts:106 · tool/atlas-context.ts:40" },
  ]
  const GHOST = [["Territory catalog", "Publishing the list of territories, owners and tiers. Built as a function; nothing calls it and no catalog file exists.", "B"], ["Impact on a pull request", "Which units a change touches and what depends on them, so a maintainer refreshes exactly those. Built, not wired.", "B"], ["Re-classification", "Moving a fact between Core, Ratified and Hint as a signed act.", "D"]]

  A.views.own = (state) => {
    const q = state.query
    const at = STEPS.find((s) => s.id === q.step) ?? STEPS[4]
    const edited = q.edit === "1"
    const href = (patch) => `#/own?${new URLSearchParams(Object.fromEntries(Object.entries({ step: at.id, edit: edited ? "1" : "", name: q.name ?? "", ...patch }).filter(([, v]) => v)))}`
    const illus = !!R().illustrated
    const units = M().snapshot.units
    const chain = [
      ["Source file", edited ? "Its bytes changed" : "Matches the snapshot", "artifacts-invalid"],
      ["Skill own_cGFja2…", edited ? "Held: the published briefing no longer matches" : "Ready", "artifacts-invalid"],
      ["Plan WP-ATLAS-W1", edited ? "Held: made on older briefings" : "Grounded", "plan-grounding-stale"],
      ["Validation · review · approval · dispatch", edited ? "All held until the plan is recorded again" : "Open", "contextIsCurrent"],
    ]
    const name = q.name ?? "src/billing"
    const other = name.startsWith("src/") ? name.replace(/^src\//, "crates/") : `src/${name.split("/").at(-1)}`
    return {
      crumbs: [["Atlas", "#/overview"], ["Own protocol"]],
      html: `<div class="at-page wide">
      <section class="at-gen-hero"><div><div class="mx-eyebrow">The engine · how agents get context</div><h1>Own protocol</h1><p>Every unit of code gets one fixed, verified briefing. Maestro plans on exact units and agents load exactly those bytes. If anything is missing, stale or ambiguous, the work holds. There is no fallback to search.</p></div></section>

      <div class="at-own-status">
        <div><span class="at-sdot ${units.length > 1 ? "good" : "warm"}"></span><b>${units.length} ${units.length === 1 ? "unit" : "units"} published</b><small>${units.map((u) => A.esc(u.split("/").at(-1))).join(", ")}${illus && units.length > 1 ? ' <span class="at-pill">example</span>' : ""}</small></div>
        <div><span class="at-sdot ${M().snapshot.catalog ? "good" : "warm"}"></span><b>Territory catalog</b><small>${M().snapshot.catalog ? 'present <span class="at-pill">example</span>' : "missing: no file exists yet"}</small></div>
        <div><span class="at-sdot ${illus ? "good" : "warm"}"></span><b>Orchestra</b><small>${illus ? 'connected <span class="at-pill">example</span>' : "not configured: every grounded read holds"}</small></div>
      </div>

      <ol class="at-own-flow">${STEPS.map((s, i) => `<li><a class="${s.id === at.id ? "on" : ""}" href="${href({ step: s.id })}"><span class="at-own-ic">${A.icon(s.icon)}</span><small>${s.actor}</small><b>${i + 1}. ${s.title}</b>${pill(s.state)}</a></li>`).join("")}</ol>
      <section class="at-own-detail"><div><h2>${A.icon(at.icon)}${at.title} <small>${at.actor}</small></h2><p class="at-lead">${at.line}</p><ul class="at-gen-facts">${at.detail.map((d) => `<li>${A.icon("checkc")}${A.esc(d)}</li>`).join("")}</ul>${A.tech([["Code", `<code>${A.esc(at.code)}</code>`]])}</div>
        <div class="at-own-ghost"><div class="at-gen-sample-k">${A.icon("info")}Planned around it</div>${GHOST.map(([t, d, s]) => `<div class="at-own-ghostrow"><b>${t}</b>${pill(s)}<p>${d}</p></div>`).join("")}</div></section>

      <div class="at-own-grid">
        <section class="at-panel"><header class="at-panel-head"><div><h3>${A.icon("drift")}One byte flips it to HOLD</h3><small>The published briefing for ${SNAP.unit} is bound to its three source files.</small></div>${A.btn(edited ? "Undo the edit" : "Edit index.ts", "go", { value: href({ edit: edited ? "" : "1" }), primary: !edited, icon: edited ? "back" : "code" })}</header>
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

      <section class="at-panel at-arch-block"><header class="at-panel-head"><div><h3>${A.icon("fact")}The skill file an agent loads</h3><small>Committed today at <code>.orchestra/skills/own/${b64(SNAP.unit)}/SKILL.md</code></small></div></header>
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

      <section class="at-panel at-arch-block"><header class="at-panel-head"><div><h3>${A.icon("territory")}Who owns what</h3><small>"Owner" means four different things. Reads are open to everyone; writes belong to the owner's group.</small></div></header>
        <div class="at-own-owners">
          <div><b>Territory owner</b>${pill("B")}<p>Named in the territory catalog with the territory's tier. The catalog doesn't exist yet.</p></div>
          <div><b>Briefing owner</b>${pill("R")}<p>Whoever may write the unit's group in policy.json. Who owns it is who may write it: one lookup.</p></div>
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
