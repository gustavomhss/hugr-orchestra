// V3: pinned supervisor SIGKILL, exact per-OS tier snapshots inside 8 s, then protected next-spawn recovery.
import { cleanup, cli, client, control, fakeLLM, fileTree, identity, inventoryScope, isolated, kill9, matches, members, provider, remaining, serve, sleep, table, until, verdict, win, type Identity, type Row } from "./lib.ts"
import { deliveryEnv } from "./delivery-fixtures.ts"
import type { ChildProcess } from "node:child_process"

export async function run(options: { mutation?: "wrong-owner" } = {}) {
  const scratch = isolated("v3", {})
  const trees = { bash: fileTree(scratch.home, 2), pty: fileTree(scratch.home, 2), after: fileTree(scratch.home, 1) }
  const llm = await fakeLLM([{ name: "bash", args: { command: win ? `& ${trees.bash.line}` : trees.bash.line, timeout: 600_000, description: "Run campaign tree" } }])
  const config = {
    formatter: false, lsp: false, shell: win ? "powershell.exe" : "/bin/bash", share: "disabled", permission: { "*": "allow" }, model: "test/test-model", provider: provider(llm.url),
    agent: { maestro: { model: "test/test-model", permission: { "*": "allow" } } },
  }
  const nonces = Object.values(trees).map((tree) => tree.nonce)
  const steps: string[] = []
  const hosts: ChildProcess[] = []
  const result: { value: Record<string, unknown> & { pass: boolean } } = { value: { pass: false } }
  const step = (line: string) => { steps.push(`${new Date().toISOString()} ${line}`); console.error(`[v3] ${line}`) }
  try {
    const host = await serve(cli(), ["serve", "--port", "0", "--hostname", "127.0.0.1"], deliveryEnv({ ...scratch.env, ORCHESTRA_CONFIG_CONTENT: JSON.stringify(config) }), scratch.project)
    hosts.push(host.proc)
    const pinnedHost = host.identity ?? identity(host.pid)
    const api = client(host.url, scratch.project)
    const session = await api.post("/session", {})
    step(`host ${JSON.stringify(pinnedHost)}; home ${scratch.home}; nonces ${JSON.stringify(nonces)}`)
    await api.post(`/session/${session.id}/prompt_async`, { agent: "maestro", model: { providerID: "test", modelID: "test-model" }, parts: [{ type: "text", text: "Run campaign tree." }] })
    await api.post("/pty", { command: trees.pty.command, args: trees.pty.args })
    const before = await until(90_000, "all exact bash and terminal members protected", () => {
      const rows = table()
      const found = { bash: control(trees.bash.nonce, trees.bash.size, [pinnedHost], rows), pty: control(trees.pty.nonce, trees.pty.size, [pinnedHost], rows) }
      return found.bash.pass && found.pty.pass ? found : undefined
    })
    const supervisors = [...new Map(Object.values(before).flatMap((found) => found.protectedMembers.flatMap((member) => member.supervisors)).map((pinned) => [pinned.pid, pinned])).values()]
    if (options.mutation === "wrong-owner") {
      const wrong = control(trees.pty.nonce, trees.pty.size, [{ pid: pinnedHost.pid, startTime: `${pinnedHost.startTime}-wrong` }])
      if (wrong.pass) throw new Error("wrong-owner oracle accepted stale host")
      throw new Error("wrong-owner positive control rejected")
    }
    if (supervisors.length === 0) throw new Error("no pinned supervisors in positive control")
    step(`full controls ${JSON.stringify(before)}; supervisor identities ${JSON.stringify(supervisors)}`)
    const mutations: { mutation: string; error: string }[] = []
    for (const mutation of ["late", "empty", "unknown"] as const) {
      const rejected = await sampleDeadline(Date.now(), 3000, [trees.pty.nonce], supervisors, [before.pty], [], async () => {
        const rows = table(2000)
        if (mutation === "late") await sleep(2250)
        if (mutation === "empty") return []
        return mutation === "unknown" ? rows.map((row) => row.pid === process.pid ? { ...row, args: null } : row) : rows
      }).then(() => ({ error: "" }), (cause: unknown) => ({ error: String(cause) }))
      const expected = mutation === "late" ? "V3 bounded inventory query deadline expired" :
        mutation === "empty" ? "V3 inventory observation empty" : "querying host identity/argv unavailable"
      if (!rejected.error.includes(expected)) throw new Error(`V3 ${mutation} observation mutation did not fail its named gate: ${rejected.error}`)
      mutations.push({ mutation, error: rejected.error })
    }
    console.log("V3_OBSERVATION_MUTATIONS_RED " + JSON.stringify(mutations))
    for (const supervisor of supervisors) if (!kill9(supervisor)) throw new Error(`could not kill pinned supervisor ${JSON.stringify(supervisor)}`)
    const killed = Date.now()
    step(`supervisor kill succeeded at ${killed}`)
    const observed = await sampleDeadline(killed, 8000, [trees.bash.nonce, trees.pty.nonce], supervisors, [before.bash, before.pty], [pinnedHost])
    const serverAlive = observed.last.watched.some((row) => matches(row, pinnedHost))
    const tier = win
      ? { expected: "Jobs close", matches: observed.zeroAtMs !== undefined && observed.last.counts.every((count) => count === 0) }
      : { expected: "Unix trees remain unprotected", observedAtMs: observed.last.atMs,
          matches: observed.last.terminal && observed.samples.every((sample) => sample.fixtureIds.every((ids, index) => ids.length === 3 && ids.every((id) => (index === 0 ? before.bash : before.pty).fixtureIds.some((original) => matches(id, original))))) }
    step(`supervisor kill tier ${JSON.stringify(tier)}; last deadline snapshot ${JSON.stringify(observed.last)}`)

    const created = Date.now()
    const recovered = await until(30_000, "next spawn recovers protected tree", async () => {
      await api.post("/pty", { command: trees.after.command, args: trees.after.args })
      return until(30_000 - (Date.now() - created), "all recovery members protected", () => {
        const found = control(trees.after.nonce, trees.after.size, [pinnedHost])
        return found.pass ? found : undefined
      })
    })
    const fresh = [...new Map(recovered.protectedMembers.flatMap((member) => member.supervisors).map((pinned) => [pinned.pid, pinned])).values()]
    const recoveryMs = Date.now() - created
    if (!fresh.some((pinned) => !supervisors.some((old) => matches(old, pinned)))) throw new Error("recovery did not create a new supervisor identity")
    if (!kill9(pinnedHost)) throw new Error("could not kill pinned server")
    const afterHost = await sampleDeadline(Date.now(), 8000, [trees.after.nonce], [pinnedHost, ...fresh, ...recovered.fixtureIds, ...recovered.wrappers], [recovered])
    step(`recovery ${recoveryMs} ms; new host-owned tree zero at ${afterHost.zeroAtMs} ms`)
    result.value = {
      home: scratch.home, nonces, pinnedHost, before, supervisors, observed, serverAlive, tier, mutations,
      recovery: { ms: recoveryMs, control: recovered, supervisors: fresh }, afterHost,
      oldTreesFinal: { bash: await remaining(trees.bash.nonce), pty: await remaining(trees.pty.nonce) },
      pass: tier.matches && serverAlive && observed.last.retained.length === 0 && recoveryMs < 30_000 && afterHost.zeroAtMs !== undefined && afterHost.last.counts[0] === 0 && afterHost.last.retained.length === 0,
      steps,
    }
  } catch (error) {
    result.value = { pass: false, error: String(error), home: scratch.home, nonces, steps }
  } finally {
    llm.stop()
    // Close retained host handles before inventory teardown; killing an already-exiting numeric PID is not cleanup proof.
    for (const proc of hosts) if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL")
    await until(10_000, "V3 retained hosts exited", () => hosts.every((proc) => proc.exitCode !== null || proc.signalCode !== null) ? true : undefined).then(async () => {
      if (win) await until(8_000, "V3 Windows Job teardown before inventory cleanup", () => {
        const rows = table()
        return nonces.every((nonce) => { const found = members(nonce, rows); return found.members.length === 0 && found.wrappers.length === 0 }) ? true : undefined
      })
      await cleanup(scratch.home, nonces)
    }).catch((cause) => {
      result.value = { ...result.value, measurementPass: result.value.pass, pass: false, teardownError: String(cause) }
    })
  }
  return verdict("v3-supervisor", result.value)
}

