// Sample knowledge for the hugr-orchestra repo, written the way a user reads it. Every count on screen is
// derived from these items, so the numbers always agree with each other.
;(function (A) {
  const HEAD = "6ea9383"

  const agents = {
    maestro: { name: "Maestro", role: "Coordinates the team" },
    backend: { name: "Backend", role: "Builds server and core", memory: true },
    jimmy: { name: "Jimmy", role: "Explores the codebase", memory: true },
    archie: { name: "Archie", role: "Plans the work", memory: true },
    patty: { name: "Patty", role: "Builds the interface" },
    billy: { name: "Billy", role: "Reviews security" },
    you: { name: "You", role: "Project owner", human: true },
  }

  const areas = [
    { id: "core", name: "Core runtime", path: "packages/core", owner: "backend", about: "Sessions, prompts and the engine every agent turn runs on.",
      folders: [{ path: "packages/core/src/session-v2", about: "Saves each prompt durably, then runs the session one turn at a time." }, { path: "packages/core/src/omni.ts", about: "The single place that starts child processes." }] },
    { id: "orchestra", name: "Orchestra host", path: "packages/orchestra", owner: "backend", about: "The running app: agents, tools and the Maestro.",
      folders: [{ path: "packages/orchestra/src/maestro", about: "How Maestro plans, delegates and reads Atlas." }, { path: "packages/orchestra/src/tool", about: "Tools agents can call." }] },
    { id: "server", name: "Server & API", path: "packages/server", owner: "backend", about: "The HTTP API the app and other clients talk to.",
      folders: [{ path: "packages/server/src/handlers", about: "Endpoint implementations." }, { path: "packages/protocol/src/groups", about: "The public API contract." }] },
    { id: "app", name: "App interface", path: "packages/app-shell", owner: "patty", about: "Every screen of the desktop and web app.",
      folders: [{ path: "packages/app-shell/src/orchestra", about: "Sidebar, chapters and page kit." }] },
    { id: "client", name: "Client & SDK", path: "packages/client", owner: "patty", about: "The generated client other programs use.",
      folders: [{ path: "packages/client/src", about: "Contract mapping and generated code." }] },
    { id: "relay", name: "Workflows", path: "modules/relay", owner: "archie", about: "Workflow authoring and runs.",
      folders: [{ path: "modules/relay/src/authoring", about: "Building workflows from plans." }] },
  ]

  // kind: rule (confirmed) | caution (confirmed gotcha) | suggestion (an agent proposed it; nobody confirmed yet)
  // status: ok | moved (still true, the code it points to moved) | broken (no longer true) | unchecked
  const items = [
    { id: "admit", folder: "packages/core/src/session-v2", file: "prompt.ts", line: 41, kind: "rule", status: "ok", by: "archie", confirmedBy: "maestro", when: "2 days ago",
      text: "Every prompt is saved before the session is woken up, so a crash never loses what the user typed.",
      code: { start: 40, focus: [41, 52], lines: ["// Saving is durable; running is advisory and may be skipped.", "export const prompt = Effect.fn(\"SessionV2.prompt\")(function* (input) {", "  const store = yield* SessionStore.Service", "  const saved = yield* store.admit({", "    sessionID: input.sessionID,", "    messageID: input.messageID,", "    delivery: input.delivery ?? \"steer\",", "  })", "  if (input.resume === false) return saved", "  const execution = yield* SessionExecution.Service", "  yield* execution.wake(input.sessionID)", "  return saved", "})"] },
      impact: ["packages/core/src/session-v2/runner.ts", "packages/server/src/handlers/session.ts", "packages/orchestra/src/session/prompt.ts", "packages/orchestra/src/session/compaction.ts"],
      related: ["steer", "wake"], history: [["Narrowed to saving only, after the store was split out", "archie", "2 days ago"], ["First learned from the session tests", "jimmy", "9 days ago"]] },
    { id: "steer", folder: "packages/core/src/session-v2", file: "runner.ts", line: 118, kind: "rule", status: "ok", by: "archie", confirmedBy: "maestro", when: "2 days ago",
      text: "A message sent while an agent is working steers it at the next safe point instead of waiting in line.", related: ["admit", "queue"] },
    { id: "conflict", folder: "packages/core/src/session-v2", file: "store.ts", line: 96, kind: "rule", status: "broken", by: "backend", confirmedBy: "maestro", when: "5 days ago",
      text: "Resending a message with the same ID but a different delivery mode is rejected.",
      why: "store.ts changed in 6ea9383: a mismatched resend is now accepted with a warning instead of rejected.",
      before: { start: 96, lines: ["  if (existing && existing.delivery !== input.delivery)", "    return yield* new PromptConflict({ messageID: input.messageID })", "  if (existing) return existing"] },
      after: { start: 96, lines: ["  if (existing && existing.delivery !== input.delivery)", "    yield* Effect.logWarning(\"delivery changed on retry\")", "  if (existing) return { ...existing, delivery: input.delivery }"] },
      impact: ["packages/server/src/handlers/session.ts", "packages/client/src/generated/session.ts"], related: ["admit"] },
    { id: "wake", folder: "packages/core/src/session-v2", file: "execution.ts", line: 22, kind: "caution", status: "ok", by: "backend", confirmedBy: "maestro", when: "1 day ago",
      text: "Waking a session that is idle or gone does nothing. Don't treat it as an error.", related: ["admit"] },
    { id: "stream", folder: "packages/core/src/session-v2", file: "runner.ts", line: 64, kind: "rule", status: "moved", by: "archie", confirmedBy: "maestro", when: "5 days ago",
      text: "Each agent turn makes exactly one call to the model.", why: "The code moved from line 60 to line 64 when a comment was added. The rule still holds." },
    { id: "queue", folder: "packages/core/src/session-v2", file: "runner.ts", line: 143, kind: "suggestion", status: "ok", by: "jimmy", when: "3 hours ago",
      text: "A queued message waits until the agent would otherwise stop, then runs one at a time.", evidence: "Seen in runner.ts and in 2 tests." },
    { id: "coalesce", folder: "packages/core/src/session-v2", file: "coordinator.ts", line: 14, kind: "suggestion", status: "unchecked", by: "jimmy", when: "6 days ago",
      text: "Several wake-ups for the same session are merged into one run.", evidence: "Inferred from coordinator.ts; no test covers it." },
    { id: "omni", folder: "packages/core/src/omni.ts", file: "omni.ts", line: 1, kind: "rule", critical: true, status: "ok", by: "billy", confirmedBy: "you", when: "8 days ago",
      text: "Only omni.ts may start child processes. Everything else goes through it.", related: ["nospawn"] },
    { id: "nospawn", folder: "packages/core/src/omni.ts", file: "omni.ts", line: 1, kind: "rule", critical: true, status: "ok", by: "billy", confirmedBy: "you", when: "8 days ago",
      text: "No code outside the approved list imports child_process, cross-spawn or bun-pty.", related: ["omni"] },
    { id: "maestro-atlas", folder: "packages/orchestra/src/maestro", file: "atlas-source.ts", line: 53, kind: "rule", status: "ok", by: "archie", confirmedBy: "maestro", when: "3 days ago",
      text: "When Atlas can't confirm its sources, Maestro holds and says why instead of guessing." },
    { id: "units", folder: "packages/orchestra/src/maestro", file: "atlas-knowledge.ts", line: 12, kind: "rule", status: "ok", by: "archie", confirmedBy: "maestro", when: "3 days ago",
      text: "A plan carries at most 8 pieces of Atlas knowledge." },
    { id: "memory-scan", folder: "packages/orchestra/src/maestro", file: "atlas-memory.ts", line: 95, kind: "caution", status: "ok", by: "billy", confirmedBy: "maestro", when: "6 days ago",
      text: "Agent memory is scanned for secrets before it is saved. Without the scanner, saving is refused." },
    { id: "fold", folder: "packages/orchestra/src/maestro", file: "atlas-resume.ts", line: 30, kind: "suggestion", status: "ok", by: "backend", when: "4 hours ago",
      text: "After a conversation is compacted, the agent's notes are restored before its next turn.", evidence: "From Backend's work on #7dba2cb." },
    { id: "tools-protected", folder: "packages/orchestra/src/tool", file: "registry.ts", line: 97, kind: "rule", status: "ok", by: "backend", confirmedBy: "maestro", when: "4 days ago",
      text: "Plugins and external tools can't take over the names of Atlas tools." },
    { id: "atlas-files", folder: "packages/orchestra/src/tool", file: "atlas-memory.ts", line: 30, kind: "caution", status: "moved", by: "backend", confirmedBy: "maestro", when: "6 days ago",
      text: "Agents never edit the .atlas folder with file tools; they go through Atlas.", why: "The check moved into a shared helper. Same behaviour." },
    { id: "errors", folder: "packages/protocol/src/groups", file: "session.ts", line: 11, kind: "rule", status: "ok", by: "backend", confirmedBy: "maestro", when: "4 days ago",
      text: "Every public endpoint declares the errors it can return." },
    { id: "layers", folder: "packages/server/src/handlers", file: "session.ts", line: 1, kind: "rule", status: "ok", by: "backend", confirmedBy: "maestro", when: "4 days ago",
      text: "The server builds on core; core never imports the server." },
    { id: "handler-services", folder: "packages/server/src/handlers", file: "actions-workflow.ts", line: 7, kind: "caution", status: "unchecked", by: "backend", confirmedBy: "maestro", when: "12 days ago",
      text: "Handlers pick up their services once at startup, not on every request." },
    { id: "chapter-props", folder: "packages/app-shell/src/orchestra", file: "chapter-route.tsx", line: 15, kind: "rule", status: "ok", by: "patty", confirmedBy: "maestro", when: "2 days ago",
      text: "Every chapter page gets the server and project folder, and nothing else." },
    { id: "remount", folder: "packages/app-shell/src/orchestra", file: "chapter-route.tsx", line: 44, kind: "suggestion", status: "ok", by: "jimmy", when: "5 hours ago",
      text: "Switching project reloads the open chapter from scratch.", evidence: "Seen in chapter-route.tsx." },
    { id: "copy", folder: "packages/app-shell/src/orchestra", file: "navigation.ts", line: 6, kind: "caution", status: "ok", by: "patty", confirmedBy: "maestro", when: "6 days ago",
      text: "Visible text always comes from translations; hardcoded labels are not allowed." },
    { id: "sidebar-count", folder: "packages/app-shell/src/orchestra", file: "navigation.ts", line: 6, kind: "suggestion", status: "ok", by: "jimmy", when: "5 hours ago",
      text: "A sidebar entry only opens a page once that page is registered.", evidence: "Seen in navigation.ts and sidebar.tsx." },
    { id: "groups", folder: "packages/client/src", file: "contract.ts", line: 52, kind: "rule", status: "broken", by: "patty", confirmedBy: "maestro", when: "6 days ago",
      text: "Every API group has a name in the generated client.",
      why: "contract.ts changed in 6ea9383: one Actions group moved to a separate list and has no client name now.",
      before: { start: 52, lines: ["  \"server.actionsWorkflow\": \"actionsWorkflows\",", "  \"server.actionsRun\": \"actionsRuns\",", "} as const"] },
      after: { start: 52, lines: ["  \"server.actionsWorkflow\": \"actionsWorkflows\",", "} as const", "// server.actionsRun moved to splitGroups"] },
      impact: ["packages/app-shell/src/orchestra/actions/api.ts"] },
    { id: "client-deps", folder: "packages/client/src", file: "index.ts", line: 1, kind: "rule", status: "ok", by: "backend", confirmedBy: "maestro", when: "4 days ago",
      text: "The client never imports core or the server." },
    { id: "generated", folder: "packages/client/src", file: "generated/index.ts", line: 1, kind: "caution", status: "ok", by: "patty", confirmedBy: "maestro", when: "9 days ago",
      text: "Generated files are never edited by hand; regenerate them instead." },
    { id: "relay-anchors", folder: "modules/relay/src/authoring", file: "graph.ts", line: 72, kind: "rule", status: "moved", by: "archie", confirmedBy: "maestro", when: "3 days ago",
      text: "Workflow steps keep the Atlas knowledge their plan was built on.", why: "graph.ts was reformatted. The rule still holds." },
    { id: "relay-wires", folder: "modules/relay/src/authoring", file: "canvas.tsx", line: 40, kind: "suggestion", status: "ok", by: "jimmy", when: "1 day ago",
      text: "Connections on the workflow canvas never cross between phases.", evidence: "Seen in canvas.tsx; geometry.ts may contradict it.", doubt: true },
  ]

  // Proposed critical rules wait for a human; agents can't confirm them.
  const pending = [
    { id: "preload", folder: "packages/app-shell/src/orchestra", file: "preload/index.ts", line: 1, kind: "rule", critical: true, status: "ok", by: "billy", when: "2 hours ago",
      text: "The desktop app never gives web content a way to start processes.", evidence: "Billy checked every preload export." },
  ]

  const memory = {
    backend: {
      tokens: 970,
      now: { goal: "Show Atlas knowledge in the app", step: "Adding the read endpoint to the server", progress: "2 of 5 steps" },
      lessons: [
        { text: "Re-read store.ts before changing how prompts are saved: it moved twice this week.", from: "Task · session store split", used: "3 hours ago", fades: null },
        { text: "After compaction, restore Atlas notes before the first model call, not after.", from: "Task · compaction fix", used: "1 day ago", fades: null },
        { text: "Windows tests need a longer time budget for Atlas memory writes.", from: "PR #658", used: "6 days ago", fades: "in 22 days" },
        { text: "The secret scanner must be installed or memory writes are refused.", from: "Task · memory scanner", used: "9 days ago", fades: "in 19 days" },
      ],
      prs: [
        { title: "#658 Anchor Atlas knowledge for Archie and Relay", note: "Kept plans to 8 pieces of knowledge. Approved after the Windows fix." },
        { title: "#664 Accept JSON-text anchor arguments", note: "Parse at the tool boundary; no knowledge changed." },
      ],
    },
    jimmy: {
      tokens: 615,
      now: { goal: "Learn how app chapters work", step: "Waiting for review of 4 suggestions", progress: "blocked on you" },
      lessons: [
        { text: "Skip generated translation files when exploring the app; they add noise.", from: "Task · app exploration", used: "5 hours ago", fades: null },
        { text: "When a folder loads code at runtime, say “can't tell” instead of guessing.", from: "Task · plugin scan", used: "2 days ago", fades: "in 26 days" },
      ],
      prs: [],
    },
    archie: {
      tokens: 960,
      now: { goal: "Plan the Atlas screens", step: "Checking the rule that no longer holds in store.ts", progress: "in progress" },
      lessons: [
        { text: "Drop a piece of knowledge rather than go over 8 per plan.", from: "PR #658", used: "1 day ago", fades: null },
        { text: "Point plans at Atlas items, never at raw file paths.", from: "Task · relay anchors", used: "2 hours ago", fades: null },
      ],
      prs: [{ title: "#664 Accept JSON-text anchor arguments", note: "Plans can now pass anchors as text." }],
    },
  }

  const activity = [
    { when: "12 min ago", tone: "bad", glyph: "xc", text: "2 rules no longer hold after commit 6ea9383", link: "#/review" },
    { when: "2 hours ago", tone: "warm", glyph: "shield", text: "Billy proposed a critical rule that needs you", link: "#/review?tab=confirm" },
    { when: "3 hours ago", tone: "blue", glyph: "sparkle", text: "Jimmy suggested 3 things about the app and sessions", link: "#/review?tab=suggestions" },
    { when: "1 day ago", tone: "good", glyph: "check", text: "Maestro confirmed: “Waking a session that is idle or gone does nothing.”", item: "wake" },
    { when: "2 days ago", tone: "", glyph: "history", text: "Archie updated: “Every prompt is saved before the session is woken up…”", item: "admit" },
    { when: "8 days ago", tone: "good", glyph: "shield", text: "You confirmed the critical rule about starting processes", item: "omni" },
  ]

  const byId = Object.fromEntries([...items, ...pending].map((x) => [x.id, x]))
  const areaOf = (item) => areas.find((a) => a.folders.some((f) => f.path === item.folder))
  const count = (list, test) => list.filter(test).length
  const stats = (list) => ({
    total: list.length,
    rules: count(list, (x) => x.kind === "rule"),
    cautions: count(list, (x) => x.kind === "caution"),
    suggestions: count(list, (x) => x.kind === "suggestion"),
    ok: count(list, (x) => x.status === "ok"),
    moved: count(list, (x) => x.status === "moved"),
    broken: count(list, (x) => x.status === "broken"),
    unchecked: count(list, (x) => x.status === "unchecked"),
  })
  const review = () => ({
    broken: items.filter((x) => x.status === "broken" && !x.done),
    moved: items.filter((x) => x.status === "moved" && !x.done),
    suggestions: items.filter((x) => x.kind === "suggestion" && !x.done),
    confirm: pending.filter((x) => !x.done),
  })
  const reviewCount = () => Object.values(review()).reduce((n, l) => n + l.length, 0)

  A.data = { HEAD, agents, areas, items, pending, memory, activity, byId, areaOf, stats, review, reviewCount }
})(window.Atlas)
