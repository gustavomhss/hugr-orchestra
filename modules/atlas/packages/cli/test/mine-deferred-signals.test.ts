import { describe, expect, it } from "vitest"
import { makeRunController, reconcile } from "@atlas/genesis"
import type { HistorySource, MinedSignals } from "@atlas/genesis"
import type { StructRef } from "@atlas/contracts"
import { buildControllerDeps, driveMinePass, GenesisRunError } from "../src/mine.js"
import type { ProposerPool } from "../src/mine-pool.js"
import { depsOf, FRONTIER, injectedHistory, NO_MODEL_ENV, REPO, BASE_SKELETON } from "./mine-fixtures.js"

const exact = (site: StructRef): MinedSignals => ({
  hotspot: FRONTIER.indexOf(site) + 1, szzBugCommits: FRONTIER.indexOf(site) + 2,
  coChanged: [FRONTIER[(FRONTIER.indexOf(site) + 1) % FRONTIER.length]!],
  owners: [`owner:${site.qualifiedPath}`], messages: [`history:${site.qualifiedPath}`],
})
function observed(before?: (site: StructRef) => void) {
  const events: string[] = []
  const history: HistorySource = { ...injectedHistory, signals: (site) => {
    events.push(`signals:${site.qualifiedPath}`)
    before?.(site)
    return exact(site)
  } }
  return { events, history }
}
function caught(action: () => unknown) {
  try { action() } catch (error) { return error }
  return undefined
}

