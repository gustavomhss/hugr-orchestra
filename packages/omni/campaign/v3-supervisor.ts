// V3: pinned supervisor SIGKILL, exact per-OS tier snapshots inside 8 s, then protected next-spawn recovery.
import { cleanup, cli, client, control, deadlineSnapshots, fakeLLM, fileTree, identity, isolated, kill9, matches, provider, remaining, serve, table, until, verdict, win } from "./lib.ts"

export async function run(options: { mutation?: "wrong-owner" } = {}) {
  const scratch = isolated("v3", {})
  const trees = { bash: fileTree(scratch.home, 2), pty: fileTree(scratch.home, 2), after: fileTree(scratch.home, 1) }
  const llm = await fakeLLM([{ name: "bash", args: { command: trees.bash.line, timeout: 600_000, description: "Run campaign tree" } }])
  const config = {
    formatter: false, lsp: false, share: "disabled", permission: { "*": "allow" }, model: "test/test-model", provider: provider(llm.url),
    agent: { maestro: { model: "test/test-model", permission: { "*": "allow" } } },
  }
  const nonces = Object.values(trees).map((tree) => tree.nonce)
  const steps: string[] = []
  const step = (line: string) => { steps.push(`${new Date().toISOString()} ${line}`); console.error(`[v3] ${line}`) }
  try {
    const host = await serve(cli(), ["serve", "--port", "0", "--hostname", "127.0.0.1"], { ...scratch.env, ORCHESTRA_CONFIG_CONTENT: JSON.stringify(config) }, scratch.project)
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
    for (const supervisor of supervisors) if (!kill9(supervisor)) throw new Error(`could not kill pinned supervisor ${JSON.stringify(supervisor)}`)
    const killed = Date.now()
    step(`supervisor kill succeeded at ${killed}`)
    const observed = await deadlineSnapshots(killed, 8000, [trees.bash.nonce, trees.pty.nonce], supervisors)
    const serverAlive = table().some((row) => matches(row, pinnedHost) && !row.state.startsWith("Z"))
    const tier = win
      ? { expected: "Jobs close", matches: observed.zeroAtMs !== undefined && observed.last.counts.every((count) => count === 0) }
      : { expected: "Unix trees remain unprotected", matches: observed.samples.every((sample) => sample.fixtureIds.every((ids, index) => ids.length === 3 && ids.every((id) => (index === 0 ? before.bash : before.pty).fixtureIds.some((original) => matches(id, original))))) }
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
    const afterHost = await deadlineSnapshots(Date.now(), 8000, [trees.after.nonce], [pinnedHost, ...fresh, ...recovered.fixtureIds, ...recovered.wrappers])
    step(`recovery ${recoveryMs} ms; new host-owned tree zero at ${afterHost.zeroAtMs} ms`)
    return verdict("v3-supervisor", {
      home: scratch.home, nonces, pinnedHost, before, supervisors, observed, serverAlive, tier,
      recovery: { ms: recoveryMs, control: recovered, supervisors: fresh }, afterHost,
      oldTreesFinal: { bash: await remaining(trees.bash.nonce), pty: await remaining(trees.pty.nonce) },
      pass: tier.matches && serverAlive && observed.last.retained.length === 0 && recoveryMs < 30_000 && afterHost.zeroAtMs !== undefined && afterHost.last.counts[0] === 0 && afterHost.last.retained.length === 0,
      steps,
    })
  } catch (error) {
    return verdict("v3-supervisor", { pass: false, error: String(error), home: scratch.home, nonces, steps })
  } finally {
    llm.stop()
    await cleanup(scratch.home, nonces)
  }
}

if (import.meta.main) process.exit((await run()).pass ? 0 : 1)
