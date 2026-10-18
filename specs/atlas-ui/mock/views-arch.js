// Architecture: Atlas as "open knowledge (OKF)" — the package layers, a write and a read walked through them,
// the files on disk, how identity is computed, and the portable bundle. Sources: modules/atlas ARCHITECTURE.md,
// docs/design/atlas.md:120 and the package code; numbers are measured on the standalone store (data-real.js).
;(function (A) {
  const M = () => A.m
  const R = () => A.m.R

  // The real package graph (each package.json), not the older diagram in ARCHITECTURE.md.
  const LAYERS = [
    { id: "contracts", level: "L0", loc: "0.5k", deps: [], what: "Shared types only: Hash, Tier, Freshness, Status, Pack, Tool. Every other package speaks these words.", key: ["Hash · SubtreeHash · NodeKey", "Tier T0 / T1 / T2", "Freshness FRESH / DRIFTED / STALE"] },
    { id: "kernel", level: "L1", loc: "1.7k", deps: ["contracts"], what: "The only place a hash is made. Canonical form, BLAKE3 identity, the content store, the event log and the open export.", key: ["id = BLAKE3(canonicalForm)", "content store (CAS)", "exportCas / importCas"] },
    { id: "persist", level: "L2", loc: "4.1k", deps: ["kernel"], what: "Provenance, secret scrubbing, transcripts and a read-only diff between versions.", key: ["scrub before store", "provenance per claim"] },
    { id: "index", level: "L2", loc: "5.0k", deps: ["kernel"], what: "The structural index: the file tree plus the code index (SCIP), seen three ways (where, who owns, what depends on what), Merkle-hashed.", key: ["subtreeHash per node", "reverse closure = blast radius", "spatial · territory · dependency"] },
    { id: "grounding", level: "L3", loc: "1.8k", deps: ["kernel", "index"], what: "The drift oracle and the truth gate: a fact holds only while the code it cites hashes the same.", key: ["FRESH iff subtreeHash matches", "gate only ever downgrades"] },
    { id: "knowledge", level: "L4", loc: "5.7k", deps: ["kernel", "index", "grounding"], what: "The fact lifecycle: identity keys, the write router, authorization, ratification, and edges derived on read.", key: ["DEDUP · CREATE · UPDATE · SUPERSEDE", "nodeKey per family", "sameAs · subsumes"] },
    { id: "retrieval", level: "L5", loc: "5.4k", deps: ["index", "knowledge"], what: "What an agent receives: bounded packs and the Own briefing, in a fixed order and budget.", key: ["own: 1,500 characters", "query: two bands", "nothing dropped silently"] },
    { id: "memory", level: "L6", loc: "4.6k", deps: ["knowledge", "retrieval"], what: "Per-member memory: task and PR checkpoints, project rules, the logbook, and the header sent on every request.", key: ["append-only log", "frecency ranking", "Awareness · Orientation · Rules"] },
    { id: "tools", level: "L7", loc: "6.0k", deps: ["persist", "grounding", "knowledge", "memory", "retrieval"], what: "One pure handler behind every command: six governance tools and three write doors (emit, link, memory-emit).", key: ["3 write doors", "reads carry no write authority"] },
    { id: "genesis", level: "L8", loc: "11.3k", deps: ["index", "knowledge", "memory"], what: "The cold-start miner: scan, rank by PageRank, ask a model one site at a time, admit mechanically into staging.", key: ["writes staging only", "every claim keeps its reasoning"] },
  ]
  const RING = [
    { id: "adapter-io", loc: "36k", what: "The composition root: filesystem, git, SCIP, the model, the disk store, and every governed door.", key: ["16 write gates", "generations by link(2)"] },
    { id: "cli", loc: "11.5k", what: "The atlas command: 32 commands, each printing status, next and invariant.", key: ["exit 0 · 1 · 2"] },
    { id: "mcp-server", loc: "1.4k", what: "The same verdicts over MCP for agents: 18 tools, byte-identical to the CLI.", key: ["stdio"] },
  ]
  const WRITE = [
    ["cli", "A claim arrives", "atlas emit, or atlas-emit over MCP, with the fact and the commit it was read at."],
    ["tools", "One handler", "The pure handler routes it to the emit door. Reads never reach this door."],
    ["adapter-io", "Sixteen gates", "Well-formed, addressable, matches the code, allowed for this group, the anchor's owner, the incumbent, approved. The first refusal stops it, with a reason."],
    ["grounding", "Matches the code?", "The cited code is re-hashed now. If it moved since the claim was read, the write is refused as ungrounded."],
    ["knowledge", "Route", "Same content: nothing to do. New place: create. Same place: merge the claim. Same check: supersede, keeping the lineage."],
    ["kernel", "Hash and store", "The fact is put in canonical form and hashed with BLAKE3. The bytes land in cas/ before anything points at them."],
    ["disk", "Publish a generation", `projection.${R?.()?.gen ? R().gen + 1 : "N+1"}.json is linked in atomically; a writer that loses the race retries; the last four generations stay.`],
  ]
  const READ = [
    ["cli", "A question", "atlas query <scope>, or own <unit> for a briefing."],
    ["adapter-io", "Can this store be trusted?", "A store tracked in git serves only machine-proven facts; one with tracked staging serves nothing."],
    ["kernel", "Re-hash on read", "Every object read from cas/ is hashed again. One that doesn't match its name is treated as missing."],
    ["grounding", "Still true?", "Each fact's anchor is compared with the code as it is now. FRESH holds; DRIFTED is served with its state, never as true."],
    ["retrieval", "Pack it", "Ratified facts first, then hints, inside a fixed budget; what doesn't fit is named, not dropped."],
    ["knowledge", "Derive edges", "Same-as and broader/narrower links are computed now, for this scope only. They are never stored."],
  ]
  const DISK = () => [
    ["cas/", `${A.num(R().casObjects)} objects · 5.2 MB`, "local", "One file per object, named by its own hash. Facts and the model answers behind them. Never overwritten, never deleted.", "emit commits, import", "every read, doctor, export"],
    [`projection.${R().gen}.json`, "596 rows · 471 KB", "local", "The current version: a map from each fact's identity to its content hash, plus the commit it was built at and the identity stamp.", "the governed doors only", "every read"],
    [`staging.${R().stagingGen}.json`, "660 rows · 570 KB", "never", "Mined suggestions waiting for review. Same shape as the projection. Never travels in git.", "atlas mine", "atlas promote"],
    ["policy.json", "3.8 KB", "git", "Who may write which group, which territory names suggest core, and anchor bindings. Edited by hand; a broken file closes every group.", "a person", "the write gates"],
    ["index.scip", "20.3 MB", "local", "The code index produced by scip-typescript. Atlas reads it; it never runs the indexer.", "the indexer", "index, genesis, verify-fact"],
    ["memory.jsonl", "not created yet", "git", "Member memory, append-only, one event per line, travelling with the branch.", "memory saves", "recall, the header"],
  ]
  const FAMILIES = [
    ["Stated", "advisory", "hash(anchor ‖ kind)", "A grounded sentence."],
    ["Tested", "predicate", "hash(anchor ‖ check ‖ kind)", "A sentence with an executable check."],
    ["Link", "relation", "hash(A ‖ depends-on ‖ B)", "A proven edge between two places."],
    ["Never calls", "negation", "hash(target ‖ scope)", "Nothing in a scope calls a target."],
    ["Code change", "transition", "hash(unit ‖ before ‖ after)", "What changed between two commits."],
    ["Hollow test", "test-vacuity", "hash(unit ‖ test)", "A test that cannot fail."],
  ]

  A.views.architecture = (state) => {
    const q = state.query
    const sel = q.pkg ?? "knowledge"
    const path = q.path === "read" ? READ : WRITE
    const step = Math.min(Number(q.step ?? 0), path.length - 1)
    const hot = path[step][0]
    const pkg = [...LAYERS, ...RING].find((p) => p.id === sel) ?? LAYERS[5]
    const deps = new Set(pkg.deps ?? [])
    const users = new Set(LAYERS.filter((l) => l.deps.includes(sel)).map((l) => l.id))
    const href = (patch) => `#/architecture?${new URLSearchParams(Object.fromEntries(Object.entries({ pkg: sel, path: q.path ?? "write", step, disk: q.disk ?? "", ...patch }).filter(([, v]) => v !== "" && v !== undefined)))}`
    const tile = (p) => `<a class="at-arch-tile ${p.id === sel ? "sel" : ""} ${deps.has(p.id) ? "dep" : ""} ${users.has(p.id) ? "use" : ""} ${p.id === hot ? "hot" : ""}" href="${href({ pkg: p.id })}"><span>${p.level ?? "ring"}</span><b>${p.id}</b><small>${p.loc} lines</small></a>`
    const rows = [["L8"], ["L7"], ["L6"], ["L5"], ["L4"], ["L3"], ["L2"], ["L1"], ["L0"]]
    const x = M().live().find((f) => f.why) ?? M().live()[0]
    const disk = DISK()
    const dsel = disk.find((d) => d[0] === q.disk) ?? disk[1]
    return {
      crumbs: [["Atlas", "#/overview"], ["Architecture"]],
      html: `<div class="at-page wide">
      <section class="at-gen-hero"><div><div class="mx-eyebrow">The engine · open knowledge (OKF)</div><h1>Architecture</h1><p>Atlas keeps knowledge open by construction: plain JSON named by its own hash, no database and no lock-in. The whole store exports to one file and rebuilds identically anywhere, and every claim says where it came from.</p></div></section>

      <div class="at-wow">${[["fingerprint", "Identity can't be forged", "Every object is named by the hash of its content. Change one byte and it's a different object; an import with one forged entry is refused whole."], ["drift", "Drift without line numbers", "Code is hashed as a Merkle tree. An edit elsewhere never touches a fact; a change to its code always does."], ["shield", "Truth is computed on read", "Whether a fact still holds is checked against today's code on every read, never stored. That's why freshness sits outside the hash."], ["stack", "No database", "A write publishes a new generation file atomically. Two writers can race; one wins, the other retries."]].map(([ic, t, p]) => `<div class="at-wow-card"><span>${A.icon(ic === "fingerprint" ? "hash" : ic)}</span><b>${t}</b><p>${p}</p></div>`).join("")}</div>

      <section class="at-arch">
        <div class="at-arch-stack">
          <div class="at-arch-col">${rows.map(([lv]) => `<div class="at-arch-row"><span class="at-arch-lv">${lv}</span>${LAYERS.filter((l) => l.level === lv).map(tile).join("")}</div>`).join("")}</div>
          <div class="at-arch-ring"><small>The ring: talks to the world</small>${RING.map(tile).join("")}<div class="at-arch-tile disk ${hot === "disk" ? "hot" : ""}"><span>disk</span><b>.atlas/</b><small>files below</small></div></div>
          <p class="at-hint">Dependencies only point down. <span class="lgk dep"></span>${A.esc(sel)} uses · <span class="lgk use"></span>uses ${A.esc(sel)}</p>
        </div>
        <div class="at-arch-side">
          <div class="at-arch-pkg"><div class="mx-eyebrow">${pkg.level ?? "ring"} · @atlas/${pkg.id}</div><h2>${pkg.id}</h2><p>${pkg.what}</p><ul>${pkg.key.map((k) => `<li>${A.esc(k)}</li>`).join("")}</ul>${pkg.deps?.length ? `<small>Uses ${pkg.deps.join(", ")}</small>` : ""}</div>
          <div class="at-arch-path">
            <div class="wf-range"><button aria-pressed="${path === WRITE}" data-action="go" data-value="${href({ path: "write", step: 0 })}">Watch a write</button><button aria-pressed="${path === READ}" data-action="go" data-value="${href({ path: "read", step: 0 })}">Watch a read</button></div>
            <ol>${path.map(([p, t], i) => `<li class="${i === step ? "on" : i < step ? "done" : ""}"><a href="${href({ step: i })}"><span>${i + 1}</span><b>${t}</b><code>${p}</code></a></li>`).join("")}</ol>
            <div class="at-arch-step"><b>${path[step][1]}</b><p>${path[step][2]}</p><div>${step ? A.btn("Back", "go", { value: href({ step: step - 1 }), icon: "back" }) : ""}${step < path.length - 1 ? A.btn("Next", "go", { value: href({ step: step + 1 }), primary: true, icon: "arrow" }) : A.btn("Start over", "go", { value: href({ step: 0 }), icon: "refresh" })}</div></div>
          </div>
        </div>
      </section>

      <section class="at-panel at-arch-block"><header class="at-panel-head"><div><h3>${A.icon("folder")}On disk: <code>.atlas/</code></h3><small>Everything Atlas keeps, as plain files. Sizes measured on the standalone Atlas repository.</small></div></header>
        <div class="at-disk">${disk.map(([name, size, git]) => `<a class="at-disk-file ${name === dsel[0] ? "sel" : ""}" href="${href({ disk: name })}"><code>${A.esc(name)}</code><small>${A.esc(size)}</small><span class="at-disk-git ${git}">${git === "git" ? "travels in git" : git === "never" ? "never in git" : "stays local"}</span></a>`).join("")}</div>
        <div class="at-disk-detail"><p>${dsel[3]}</p><dl class="at-kv"><dt>Written by</dt><dd>${dsel[4]}</dd><dt>Read by</dt><dd>${dsel[5]}</dd></dl></div></section>

      <section class="at-panel at-arch-block"><header class="at-panel-head"><div><h3>${A.icon("hash")}Identity</h3><small>Three hashes answer three questions. Shown for a real fact from this store.</small></div>${A.btn("Open the fact", "open-fact-page", { value: x.key })}</header>
        <div class="at-ids">
          <div class="at-id"><span>What is it?</span><b>contentHash</b><code>${A.esc(x.hash.slice(0, 24))}…</code><p>BLAKE3 of the fact in canonical form: sorted keys, normalized text, no decimals. Its address in cas/. The same content twice is one object.</p></div>
          <div class="at-id"><span>Which fact is it?</span><b>nodeKey</b><code>${A.esc(x.key.slice(0, 24))}…</code><p>A hash of where and what kind, not of the wording. Rewording a fact at the same place updates it instead of making a new one.</p></div>
          <div class="at-id"><span>Does its code still match?</span><b>subtreeHash</b><code>${A.esc(x.subtree)}</code><p>A Merkle hash of the code under the anchor (${A.esc(x.file)}). An edit re-hashes only the path from that file to the root.</p></div>
        </div>
        <div class="at-outside">${A.icon("info")}<span><b>Outside every hash: grounding, status and freshness.</b> They are recomputed each time. If they were inside, every code change would mint a "new" fact and lose its history.</span></div>
        <table class="at-grid at-fam"><thead><tr><th>Family</th><th>Identity</th><th>What it says</th></tr></thead><tbody>${FAMILIES.map(([w, f, k, d]) => `<tr><th><span data-tip="${f}">${w}</span></th><td><code>${A.esc(k)}</code></td><td>${d}</td></tr>`).join("")}</tbody></table>
        ${A.tech([["Stamp", "every generation carries <code>atlas-identity-2026-08-02</code>; a store stamped otherwise is refused on writes"], ["Code", "<code>kernel/src/canonical.ts</code> · <code>knowledge/src/write/router.ts:355</code> · <code>index/src/rollup.ts:36</code>"]])}</section>

      <section class="at-panel at-arch-block"><header class="at-panel-head"><div><h3>${A.icon("download")}Portable: <code>atlas-okf.json</code></h3><small>One file holds every object. It replays 1:1 into an empty store anywhere.</small></div>${A.btn("Export", "toast", { value: "Writes atlas-okf.json with every stored object.", icon: "download" })}</header>
        <div class="at-okf-flow">
          <div class="at-okf-box"><b>cas/</b><small>${A.num(R().casObjects)} objects</small></div>${A.icon("arrow")}
          <div class="at-okf-box file"><b>atlas-okf.json</b><small>{ format, version 1, objects }</small></div>${A.icon("arrow")}
          <div class="at-okf-box"><b>empty store</b><small>every key re-hashed</small></div>${A.icon("arrow")}
          <div class="at-okf-box dim"><b>projection</b><small>empty until each fact passes the checks again</small></div>
        </div>
        <p class="mx-note">All or nothing: if one entry's name doesn't match its content, the whole bundle is refused, so a bundle can't quietly change or hide a fact. Memory has its own format (atlas-okf-mem), built but not exposed by any command yet.</p></section>
      </div>`,
    }
  }
})(window.Atlas)
