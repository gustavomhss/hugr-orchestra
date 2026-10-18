// @atlas/cli — test/mine-contention-fixtures.ts  (the child-process harness for the mine contention suite)
//
// Extracted from `mine-contention.test.ts` for the 400-LOC ceiling, along the seam that was already there:
// the CHILD PROGRAM (a template rendered into `node --input-type=module -e`) lives here, the ASSERTIONS live
// in the suite. Nothing here is shared with `mine-fixtures.ts` on purpose — those fixtures are TypeScript
// objects a child process cannot import, so the injected seams below are re-expressed as a JS source string
// over the COMPILED driver (`packages/cli/dist/src/mine.js`). That is the only honest shape: `commitStaging`
// is a compare-and-swap over the FILESYSTEM, and no in-process double can fail a `link(2)` — the same
// reasoning `packages/adapter-io/test/sidecar.test.ts` states for its 8-process leg-1 case, whose shape this
// harness deliberately copies.

import { spawn } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/** The SUT compiled to dist — a child process cannot import the .ts source. */
const HERE = dirname(fileURLToPath(import.meta.url))
export const MINE_DIST = join(HERE, "..", "dist", "src", "mine.js")
export const STORE_DIST = join(HERE, "..", "..", "adapter-io", "dist", "src", "store.js")

/** What one child mine pass reports back — read off the run's OWN `GenesisReport`, never off disk. This is
 *  the pass's CLAIM about what it wrote; the suite's job is to hold that claim against the durable file. */
export interface PassReport {
  readonly seeded: string[] //   the anchor qualifiedPaths the report's grounded set carries
  readonly complete: boolean //  no resumeToken ⇒ the pass ran to its end (GEN-8)
  readonly crashed?: string //   an escaped throw — the controller's totality contract broken, or a spawn fault
}

/** The anchor qualifiedPaths writer `i` mines. These are what `primaryAnchorId` reduces to, so they are also
 *  the values every staged row of writer `i` must carry in `primaryAnchor`. */
export function anchorsOf(i: number, sites: number): string[] {
  return Array.from({ length: sites }, (_, j) => `pkg/w${i}-s${j}.ts::w${i}-s${j}`)
}

/**
 * The child program: ONE `atlas mine` pass over a frontier of `sites` anchors unique to writer `i`, against
 * the REAL `createDiskStore` rooted at `casPath`.
 *
 * DISTINCT ANCHORS PER WRITER ARE LOAD-BEARING. A mined nodeKey is `hash(primaryAnchorId ‖ slot)` and
 * `primaryAnchorId` reduces to the site's `qualifiedPath`, so a SHARED frontier would make every writer mint
 * the SAME keys — and a lost update would then be indistinguishable from an idempotent re-write. With
 * per-writer anchors, every one of the `W × K` rows is a distinct key that either survives or does not.
 */
function childSource(casPath: string, i: number, sites: number): string {
  const anchors = Array.from({ length: sites }, (_, j) => `w${i}-s${j}`)
  return `
    import { driveMine } from ${JSON.stringify(MINE_DIST)};
    import { createDiskStore } from ${JSON.stringify(STORE_DIST)};

    const ANCHORS = ${JSON.stringify(anchors)};
    const struct = (s) => ({ kind: 'symbol', qualifiedPath: 'pkg/' + s + '.ts::' + s, subtreeHash: s });
    const FRONTIER = ANCHORS.map(struct);
    const leaf = (key) => ({ axis: 'dependency', level: 'symbol', key, subtreeHash: key, children: [], objects: [] });
    const axisRoot = () => ({ axis: 'dependency', level: 'repo', key: 'root', subtreeHash: 'root', children: ANCHORS.map(leaf), objects: [] });
    const SKELETON = {
      axes: { spatial: axisRoot(), territory: axisRoot(), dependency: axisRoot(), edges: [] },
      manifest: { territories: [] },
    };
    const ZERO = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] };
    const factFor = (c, claim) => ({
      kind: 'advisory', id: 'nk-' + c.site.qualifiedPath, tier: 'T2', claimNorm: claim,
      grounding: { entries: [{ anchor: c.site, path: c.site.qualifiedPath }] },
      freshness: 'FRESH', claims: [], authoring: 'ADVISORY',
    });
    const OFF = { enabled: false, maxDepth: 0, epsilon: 0 };
    const deps = {
      rev: 'HEAD',
      proposer: { propose: (c) => ({ cand: c, claim: 'P@' + c.site.subtreeHash }) },
      history: { commitCount: () => 5, shallow: () => false, blameConcentration: () => 0, frontier: () => FRONTIER, signals: () => ZERO },
      skeleton: { skeleton: () => SKELETON },
      store: createDiskStore(${JSON.stringify(casPath)}),
      gate: { emit: (seed, c) => ({ emitted: true, fact: factFor(c, seed.claim) }) },
      handoffTo: () => {},
      budget: { ceiling: ANCHORS.length, deepening: { review: OFF, enrich: OFF, expand: OFF } },
    };

    let out;
    try {
      const report = driveMine('contention-repo', deps);
      out = {
        seeded: report.seeded.map((f) => f.grounding.entries[0].anchor.qualifiedPath),
        complete: report.resumeToken === undefined,
      };
    } catch (e) {
      out = { seeded: [], complete: false, crashed: String((e && e.message) || e) };
    }
    console.log('@@' + JSON.stringify(out) + '@@');
  `
}

/** Spawn ONE child mine pass. NEVER rejects: a child that dies is REPORTED, not thrown, so a spawn fault in
 *  one writer cannot be silently mistaken for the lost update this suite exists to catch. */
export function minePass(casPath: string, i: number, sites: number): Promise<PassReport> {
  const src = childSource(casPath, i, sites)
  return new Promise((resolve) => {
    let out = ""
    let err = ""
    const child = spawn(process.execPath, ["--input-type=module", "-e", src], { stdio: ["ignore", "pipe", "pipe"] })
    child.stdout.on("data", (d) => {
      out += String(d)
    })
    child.stderr.on("data", (d) => {
      err += String(d)
    })
    child.on("close", () => {
      const m = /@@(.*)@@/s.exec(out)
      if (m === null) {
        resolve({ seeded: [], complete: false, crashed: (err || out).slice(0, 800) || "child produced no report" })
        return
      }
      resolve(JSON.parse(m[1]!) as PassReport)
    })
  })
}