describe("mine hydrates only selected sites before dispatch", () => {
  it("ceiling 1 keeps the full ranked coverage tail, reading only the selected site before its proposer", () => {
    const source = observed()
    const report = driveMinePass(REPO, { ...depsOf({ history: source.history, budget: { ceiling: 1 },
      proposer: { propose: (c) => {
        source.events.push(`propose:${c.site.qualifiedPath}`)
        expect(c.signals).toEqual(exact(c.site))
        return null
      } },
    }), env: NO_MODEL_ENV }).report
    const rows = report.coverage!.sites
    expect(reconcile(report.coverage)).toMatchObject({ planned: 4, abstained: 1, unvisited: 3 })
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4])
    expect(rows.slice(1).map((r) => [r.outcome, r.outcome === "unvisited" && r.cause])).toEqual([
      ["unvisited", "ceiling"], ["unvisited", "ceiling"], ["unvisited", "ceiling"],
    ])
    expect(source.events).toEqual([`signals:${rows[0]!.site.qualifiedPath}`, `propose:${rows[0]!.site.qualifiedPath}`])
  })

  it("incremental rerun hydrates the last ranked file bucket even beyond the original ceiling", () => {
    const source = observed()
    const received: MinedSignals[] = []
    const ports = buildControllerDeps(REPO, { ...depsOf({ history: source.history, budget: { ceiling: 1 },
      proposer: { propose: (c) => {
        source.events.push(`propose:${c.site.qualifiedPath}`)
        received.push(c.signals)
        return null
      } },
    }), env: NO_MODEL_ENV })
    const plan = ports.plan(REPO, "HEAD")
    expect(plan.sites).toHaveLength(4)
    const tail = plan.sites[plan.sites.length - 1]!
    expect(source.events).toEqual([])
    const report = makeRunController({ ...ports, changed: () => ({
      idChanged: true, stateChanged: true, changedBuckets: [tail.site.qualifiedPath.split("::")[0]!],
    }) }).rerun(REPO, "HEAD", BASE_SKELETON)
    expect(received).toEqual([exact(tail.site)])
    expect(source.events).toEqual([`signals:${tail.site.qualifiedPath}`, `propose:${tail.site.qualifiedPath}`])
    expect(report.coverage!.sites.map((r) => r.site)).toEqual([tail.site])
    expect(report.resumeToken).toBeUndefined()
  })

  it("resumes the original interruption token at the contiguous prefix with memoized exact signals", () => {
    const source = observed()
    const attempts: number[] = []
    const received: MinedSignals[] = []
    let interrupted = false
    const ports = buildControllerDeps(REPO, { ...depsOf({ history: source.history, budget: { ceiling: 4 },
      proposer: { propose: (c) => {
        source.events.push(`propose:${c.site.qualifiedPath}`)
        attempts.push(c.rank)
        received.push(c.signals)
        if (c.rank === 2 && !interrupted) { interrupted = true; throw new Error("interrupt once") }
        return null
      } },
    }), env: NO_MODEL_ENV })
    const controller = makeRunController(ports)
    const first = controller.genesis(REPO, "HEAD", { ceiling: 4 })
    expect(first.resumeToken).toEqual({ lastCompletedRank: 1 })
    const rows = first.coverage!.sites
    expect(source.events).toEqual(rows.slice(0, 2).flatMap((r) => [
      `signals:${r.site.qualifiedPath}`, `propose:${r.site.qualifiedPath}`,
    ]))
    const resumed = controller.resume(first.resumeToken!)
    expect(attempts).toEqual([1, 2, 2, 3, 4])
    expect(received).toEqual([rows[0]!, rows[1]!, rows[1]!, rows[2]!, rows[3]!].map((r) => exact(r.site)))
    expect(source.events).toEqual([
      ...rows.slice(0, 2).flatMap((r) => [`signals:${r.site.qualifiedPath}`, `propose:${r.site.qualifiedPath}`]),
      `propose:${rows[1]!.site.qualifiedPath}`,
      ...rows.slice(2).flatMap((r) => [`signals:${r.site.qualifiedPath}`, `propose:${r.site.qualifiedPath}`]),
    ])
    expect(resumed.resumeToken).toBeUndefined()
    expect(reconcile(resumed.coverage)).toMatchObject({ planned: 4, abstained: 4, unvisited: 0, interrupted: 0 })
  })

  it("preserves the governed history refusal before entering any proposer", () => {
    const witness = new Error("history witness")
    witness.name = "GitHistoryError"
    const source = observed(() => { throw witness })
    const entries: string[] = []
    const error = caught(() => driveMinePass(REPO, { ...depsOf({ history: source.history, budget: { ceiling: 1 },
      proposer: { propose: (c) => { entries.push(c.site.qualifiedPath); return null } },
    }), env: NO_MODEL_ENV }))
    expect(error).toBeInstanceOf(GenesisRunError)
    expect(error).toMatchObject({ failure: { name: "GitHistoryError", message: "history witness" } })
    expect(entries).toEqual([])
  })

  it("hydrates every requested pool candidate before pool entry, and refuses the whole batch on history failure", () => {
    // Recording port only: real worker/structured-clone coverage is deliberately lead-owned.
    for (const fail of [false, true]) {
      const witness = new Error("history witness")
      witness.name = "GitHistoryError"
      let blocked = ""
      const source = observed((site) => { if (fail && site.qualifiedPath === blocked) throw witness })
      const faults: Error[] = []
      const received: MinedSignals[][] = []
      const pool: ProposerPool = { close: () => {}, proposeAll: (cands) => {
        source.events.push("pool")
        received.push(cands.map((c) => c.signals))
        return cands.map(() => ({ ok: true, seed: null }))
      } }
      const ports = buildControllerDeps(REPO, { ...depsOf({ history: source.history, budget: { ceiling: 1 } }),
        env: NO_MODEL_ENV,
      }, undefined, { onFault: (error) => { faults.push(error) } }, pool)
      const plan = ports.plan(REPO, "HEAD")
      expect(plan.sites).toHaveLength(4)
      expect(source.events).toEqual([])
      const selected = plan.sites.slice(-2)
      blocked = selected[1]!.site.qualifiedPath
      makeRunController({ ...ports, plan: () => ({ ...plan, sites: selected }) }).genesis(REPO, "HEAD", { ceiling: 2 })
      expect(source.events).toEqual([
        ...selected.map((c) => `signals:${c.site.qualifiedPath}`), ...(fail ? [] : ["pool"]),
      ])
      expect(faults).toHaveLength(fail ? 1 : 0)
      expect(received).toEqual(fail ? [] : [selected.map((c) => exact(c.site))])
      if (fail) {
        expect(faults[0]).toBeInstanceOf(GenesisRunError)
        expect(faults[0]).toMatchObject({ failure: { name: "GitHistoryError", message: "history witness" } })
      }
    }
  })
})
