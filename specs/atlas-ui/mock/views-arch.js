// Architecture: Atlas's "open knowledge (OKF)" design, one chapter at a time.
//   Overview  — one picture: what comes in, the door, the store, what goes out (play a write or a read)
//   Write     — a write step by step: the four checks and their sixteen gates, the router, the commit
//   Read      — a read step by step: trust, re-hash, still true?, pack, derived edges
//   Store     — every file in .atlas/: shape, who writes, who reads, whether it travels in git
//   Identity  — the three hashes on a real fact, what stays outside them, the six fact families
//   Packages  — the layers, clickable, with what each one uses and is used by
//   Portable  — atlas-okf.json: export, import and its rules
// Sources: modules/atlas ARCHITECTURE.md, docs/design/atlas.md:120, the package code; sizes measured on the
// standalone store (data-real.js).
;(function (A) {
  const M = () => A.m
  const R = () => A.m.R
  const CHAPTERS = [["overview", "Overview", "eye"], ["write", "Write", "play"], ["read", "Read", "search"], ["store", "Store", "folder"], ["identity", "Identity", "hash"], ["packages", "Packages", "stack"], ["portable", "Portable", "download"]]

  /* ---------- Overview: one picture ---------- */
  const BOX = () => ({
    code: { zone: "in", icon: "code", title: "Your code", sub: "the repository, in git", what: "Atlas never copies your code. It reads it, hashes it, and keeps the hash next to every fact.", term: "source tree", go: "identity" },
    index: { zone: "in", icon: "graph", title: "Code index", sub: "who uses what", what: "A map of every symbol and reference, built by scip-typescript. Atlas reads it to know what depends on what.", term: ".atlas/index.scip", go: "store" },
    author: { zone: "in", icon: "agents", title: "A writer", sub: "Genesis, an agent or you", what: "Something proposes a fact: one sentence about one place in the code. Genesis can only propose.", term: "atlas emit · atlas promote", go: "write" },
    door: { zone: "door", icon: "shield", title: "The door", sub: "4 checks, 16 gates", what: "Every write passes the same checks: well-formed, still true, allowed, approved. The first that fails stops it and says why.", term: "shape → truth → authz → ratify", go: "write" },
    facts: { zone: "store", icon: "fact", title: "Facts", sub: `${A.num(R().casObjects)} objects`, what: "Each fact is a small JSON file named by the hash of its content. Nothing is overwritten or deleted.", term: "cas/", go: "store" },
    current: { zone: "store", icon: "stack", title: "Current version", sub: `version ${R().gen} · ${A.num(M().facts.length)} facts`, what: "One file says which fact is current for each place. Every write publishes a new version; the last four stay.", term: `projection.${R().gen}.json`, go: "store" },
    waiting: { zone: "store", icon: "inbox", title: "Waiting", sub: `${A.num(R().candidates.length + M().facts.length)} suggestions`, what: "What Genesis proposed and nobody accepted yet. Agents never see it.", term: `staging.${R().stagingGen}.json`, go: "store" },
    check: { zone: "out", icon: "drift", title: "Still true?", sub: "checked on every read", what: "Before anything is served, each fact's code is hashed again and compared. If it moved, the fact is marked changed, never served as true.", term: "drift oracle · truth gate", go: "read" },
    brief: { zone: "out", icon: "agents", title: "Briefings", sub: "what agents get", what: "Ratified facts, then pointers, then hints, in 1,500 characters. Nothing dropped silently.", term: "own · query", go: "read" },
    export: { zone: "out", icon: "download", title: "One file", sub: "atlas-okf.json", what: "The whole store exports to one plain JSON file and rebuilds identically anywhere.", term: "export · import", go: "portable" },
  })
  const PLAY = {
    write: [["author", "A writer proposes one sentence about one place in the code."], ["door", "It goes through the door: well-formed, still true, allowed, approved."], ["code", "To check \"still true\", the code it cites is hashed again, now."], ["facts", "It's stored as a file named by its own hash."], ["current", "A new version is published that points at it."]],
    read: [["brief", "An agent asks about a unit."], ["current", "Atlas looks up the current facts for that unit."], ["facts", "Each fact is read and re-hashed; a damaged one counts as missing."], ["check", "Each fact's code is compared with today's code."], ["brief", "What still holds is packed into the briefing."]],
  }
  const overview = (q) => {
    const boxes = BOX()
    const box = (id) => { const b = boxes[id]; return `<button class="at-ax-box ${b.zone}" data-ax="${id}" data-action="ax-box" data-value="${id}"><span class="at-ax-ic">${A.icon(b.icon)}</span><span><b>${b.title}</b><small>${b.sub}</small></span></button>` }
    return `<div class="at-ch-intro"><p>Plain files named by their own content, one door every write must pass, and a check against your code on every read. Click a box, or play a write or a read.</p><div>${A.btn("Play a write", "ax-play", { value: "write", primary: true, icon: "play" })}${A.btn("Play a read", "ax-play", { value: "read", icon: "play" })}</div></div>
      <section class="at-ax">
        <div class="at-ax-col"><div class="at-ax-label">Comes in</div>${box("code")}${box("index")}${box("author")}</div>
        <div class="at-ax-arrow">${A.icon("arrow")}</div>
        <div class="at-ax-col narrow"><div class="at-ax-label">The door</div>${box("door")}<div class="at-ax-gates">${["Well-formed", "Still true", "Allowed", "Approved"].map((g, i) => `<span><i>${i + 1}</i>${g}</span>`).join("")}</div></div>
        <div class="at-ax-arrow">${A.icon("arrow")}</div>
        <div class="at-ax-col store"><div class="at-ax-label">The store · <code>.atlas/</code></div>${box("facts")}${box("current")}${box("waiting")}</div>
        <div class="at-ax-arrow">${A.icon("arrow")}</div>
        <div class="at-ax-col"><div class="at-ax-label">Goes out</div>${box("check")}${box("brief")}${box("export")}</div>
      </section>
      <div class="at-ax-caption" id="ax-caption"><span class="muted">Click any box to see what it is, and jump to its chapter.</span></div>
      <div class="at-wow">${[["hash", "Identity can't be forged", "Every object is named by the hash of its content. Change one byte and it's a different object.", "identity"], ["drift", "Drift without line numbers", "Code is hashed as a tree. An edit elsewhere never touches a fact; a change to its code always does.", "identity"], ["shield", "Truth is computed on read", "Whether a fact holds is checked against today's code on every read, never stored.", "read"], ["stack", "No database", "A write publishes a new version file atomically. Two writers can race; one wins, the other retries.", "write"]].map(([ic, t, p, ch]) => `<a class="at-wow-card" href="#/architecture?ch=${ch}"><span>${A.icon(ic)}</span><b>${t}</b><p>${p}</p><small>See how ${A.icon("arrow")}</small></a>`).join("")}</div>`
  }

  /* ---------- Write: step by step ---------- */
  const WRITE = [
    { t: "A claim arrives", who: "cli · mcp-server", body: "<p><code>atlas emit</code>, or the <code>atlas-emit</code> MCP tool, with the fact and the commit it was read at. Genesis writes nowhere but staging; <code>atlas promote</code> sends each staged row through this same door.</p>" },
    { t: "One handler", who: "tools", body: "<p>A single pure handler routes it to one of three write doors: <b>emit</b> (facts), <b>link</b> (same-as) and <b>memory-emit</b>. Reads never reach a door.</p>" },
    { t: "The four checks", who: "adapter-io", body: `<p>Sixteen gates, grouped in four checks. The first refusal stops the write and names the reason; nothing is repaired silently.</p><div class="at-gates4">${[["Well-formed", "shape", ["has a claim, tier, scope and family", "addressable: its anchor resolves", "grounding is well-formed", "kind is one of the 13"]], ["Still true", "truth", ["the cited code hashes the same now", "otherwise: ungrounded"]], ["Allowed", "authz", ["the writer holds this group", "the group owns this anchor", "the incumbent's class is respected (no downgrade, no relocation)"]], ["Approved", "ratify", ["a hint passes alone when grounded, trusted and uncontested", "Ratified needs an approval key", "Core needs the ratifier name billy"]]].map(([n, g, items], i) => `<div class="at-gate4"><span>${i + 1}</span><b>${n}</b><code>${g}</code><ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul></div>`).join("")}</div>` },
    { t: "Route", who: "knowledge", body: `<p>Atlas decides what the write means by comparing it with what's stored.</p><div class="at-routes">${[["Same content", "DEDUP", "Nothing to do: the exact fact is already stored."], ["New place", "CREATE", "No fact at this place and kind yet: a new one."], ["Same place", "UPDATE", "A hint at the same place: the new sentence joins the old one."], ["Same check", "SUPERSEDE", "A tested fact with the same check: replaced, keeping the lineage."]].map(([w, k, d]) => `<div><b>${w}</b><code>${k}</code><p>${d}</p></div>`).join("")}</div><p class="muted">Which of the four happened is not returned to the writer; <code>atlas draft</code> previews CREATE or UPDATE.</p>` },
    { t: "Hash and store", who: "kernel", body: "<p>The fact is put in canonical form (sorted keys, normalized text, no decimals) and hashed with BLAKE3. The bytes are written to <code>cas/&lt;first two&gt;/&lt;hash&gt;</code> <b>before</b> anything points at them.</p>" },
    { t: "Publish a version", who: "disk", body: `<p><code>projection.${R().gen + 1}.json</code> is linked in atomically (<code>link(2)</code>): if another writer got there first, this one retries, up to 64 times. The mirror <code>projection.json</code> is updated and only the last four versions are kept.</p>` },
  ]
  /* ---------- Read: step by step ---------- */
  const READ = [
    { t: "A question", who: "cli · mcp-server", body: "<p><code>atlas query &lt;scope&gt;</code> for facts, <code>atlas own &lt;unit&gt;</code> for a briefing.</p>" },
    { t: "Can this store be trusted?", who: "adapter-io", body: `<div class="at-routes three">${[["Local", "trusted", "Reads and writes work."], ["In git, read-only", "tracked-provable", "Only machine-proven facts that re-prove are served; writes are refused."], ["In git, locked", "tracked-staging", "Everything is refused."]].map(([w, k, d]) => `<div><b>${w}</b><code>${k}</code><p>${d}</p></div>`).join("")}</div><p class="muted">This store is <b>${M().provenance()}</b>.</p>` },
    { t: "Re-hash on read", who: "kernel", body: "<p>Every object read from <code>cas/</code> is hashed again. One whose content doesn't match its name is treated as missing, never served.</p>" },
    { t: "Still true?", who: "grounding", body: "<p>Each fact's anchor is compared with the code as it is now. <b>FRESH</b> holds; <b>DRIFTED</b> is served with its state, never as true. The gate can only downgrade, and running it twice changes nothing.</p>" },
    { t: "Pack it", who: "retrieval", body: "<p><b>own</b>: ratified facts first, then pointers to finer units, then hints, inside 1,500 characters (hints at most 750). <b>query</b>: a ratified band and a hint band. What doesn't fit is named, not dropped. <a class=\"mx-link\" href=\"#/how?step=3\">Watch one being built</a></p>" },
    { t: "Derive edges", who: "knowledge", body: "<p>Same-as and broader/narrower links are computed now, for this scope only. They're never stored.</p>" },
  ]
  const steps = (list, kind, q) => {
    const i = Math.min(Number(q.step ?? 0), list.length - 1)
    const href = (n) => `#/architecture?ch=${kind}&step=${n}`
    return `<div class="at-steps2"><ol>${list.map((s, n) => `<li class="${n === i ? "on" : n < i ? "done" : ""}"><a href="${href(n)}"><span>${n + 1}</span><b>${s.t}</b><code>${s.who}</code></a></li>`).join("")}</ol>
      <div class="at-steps2-body"><div class="mx-eyebrow">Step ${i + 1} of ${list.length} · ${list[i].who}</div><h3>${list[i].t}</h3>${list[i].body}
        <div class="at-how-nav">${i ? A.btn("Back", "go", { value: href(i - 1), icon: "back" }) : "<span></span>"}${i < list.length - 1 ? A.btn(`Next: ${list[i + 1].t}`, "go", { value: href(i + 1), primary: true, icon: "arrow" }) : A.btn(kind === "write" ? "Now a read" : "Back to the overview", "go", { value: kind === "write" ? "#/architecture?ch=read" : "#/architecture", primary: true, icon: "arrow" })}</div></div></div>`
  }

  /* ---------- Store: every file ---------- */
  const FILES = () => [
    ["cas/", `${A.num(R().casObjects)} objects · 5.2 MB`, "local", "One file per object, named by its own hash: facts, and the model answers behind mined facts. Never overwritten, never deleted.", "emit commits, import", "every read, doctor, export", "{ kind, id, tier, claims, grounding, … }"],
    [`projection.${R().gen}.json`, `${A.num(M().facts.length)} rows · 471 KB`, "local", "The current version: for each fact's identity, the hash of its current content, plus the commit it was built at and the identity stamp.", "the write doors only", "every read", "{ current: [[nodeKey, row]], cas: [hash], gen, identity, builtAt }"],
    [`staging.${R().stagingGen}.json`, `${A.num(R().candidates.length + M().facts.length)} rows · 570 KB`, "never", "Mined suggestions waiting for review, same shape as the projection. Never travels in git.", "atlas mine", "atlas promote", "{ current: [[nodeKey, row]], … } with answerRef"],
    ["policy.json", "3.8 KB", "git", "Who may write which group, which territory names suggest core, and anchor bindings. Edited by hand; a broken file closes every group.", "a person", "the write gates, briefing owners", "{ authz: { scopes, anchors }, t0Heuristic: { keywords } }"],
    ["index.scip", "20.3 MB", "local", "The code index produced by scip-typescript. Atlas reads it and never runs the indexer.", "the indexer", "index, Genesis, check a claim", "SCIP protobuf"],
    ["memory.jsonl", "not created yet", "git", "Member memory: append-only, one event per line, travelling with the branch.", "memory saves", "recall, the header", "{ id, seq, contentHash, payload } per line"],
    ["orientation.jsonl", "not created yet", "git", "Where the project stands; nothing writes it yet.", "nobody yet", "the header", "same as memory"],
  ]
  const store = (q) => {
    const files = FILES()
    const f = files.find((x) => x[0] === q.file) ?? files[0]
    return `<div class="at-ch-intro"><p>Everything Atlas keeps is a plain file under <code>.atlas/</code>. No database, no server.</p></div>
      <div class="at-store2"><div class="at-store2-list">${files.map(([n, size, git]) => `<a class="at-disk-file ${n === f[0] ? "sel" : ""}" href="#/architecture?ch=store&file=${encodeURIComponent(n)}"><code>${A.esc(n)}</code><small>${A.esc(size)}</small><span class="at-disk-git ${git}">${git === "git" ? "travels in git" : git === "never" ? "never in git" : "stays local"}</span></a>`).join("")}</div>
        <div class="at-store2-detail"><h3><code>${A.esc(f[0])}</code></h3><p>${f[3]}</p><dl class="at-kv wide"><dt>Size</dt><dd>${A.esc(f[1])}</dd><dt>Written by</dt><dd>${f[4]}</dd><dt>Read by</dt><dd>${f[5]}</dd><dt>Shape</dt><dd><code>${A.esc(f[6])}</code></dd></dl>
          <p class="muted">In this repository the store's projection and objects are committed, which is why it reads as read-only. In Orchestra's copy they stay local and only policy.json and memory travel.</p></div></div>
      ${A.travelSection()}`
  }

  /* ---------- Identity ---------- */
  const FAMILIES = [["Stated", "advisory", "hash(anchor ‖ kind)", "A grounded sentence."], ["Tested", "predicate", "hash(anchor ‖ check ‖ kind)", "A sentence with an executable check."], ["Link", "relation", "hash(A ‖ depends-on ‖ B)", "A proven edge between two places."], ["Never calls", "negation", "hash(target ‖ scope)", "Nothing in a scope calls a target."], ["Code change", "transition", "hash(unit ‖ before ‖ after)", "What changed between two commits."], ["Hollow test", "test-vacuity", "hash(unit ‖ test)", "A test that cannot fail."]]
  const tree = (edited) => {
    const row = (d, name, hot) => `<div class="at-tree-row ${hot && edited ? "hot" : ""}" style="padding-inline-start:${d * 16}px">${A.icon(name.includes(".") ? "fact" : "folder")}<span>${name}</span><code>${hot && edited ? "9f2c…" : "a41e…"}</code></div>`
    return [row(0, "repo", true), row(1, "packages", true), row(2, "kernel", true), row(3, "codec.ts", true), row(3, "store.ts", false), row(2, "index", false), row(3, "build.ts", false), row(1, "docs", false)].join("") + (edited ? `<p class="at-tree-note">${A.icon("drift")}Facts about codec.ts are now marked changed. Facts about store.ts, index and docs didn't move.</p>` : "")
  }
  A.archTree = tree
  const identity = () => {
    const x = M().live().find((f) => f.why) ?? M().live()[0]
    return `<div class="at-ch-intro"><p>Three hashes answer three questions. Here they are for a real fact from this store.</p>${A.btn("Open the fact", "open-fact-page", { value: x.key })}</div>
      <div class="at-how-fact"><span>${A.icon("fact")}</span><p>“${A.esc(x.claim)}”</p><code class="at-mono">${A.esc(x.file)}</code></div>
      <div class="at-ids">
        <div class="at-id"><span>What does it say?</span><b>contentHash</b><code>${A.esc(x.hash.slice(0, 24))}…</code><p>BLAKE3 of the fact in canonical form. Its address in cas/. The same content twice is one object.</p></div>
        <div class="at-id"><span>Which fact is it?</span><b>nodeKey</b><code>${A.esc(x.key.slice(0, 24))}…</code><p>A hash of where and what kind, not of the wording. Rewording at the same place updates it.</p></div>
        <div class="at-id"><span>Does its code still match?</span><b>subtreeHash</b><code>${A.esc(x.subtree)}</code><p>A Merkle hash of the code under ${A.esc(x.file.split("/").at(-1))}, recorded at commit ${A.esc(x.derivedAt)}.</p></div>
      </div>
      <div class="at-outside">${A.icon("info")}<span><b>Outside every hash: grounding, status and freshness.</b> They're recomputed each time. If they were inside, every code change would mint a "new" fact and lose its history.</span></div>
      <div class="at-ideas two">
        <div class="at-idea"><h3>Named by its content</h3><p>Change one character and it's a different name.</p><label class="mx-field"><span>Try it</span><input value="${A.esc(x.claim.slice(0, 80))}" data-ax-hash></label><div class="at-idea-out"><small>its name</small><code id="ax-hash">${A.esc(A.hash(x.claim.slice(0, 80)))}</code></div><small class="muted">Illustrative hash; Atlas uses BLAKE3 over the canonical form.</small></div>
        <div class="at-idea"><h3>Code hashed as a tree</h3><p>Edit one file: only its path to the top changes.</p><div class="at-tree" id="ax-tree">${tree(false)}</div>${A.btn("Edit codec.ts", "ax-edit", { icon: "code" })}</div>
      </div>
      <h3 class="at-ax-h3">Six families of facts</h3>
      <table class="at-grid at-fam"><thead><tr><th>Family</th><th>Identity</th><th>What it says</th></tr></thead><tbody>${FAMILIES.map(([w, f, k, d]) => `<tr><th><span data-tip="${f}">${w}</span></th><td><code>${A.esc(k)}</code></td><td>${d}</td></tr>`).join("")}</tbody></table>
      <p class="muted">Every version is stamped <code>atlas-identity-2026-08-02</code>; a store stamped differently is refused on writes, so a change to a hashing rule can't mix silently with old data.</p>`
  }

  /* ---------- Packages ---------- */
  const LAYERS = [
    { id: "contracts", level: "L0", loc: "0.5k", deps: [], what: "Shared types only: Hash, Tier, Freshness, Status, Pack, Tool.", key: ["Hash · SubtreeHash · NodeKey", "Tier T0 / T1 / T2"] },
    { id: "kernel", level: "L1", loc: "1.7k", deps: ["contracts"], what: "The only place a hash is made: canonical form, BLAKE3, the content store, the event log and the open export.", key: ["id = BLAKE3(canonicalForm)", "exportCas / importCas"] },
    { id: "persist", level: "L2", loc: "4.1k", deps: ["kernel"], what: "Provenance, secret scrubbing, transcripts, a read-only diff between versions.", key: ["scrub before store"] },
    { id: "index", level: "L2", loc: "5.0k", deps: ["kernel"], what: "The code as a Merkle tree from the file tree and the code index, seen three ways: where, who owns, what depends on what.", key: ["subtreeHash per node", "reverse closure = blast radius"] },
    { id: "grounding", level: "L3", loc: "1.8k", deps: ["kernel", "index"], what: "The drift oracle and the truth gate.", key: ["FRESH iff subtreeHash matches", "gate only downgrades"] },
    { id: "knowledge", level: "L4", loc: "5.7k", deps: ["kernel", "index", "grounding"], what: "The fact lifecycle: identity keys, the router, authorization, ratification, derived edges.", key: ["DEDUP · CREATE · UPDATE · SUPERSEDE"] },
    { id: "retrieval", level: "L5", loc: "5.4k", deps: ["index", "knowledge"], what: "What agents receive: packs and the Own briefing.", key: ["own: 1,500 characters"] },
    { id: "memory", level: "L6", loc: "4.6k", deps: ["knowledge", "retrieval"], what: "Per-member memory, project rules, the logbook and the header.", key: ["append-only log"] },
    { id: "tools", level: "L7", loc: "6.0k", deps: ["persist", "grounding", "knowledge", "memory", "retrieval"], what: "One pure handler: six governance tools and three write doors.", key: ["emit · link · memory-emit"] },
    { id: "genesis", level: "L8", loc: "11.3k", deps: ["index", "knowledge", "memory"], what: "The miner: scan, rank, ask a model per site, admit into staging.", key: ["writes staging only"] },
    { id: "adapter-io", level: "ring", loc: "36k", deps: [], what: "The composition root: files, git, SCIP, the model, the disk store and every governed door.", key: ["16 write gates", "versions by link(2)"] },
    { id: "cli", level: "ring", loc: "11.5k", deps: [], what: "The atlas command: 32 commands, each printing status, next and invariant.", key: ["exit 0 · 1 · 2"] },
    { id: "mcp-server", level: "ring", loc: "1.4k", deps: [], what: "The same verdicts over MCP: 18 tools, byte-identical to the CLI.", key: ["stdio"] },
  ]
  const packages = (q) => {
    const sel = LAYERS.find((l) => l.id === q.pkg) ?? LAYERS[5]
    const deps = new Set(sel.deps)
    const users = new Set(LAYERS.filter((l) => l.deps.includes(sel.id)).map((l) => l.id))
    const tile = (p) => `<a class="at-arch-tile ${p.id === sel.id ? "sel" : ""} ${deps.has(p.id) ? "dep" : ""} ${users.has(p.id) ? "use" : ""}" href="#/architecture?ch=packages&pkg=${p.id}"><span>${p.level}</span><b>${p.id}</b><small>${p.loc} lines</small></a>`
    const levels = ["L8", "L7", "L6", "L5", "L4", "L3", "L2", "L1", "L0"]
    return `<div class="at-ch-intro"><p>Thirteen packages. Dependencies only point down: a package never uses one above it. Click one to see what it does and what it relies on.</p></div>
      <div class="at-arch"><div class="at-arch-stack"><div class="at-arch-col">${levels.map((lv) => `<div class="at-arch-row"><span class="at-arch-lv">${lv}</span>${LAYERS.filter((l) => l.level === lv).map(tile).join("")}</div>`).join("")}</div>
        <div class="at-arch-ring"><small>The ring: talks to the world, composes everything</small>${LAYERS.filter((l) => l.level === "ring").map(tile).join("")}</div>
        <p class="at-hint"><span class="lgk dep"></span>${A.esc(sel.id)} uses it · <span class="lgk use"></span>it uses ${A.esc(sel.id)}</p></div>
        <div class="at-arch-pkg"><div class="mx-eyebrow">${sel.level} · @atlas/${sel.id} · ${sel.loc} lines</div><h2>${sel.id}</h2><p>${sel.what}</p><ul>${sel.key.map((k) => `<li>${A.esc(k)}</li>`).join("")}</ul>
          <dl class="at-kv"><dt>Uses</dt><dd>${sel.deps.join(", ") || (sel.level === "ring" ? "everything below" : "nothing")}</dd><dt>Used by</dt><dd>${[...users].join(", ") || (sel.level === "ring" ? "—" : "the ring")}</dd></dl></div></div>
      <p class="muted">Drawn from each package.json. The diagram in ARCHITECTURE.md is older: it shows two write doors (there are three) and Genesis above tools (it doesn't use them).</p>`
  }

  /* ---------- Portable ---------- */
  const portable = () => `<div class="at-ch-intro"><p>Atlas is "open knowledge": no proprietary format and no lock-in. The whole store exports to one plain JSON file and replays 1:1 into a fresh store anywhere.</p>${A.btn("Export", "toast", { value: "Writes atlas-okf.json with every stored object.", icon: "download" })}</div>
    <div class="at-okf-flow">
      <div class="at-okf-box"><b>cas/</b><small>${A.num(R().casObjects)} objects</small></div>${A.icon("arrow")}
      <div class="at-okf-box file"><b>atlas-okf.json</b><small>{ format: "atlas-okf", version: 1, objects }</small></div>${A.icon("arrow")}
      <div class="at-okf-box"><b>an empty store</b><small>every name re-hashed</small></div>${A.icon("arrow")}
      <div class="at-okf-box dim"><b>current version</b><small>empty until each fact passes the door again</small></div>
    </div>
    <div class="at-rules">${[["All or nothing", "If one entry's name doesn't match its content, the whole bundle is refused, so a bundle can't quietly change or hide a fact."], ["Only into an empty store", "The target must have no .atlas/ yet."], ["Inert until checked", "Imported facts are stored but not current: each one becomes current only after it passes the door again."], ["Round-trip proven", "After import, the store is compared with the bundle byte for byte."], ["Stable bytes", "Keys are sorted, so the same store always exports the same file."], ["Memory has its own format", "atlas-okf-mem exists in the library; no command exposes it yet."]].map(([t, d]) => `<div><b>${A.icon("checkc")}${t}</b><p>${d}</p></div>`).join("")}</div>
    ${A.tech([["Commands", "<code>atlas export &lt;dir&gt;</code> · <code>atlas import &lt;bundle&gt; &lt;target&gt;</code> (CLI only)"], ["Code", "<code>kernel/src/portable.ts</code> · <code>adapter-io/src/okf-store.ts</code> · <code>cli/src/okf-cli.ts</code>"]])}`

  A.views.architecture = (state) => {
    const q = state.query
    const ch = CHAPTERS.some(([id]) => id === q.ch) ? q.ch : "overview"
    const body = { overview, write: (q) => steps(WRITE, "write", q), read: (q) => steps(READ, "read", q), store, identity, packages, portable }[ch](q)
    const i = CHAPTERS.findIndex(([id]) => id === ch)
    return {
      crumbs: [["Atlas", "#/overview"], ["Architecture"]],
      html: `<div class="at-page wide">
      <section class="at-gen-hero"><div><div class="mx-eyebrow">The engine · open knowledge (OKF)</div><h1>How Atlas keeps knowledge</h1></div></section>
      <nav class="at-chapters">${CHAPTERS.map(([id, label, icon], n) => `<a class="${id === ch ? "on" : ""}" href="#/architecture?ch=${id}"><span>${n + 1}</span>${A.icon(icon)}${label}</a>`).join("")}</nav>
      <section class="at-chapter">${body}</section>
      <div class="at-ch-next">${i ? `<a href="#/architecture?ch=${CHAPTERS[i - 1][0]}">${A.icon("back")}${CHAPTERS[i - 1][1]}</a>` : "<span></span>"}${i < CHAPTERS.length - 1 ? `<a class="primary" href="#/architecture?ch=${CHAPTERS[i + 1][0]}">Next: ${CHAPTERS[i + 1][1]}${A.icon("arrow")}</a>` : ""}</div>
      </div>`,
      after: () => {
        const input = document.querySelector("[data-ax-hash]")
        input?.addEventListener("input", () => (document.querySelector("#ax-hash").textContent = A.hash(input.value)))
      },
    }
  }

  // Box selection and the path animation on the Overview chapter.
  A.archBox = (id) => {
    const b = BOX()[id]
    document.querySelectorAll(".at-ax-box").forEach((el) => el.classList.toggle("sel", el.dataset.ax === id))
    document.querySelector("#ax-caption").innerHTML = `<b>${b.title}</b><span>${b.what}</span><code>${A.esc(b.term)}</code><a class="mx-link" href="#/architecture?ch=${b.go}">More in ${CHAPTERS.find(([c]) => c === b.go)[1]} ${A.icon("arrow")}</a>`
  }
  A.archPlay = (kind) => {
    const list = PLAY[kind]
    const boxes = [...document.querySelectorAll(".at-ax-box")]
    clearInterval(A.archPlay.t)
    boxes.forEach((el) => el.classList.remove("lit", "sel", "done"))
    let i = 0
    const show = () => {
      if (!document.querySelector(".at-ax")) return clearInterval(A.archPlay.t)
      boxes.forEach((el) => el.classList.contains("lit") && el.classList.replace("lit", "done"))
      if (i >= list.length) { clearInterval(A.archPlay.t); document.querySelector("#ax-caption").innerHTML = `<b>${kind === "write" ? "Written" : "Answered"}</b><span>${kind === "write" ? "The fact is stored and current. Nothing was overwritten." : "Only facts whose code still matches were served as true."}</span><a class="mx-link" href="#/architecture?ch=${kind}">Step through it slowly ${A.icon("arrow")}</a>`; return }
      const [id, text] = list[i]
      boxes.find((el) => el.dataset.ax === id)?.classList.add("lit")
      document.querySelector("#ax-caption").innerHTML = `<b>${i + 1} / ${list.length}</b><span>${text}</span>`
      i++
    }
    show()
    A.archPlay.t = setInterval(show, 1500)
  }
})(window.Atlas)