/** V3 observation window: two-second fresh queries, with a reserved final probe and no late/stale acceptance. */
export async function sampleDeadline(started: number, boundMs: number, nonces: string[], retained: Identity[],
  positive: ReturnType<typeof control>[], watched: Identity[] = [], probe: () => Row[] | Promise<Row[]> = () => table(2000)) {
  const queryBudgetMs = 2000
  const terminalAtMs = boundMs - queryBudgetMs - 250
  if (positive.length !== nonces.length || !positive.length || positive.some((entry) => !entry.pass || !entry.fixtureIds.length))
    throw new Error("V3 observation requires prior positive alive controls")
  if (terminalAtMs < 0) throw new Error("V3 observation window cannot fit a full bounded query")
  const origin = performance.now() - (Date.now() - started)
  const elapsed = () => Math.max(performance.now() - origin, Date.now() - started)
  const samples: { queryAtMs: number; atMs: number; observedAt: string; terminal: boolean; counts: number[];
    fixtureIds: Identity[][]; wrappers: Identity[][]; retained: Identity[]; watched: Identity[] }[] = []
  const capture = async (terminal: boolean) => {
    const queryAtMs = elapsed()
    if (queryAtMs + queryBudgetMs >= boundMs) throw new Error("V3 full inventory query budget no longer fits observation window")
    const timer = { value: undefined as ReturnType<typeof setTimeout> | undefined }
    const rows = await Promise.race([Promise.resolve().then(probe), new Promise<never>((_, reject) => {
      timer.value = setTimeout(() => reject(new Error("V3 bounded inventory query deadline expired")), queryBudgetMs)
    })]).finally(() => clearTimeout(timer.value))
    if (elapsed() >= boundMs || elapsed() - queryAtMs > queryBudgetMs)
      throw new Error("V3 late inventory observation rejected")
    if (!rows.length) throw new Error("V3 inventory observation empty")
    const scope = inventoryScope(rows, [...retained, ...watched, ...positive.flatMap((entry) => [...entry.fixtureIds, ...entry.wrappers])])
    if (scope.some((row) => row.args === null)) throw new Error("V3 inventory observation has unknown argv in owned scope")
    const found = nonces.map((nonce) => members(nonce, rows))
    const atMs = elapsed()
    if (atMs >= boundMs) throw new Error("V3 late identity projection rejected")
    const live = (ids: Identity[]) => ids.filter((pinned) => rows.some((row) => matches(row, pinned) && !row.state.startsWith("Z")))
    samples.push({ queryAtMs, atMs, observedAt: new Date().toISOString(), terminal,
      counts: found.map((tree) => tree.members.length + tree.wrappers.length),
      fixtureIds: found.map((tree) => tree.members.map((row) => identity(row.pid, rows))),
      wrappers: found.map((tree) => tree.wrappers.map((row) => identity(row.pid, rows))), retained: live(retained), watched: live(watched) })
  }
  // Ordinary queries must also leave a full budget for the fixed predeadline final observation.
  while (elapsed() + queryBudgetMs < terminalAtMs) {
    await capture(false)
    await sleep(Math.min(250, Math.max(0, terminalAtMs - queryBudgetMs - elapsed())))
  }
  await sleep(Math.max(0, terminalAtMs - elapsed()))
  await capture(true)
  if (!samples.length || !samples.at(-1)?.terminal) throw new Error("V3 observation produced no valid final snapshot")
  const last = samples.at(-1)!
  const zeroAtMs = samples.find((sample) => sample.counts.every((count) => count === 0) && sample.retained.length === 0)?.atMs
  // Exact pinned death is irreversible; Unix survival is certified only by the fresh reserved final positive probe.
  // Waiting closes the window, but does not relabel the last query as an observation at exactly boundMs.
  await sleep(Math.max(0, boundMs - elapsed()))
  return { samples, zeroAtMs, last, windowMs: boundMs, queryBudgetMs, terminalAtMs, lastObservedAtMs: last.atMs }
}

if (import.meta.main) process.exit((await run()).pass ? 0 : 1)
