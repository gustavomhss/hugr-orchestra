// V3: `kill -9` of the omni supervisor itself, under a live `opencode serve` (compiled CLI) with a bash tool tree and
// a terminal tree. KPI: the outcome matches the per-OS tier in GUARANTEES.md ("Supervisor process dies"):
//   Linux, macOS: the trees keep running, unprotected (declared hole); the next spawn starts a new supervisor.
//   Windows: the trees die with their Jobs.
// And the server recovers: a new terminal after the kill runs under a new supervisor.
//
//   bun packages/omni/campaign/v3-supervisor.ts

import {
  cleanup,
  cli,
  client,
  fakeLLM,
  fileTree,
  isolated,
  kill9,
  provider,
  remaining,
  serve,
  sleep,
  supervised,
  supervisorsOf,
  until,
  verdict,
  win,
} from "./lib.ts"

export async function run() {
  const bin = cli()
  const scratch = isolated("v3", {})
  const trees = { bash: fileTree(scratch.home, 2), pty: fileTree(scratch.home, 2), after: fileTree(scratch.home, 1) }
  const llm = await fakeLLM([
    { name: "bash", args: { command: trees.bash.line, timeout: 600_000, description: "Run the campaign tree" } },
  ])
  const config = {
    formatter: false,
    lsp: false,
    share: "disabled",
    permission: { "*": "allow", bash: "allow", external_directory: "allow" },
    model: "test/test-model",
    provider: provider(llm.url),
    agent: { maestro: { model: "test/test-model", permission: { "*": "allow" } } },
  }
  const env = { ...scratch.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config) }
  const nonces = Object.values(trees).map((t) => t.nonce)
  const steps: string[] = []
  const step = (line: string) => {
    steps.push(`${new Date().toISOString()} ${line}`)
    console.error(`[v3] ${line}`)
  }
  try {
    const host = await serve(bin, ["serve", "--port", "0", "--hostname", "127.0.0.1"], env, scratch.project)
    step(`host ${host.pid}; home ${scratch.home}; nonces ${JSON.stringify(nonces)}`)
    const api = client(host.url, scratch.project)
    const session = await api.post("/session", {})
    await api.post(`/session/${session.id}/prompt_async`, {
      agent: "maestro",
      model: { providerID: "test", modelID: "test-model" },
      parts: [{ type: "text", text: "Run the campaign tree." }],
    })
    await api.post("/pty", { command: trees.pty.command, args: trees.pty.args })
    await until(90_000, "the bash and terminal trees", async () =>
      (await remaining(trees.bash.nonce)) === trees.bash.size && (await remaining(trees.pty.nonce)) === trees.pty.size
        ? true
        : undefined,
    )
    const control = { bash: supervised(trees.bash.nonce), pty: supervised(trees.pty.nonce) }
    const supervisors = supervisorsOf([host.pid]).map((row) => row.pid)
    step(`trees live; supervised ${JSON.stringify(control)}; supervisors of ${host.pid}: ${supervisors.join(",")}`)
    if (!control.bash || !control.pty || supervisors.length === 0) throw new Error("positive control failed before supervisor kill")
    for (const pid of supervisors) if (!kill9(pid)) throw new Error(`could not kill supervisor ${pid}`)
    const killed = Date.now()
    step(`kill -9 supervisor(s) ${supervisors.join(",")}`)
    await sleep(8_000)
    const after = { bash: await remaining(trees.bash.nonce), pty: await remaining(trees.pty.nonce) }
    const serverAlive = host.proc.exitCode === null && host.proc.signalCode === null
    step(`8 s later: ${JSON.stringify(after)}; server alive ${serverAlive}`)

    // Recovery: the next spawn must start a new supervisor and run under it.
    const created = Date.now()
    const recovered = await api
      .post("/pty", { command: trees.after.command, args: trees.after.args })
      .then(() =>
        until(30_000, "the tree after the kill", async () =>
          (await remaining(trees.after.nonce)) === trees.after.size ? true : undefined,
        ),
      )
      .then(() => ({ ok: true, ms: Date.now() - created }))
      .catch((error) => ({ ok: false, error: String(error), ms: Date.now() - created }))
    const fresh = supervisorsOf([host.pid]).map((row) => row.pid)
    const newSupervised = recovered.ok && supervised(trees.after.nonce)
    step(`recovery: ${JSON.stringify(recovered)}; supervisors now ${fresh.join(",")}; new tree supervised ${newSupervised}`)

    // Then the host dies: the tree under the new supervisor must go; the orphaned ones are the declared Unix hole.
    if (!kill9(host.pid)) throw new Error(`could not kill host ${host.pid}`)
    await sleep(8_000)
    const afterHost = {
      after: await remaining(trees.after.nonce),
      bash: await remaining(trees.bash.nonce),
      pty: await remaining(trees.pty.nonce),
    }
    step(`8 s after kill -9 of the server: ${JSON.stringify(afterHost)}`)
    const tier = win
      ? { expected: "trees die with their Jobs", matches: after.bash === 0 && after.pty === 0 }
      : {
          expected: "trees keep running, unprotected (declared hole)",
          matches: after.bash === trees.bash.size && after.pty === trees.pty.size,
        }
    return verdict("v3-supervisor", {
      home: scratch.home,
      nonces,
      kpi: "outcome matches GUARANTEES tier; the server recovers on the next spawn",
      supervised: control,
      killedSupervisors: supervisors,
      afterSupervisorKill: after,
      serverAliveAfter: serverAlive,
      tier,
      recovery: { ...recovered, newSupervisors: fresh.filter((pid) => !supervisors.includes(pid)), supervised: newSupervised },
      afterHostKill: afterHost,
      waitedMs: Date.now() - killed,
      pass:
        control.bash &&
        control.pty &&
        tier.matches &&
        serverAlive &&
        recovered.ok &&
        newSupervised &&
        fresh.some((pid) => !supervisors.includes(pid)) &&
        afterHost.after === 0,
      steps,
    })
  } catch (error) {
    return verdict("v3-supervisor", { pass: false, error: String(error).slice(0, 4000), steps })
  } finally {
    llm.stop()
    await cleanup(scratch.home, nonces)
  }
}

if (import.meta.main) {
  const result = await run()
  process.exit(result.pass ? 0 : 1)
}
