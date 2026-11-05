import { Effect } from "effect"
import { BoardGithub } from "@orchestra/core/board/github"

// A stand-in for api.github.com behind the injected `gh` runner. It answers in the shapes `gh api` prints (headers with
// -i, JSON bodies, ETag and 304), keeps the issues it was told about, and records every call.
type Remote = {
  number: number
  node_id: string
  title: string
  body: string
  state: "open" | "closed"
  state_reason: string | null
  updated_at: string
  user: { login: string }
  labels: string[]
  milestone: number | null
  pull_request?: object
}
type Remark = { id: number; issue: number; body: string; login: string; updated_at: string }
type Call = { args: ReadonlyArray<string>; stdin?: string }

export const github = (() => {
  const state = {
    issues: [] as Remote[],
    comments: [] as Remark[],
    labels: [] as string[],
    milestones: [] as { number: number; title: string }[],
    pulls: {} as Record<number, { state: "open" | "closed"; merged: boolean }>,
    runs: [] as { id: number; name: string; status: string | null; run_attempt?: number | null }[],
    historicalRuns: {} as Record<number, { id: number; name: string; status: string | null; run_attempt?: number | null }>,
    runsMalformed: false,
    runsTotal: undefined as number | undefined,
    timing: {} as Record<number, unknown>,
    calls: [] as Call[],
    version: 0,
    stamp: 0,
    notModified: 0,
    mode: "ok" as "ok" | "signed_out" | "rate_limited" | "leak",
  }
  const stamp = () => {
    state.stamp = Math.max(state.stamp + 1000, Date.now() + 1000)
    state.version++
    return new Date(state.stamp).toISOString()
  }
  const json = (value: unknown) => JSON.stringify(value)
  const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: "" })
  const since = (endpoint: string) => Date.parse(new URL(`https://x/${endpoint}`).searchParams.get("since") ?? "") || 0

  const run: BoardGithub.Gh = (args, stdin) =>
    Effect.sync(() => {
      state.calls.push({ args, stdin })
      if (state.mode === "signed_out")
        return { exitCode: 4, stdout: "", stderr: "To get started with GitHub CLI, please run:  gh auth login\n" }
      if (state.mode === "rate_limited") return { exitCode: 1, stdout: "", stderr: "gh: API rate limit exceeded (HTTP 429)\n" }
      if (state.mode === "leak")
        return { exitCode: 1, stdout: "", stderr: "gh: boom with ghp_abcdefghijklmnop1234 and github_pat_abcdefghij1234567\n" }

      if (args[0] === "api" && args[1] === "-i") {
        const endpoint = args[2]
        const etag = `W/"${state.version}"`
        const match = args[3] === "-H" && args[4] === `If-None-Match: ${etag}`
        const head = `HTTP/2.0 200 OK\r\nContent-Type: application/json\r\nEtag: ${etag}\r\n\r\n`
        if (match) {
          state.notModified++
          return ok("HTTP/2.0 304 Not Modified\r\n\r\n")
        }
        const pull = /\/pulls\/(\d+)$/.exec(endpoint)
        if (pull) {
          const found = state.pulls[Number(pull[1])]
          if (!found) return { exitCode: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)" }
          return ok(head + json({ head: { sha: `sha${pull[1]}` }, ...found }))
        }
        if (endpoint.includes("/actions/runs?")) {
          const page = Number(new URL(`https://x/${endpoint}`).searchParams.get("page") ?? 1)
          return ok(head + json(state.runsMalformed ? {} : { total_count: state.runsTotal ?? state.runs.length, workflow_runs: state.runs.slice((page - 1) * 100, page * 100) }))
        }
        const run = /\/actions\/runs\/(\d+)$/.exec(endpoint)
        if (run) return ok(head + json(state.historicalRuns[Number(run[1])] ?? state.runs.find((item) => item.id === Number(run[1]))))
        const timing = /\/actions\/runs\/(\d+)\/timing$/.exec(endpoint)
        if (timing) return ok(head + json(state.timing[Number(timing[1])] ?? {}))
        const single = /\/issues\/(\d+)$/.exec(endpoint)
        if (single) return ok(head + json(wire(state.issues.find((item) => item.number === Number(single[1])))))
        if (endpoint.includes("/issues/comments?"))
          return ok(
            head +
              json(
                state.comments
                  .filter((item) => Date.parse(item.updated_at) >= since(endpoint))
                  .map((item) => ({
                    id: item.id,
                    issue_url: `https://api.github.com/repos/acme/widgets/issues/${item.issue}`,
                    body: item.body,
                    updated_at: item.updated_at,
                    user: { login: item.login },
                  })),
              ),
          )
        return ok(head + json(state.issues.filter((item) => Date.parse(item.updated_at) >= since(endpoint)).map(wire)))
      }

      const method = args[2]
      const endpoint = args[3] ?? ""
      const input = stdin ? JSON.parse(stdin) : {}
      if (method === "POST" && endpoint.endsWith("/labels")) {
        state.labels.push(input.name)
        return ok(json({ name: input.name }))
      }
      if (method === "POST" && endpoint.endsWith("/milestones")) {
        const made = { number: state.milestones.length + 1, title: input.title }
        state.milestones.push(made)
        return ok(json(made))
      }
      if (method === "POST" && endpoint.endsWith("/issues")) {
        const made: Remote = {
          number: state.issues.length + 1,
          node_id: `I_${state.issues.length + 1}`,
          title: input.title,
          body: input.body,
          state: "open",
          state_reason: null,
          updated_at: stamp(),
          user: { login: "orchestra" },
          labels: input.labels ?? [],
          milestone: input.milestone ?? null,
        }
        state.issues.push(made)
        return ok(json({ number: made.number, node_id: made.node_id }))
      }
      const patch = /\/issues\/(\d+)$/.exec(endpoint)
      if (method === "PATCH" && patch) {
        const target = state.issues.find((item) => item.number === Number(patch[1]))
        if (!target) return { exitCode: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)" }
        Object.assign(target, {
          title: input.title ?? target.title,
          body: input.body ?? target.body,
          state: input.state ?? target.state,
          state_reason: input.state_reason ?? null,
          labels: input.labels ?? target.labels,
          milestone: input.milestone ?? null,
          updated_at: stamp(),
        })
        return ok(json({ number: target.number }))
      }
      return { exitCode: 1, stdout: "", stderr: `fake gh does not know ${args.join(" ")}` }
    })

  return {
    state,
    run,
    reset() {
      Object.assign(state, {
        issues: [],
        comments: [],
        labels: [],
        milestones: [],
        pulls: {},
        runs: [],
        historicalRuns: {},
        runsMalformed: false,
        runsTotal: undefined,
        timing: {},
        calls: [],
        version: 0,
        notModified: 0,
        mode: "ok",
      })
    },
    /** Someone else opens an issue. */
    open(input: Partial<Remote> & { title: string }) {
      const made: Remote = {
        number: state.issues.length + 1,
        node_id: `I_${state.issues.length + 1}`,
        body: "",
        state: "open",
        state_reason: null,
        updated_at: stamp(),
        user: { login: "someone" },
        labels: [],
        milestone: null,
        ...input,
      }
      state.issues.push(made)
      return made.number
    },
    comment(issue: number, login: string, body: string) {
      state.comments.push({ id: 9000 + state.comments.length, issue, body, login, updated_at: stamp() })
    },
    edit(number: number, fields: Partial<Remote>) {
      Object.assign(remote(number), fields, { updated_at: stamp() })
    },
    writes: () => state.calls.filter((call) => call.args[1] === "-X").map((call) => `${call.args[2]} ${call.args[3]}`),
  }

  function remote(number: number) {
    const found = state.issues.find((item) => item.number === number)
    if (!found) throw new Error(`no remote issue ${number}`)
    return found
  }
  function wire(item: Remote | undefined) {
    return item && { ...item, labels: item.labels.map((name) => ({ name })) }
  }
})()
